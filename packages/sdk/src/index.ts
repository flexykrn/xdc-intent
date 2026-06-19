import { ethers } from 'ethers';
import {
  EscrowABI,
  PaymentVerifierABI,
  IntentRegistryABI,
  CreateIntentSchema,
  FulfillIntentSchema,
  PaymentProofSchema,
  IntentInputSchema,
  CreateIntentInput,
  FulfillIntentInput,
  PaymentProof,
  IntentInput,
  IntentStatus,
  CHAIN_IDS,
  CONTRACT_ADDRESSES,
  getUserFriendlyError,
} from './constants';

export interface XDCIntentSDKConfig {
  provider: ethers.Provider;
  signer?: ethers.Signer;
  chainId: number;
  contractAddresses?: {
    escrow: string;
    paymentVerifier: string;
    intentRegistry: string;
  };
  webSocketUrl?: string;
  pollingInterval?: number;
}

export interface Intent {
  intentId: string;
  user: string;
  token: string;
  amount: bigint;
  expiry: number;
  status: IntentStatus;
  solver: string;
  createdAt: number;
  fulfilledAt: number;
  cancelledAt: number;
  expiredAt: number;
}

export interface SignedIntent {
  intent: IntentInput;
  intentId: string;
  signature: string;
}

export interface EventFilter {
  fromBlock?: number;
  toBlock?: number;
}

export interface CostEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  gasCost: bigint;
  protocolFee: bigint;
  totalCost: bigint;
  totalCostUsd: number;
}

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface EventWatcher {
  unsubscribe: () => void;
  isActive: () => boolean;
}

export class XDCIntentSDK {
  private provider: ethers.Provider;
  private wsProvider?: ethers.WebSocketProvider;
  private signer?: ethers.Signer;
  private chainId: number;
  private addresses: { escrow: string; paymentVerifier: string; intentRegistry: string };
  private listeners: Map<string, any> = new Map();
  private activeWatchers: Set<string> = new Set();
  private pollingInterval: number;

  public escrow: ethers.Contract;
  public paymentVerifier: ethers.Contract;
  public intentRegistry: ethers.Contract;

  constructor(config: XDCIntentSDKConfig) {
    this.provider = config.provider;
    this.signer = config.signer;
    this.chainId = config.chainId;
    this.pollingInterval = config.pollingInterval || 5000;

    const defaultAddresses = CONTRACT_ADDRESSES[config.chainId];
    if (!defaultAddresses && !config.contractAddresses) {
      throw new Error(`No contract addresses for chainId ${config.chainId}. Please provide contractAddresses in config.`);
    }

    this.addresses = config.contractAddresses || defaultAddresses!;

    // Initialize WebSocket provider if URL provided
    if (config.webSocketUrl) {
      try {
        this.wsProvider = new ethers.WebSocketProvider(config.webSocketUrl);
      } catch (error) {
        console.warn('WebSocket connection failed, falling back to HTTP polling');
      }
    }

    const contractProvider = this.wsProvider || this.provider;

    this.escrow = new ethers.Contract(this.addresses.escrow, EscrowABI, contractProvider);
    this.paymentVerifier = new ethers.Contract(this.addresses.paymentVerifier, PaymentVerifierABI, contractProvider);
    this.intentRegistry = new ethers.Contract(this.addresses.intentRegistry, IntentRegistryABI, contractProvider);

    if (this.signer) {
      this.escrow = this.escrow.connect(this.signer) as ethers.Contract;
      this.paymentVerifier = this.paymentVerifier.connect(this.signer) as ethers.Contract;
      this.intentRegistry = this.intentRegistry.connect(this.signer) as ethers.Contract;
    }
  }

  // ========== Chain ID Detection ==========

  async checkChainId(): Promise<void> {
    const network = await this.provider.getNetwork();
    const currentChainId = Number(network.chainId);
    if (currentChainId !== this.chainId) {
      throw new Error(
        `Wrong network. Expected chain ID ${this.chainId}, but connected to ${currentChainId}. ` +
        `Please switch to ${this.chainId === CHAIN_IDS.XDC_MAINNET ? 'XDC Mainnet' : 'XDC Apothem Testnet'}.`
      );
    }
  }

  // ========== Address Normalization ==========

  static normalizeAddress(address: string): string {
    if (address.toLowerCase().startsWith('xdc')) {
      return '0x' + address.slice(3);
    }
    return address.toLowerCase();
  }

  static isXDCAddress(address: string): boolean {
    return address.toLowerCase().startsWith('xdc') || address.toLowerCase().startsWith('0x');
  }

  // ========== Intent ID Generation ==========

  static generateIntentId(): string {
    return ethers.keccak256(ethers.randomBytes(32));
  }

  static computeIntentId(
    user: string,
    token: string,
    amount: bigint,
    expiry: number,
    nonce: number
  ): string {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint256', 'uint256', 'uint256'],
        [user, token, amount, expiry, nonce]
      )
    );
  }

  // ========== Intent Creation ==========

  async createIntent(input: CreateIntentInput): Promise<ethers.TransactionResponse> {
    await this.checkChainId();
    const validated = CreateIntentSchema.parse(input);
    const amount = typeof validated.amount === 'string' ? ethers.parseEther(validated.amount) : validated.amount;

    return this.submitWithRetry(() =>
      this.intentRegistry.createIntent(
        validated.intentId,
        validated.token,
        amount,
        validated.expiry
      )
    );
  }

  async createIntentBatch(inputs: IntentInput[], nonce?: number): Promise<SignedIntent[]> {
    await this.checkChainId();
    
    if (!this.signer) {
      throw new Error('Signer required for batch intent creation');
    }

    const signerAddress = await this.signer.getAddress();
    const currentNonce = nonce || Math.floor(Date.now() / 1000);
    const signedIntents: SignedIntent[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const validated = IntentInputSchema.parse(inputs[i]);
      const amount = typeof validated.amount === 'string' ? ethers.parseEther(validated.amount) : validated.amount;
      
      const intentId = XDCIntentSDK.computeIntentId(
        signerAddress,
        validated.token,
        amount,
        validated.expiry,
        currentNonce + i
      );

      const signature = await this.signIntent({
        intentId,
        token: validated.token,
        amount,
        expiry: validated.expiry,
      });

      signedIntents.push({
        intent: validated,
        intentId,
        signature,
      });
    }

    return signedIntents;
  }

  // ========== EIP-712 Signing ==========

  async signIntent(intent: {
    intentId: string;
    token: string;
    amount: bigint;
    expiry: number;
  }): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for intent signing');
    }

    const domain = {
      name: 'XDCIntent',
      version: '1',
      chainId: this.chainId,
      verifyingContract: this.addresses.intentRegistry,
    };

    const types = {
      Intent: [
        { name: 'intentId', type: 'bytes32' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
      ],
    };

    return this.signer.signTypedData(domain, types, intent);
  }

  // ========== Payment Proof ==========

  async createPaymentProof(
    intentId: string,
    solver: string,
    token: string,
    amount: bigint,
    protocolFee: bigint,
    expiryTimestamp: number
  ): Promise<PaymentProof> {
    return {
      intentId,
      solver,
      token,
      amount,
      protocolFee,
      expiryTimestamp,
      chainId: this.chainId,
    };
  }

  async signPaymentProof(proof: PaymentProof, signer: ethers.Signer): Promise<string> {
    const validated = PaymentProofSchema.parse(proof);

    const domain = {
      name: 'XDCIntentPayment',
      version: '1',
      chainId: this.chainId,
      verifyingContract: this.addresses.paymentVerifier,
    };

    const types = {
      PaymentProof: [
        { name: 'intentId', type: 'bytes32' },
        { name: 'solver', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'protocolFee', type: 'uint256' },
        { name: 'expiryTimestamp', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
      ],
    };

    return signer.signTypedData(domain, types, validated);
  }

  // ========== Fulfillment ==========

  async fulfillIntent(input: FulfillIntentInput): Promise<ethers.TransactionResponse> {
    await this.checkChainId();
    const validated = FulfillIntentSchema.parse(input);
    return this.submitWithRetry(() =>
      this.intentRegistry.fulfillIntent(
        validated.intentId,
        validated.solver,
        validated.paymentProof,
        validated.signature
      )
    );
  }

  // ========== Cancellation ==========

  async cancelIntent(intentId: string): Promise<ethers.TransactionResponse> {
    await this.checkChainId();
    
    // Validate intent exists and is pending
    const intent = await this.getIntent(intentId);
    if (intent.status !== IntentStatus.Pending) {
      throw new Error('Intent is not pending. Only pending intents can be cancelled.');
    }

    if (!this.signer) {
      throw new Error('Signer required for cancellation');
    }

    const signerAddress = await this.signer.getAddress();
    if (signerAddress.toLowerCase() !== intent.user.toLowerCase()) {
      throw new Error('Only the intent owner can cancel this intent.');
    }

    return this.submitWithRetry(() => this.intentRegistry.cancelIntent(intentId));
  }

  async expireIntent(intentId: string): Promise<ethers.TransactionResponse> {
    await this.checkChainId();
    
    // Validate intent exists and is pending
    const intent = await this.getIntent(intentId);
    if (intent.status !== IntentStatus.Pending) {
      throw new Error('Intent is not pending. Only pending intents can be expired.');
    }

    const block = await this.provider.getBlock('latest');
    if (block!.timestamp <= intent.expiry) {
      throw new Error(`Intent has not expired yet. Current block time: ${block!.timestamp}, expiry: ${intent.expiry}`);
    }

    return this.submitWithRetry(() => this.intentRegistry.expireIntent(intentId));
  }

  // ========== View Functions ==========

  async getIntent(intentId: string): Promise<Intent> {
    const result = await this.intentRegistry.getIntent(intentId);
    return {
      intentId: result[0],
      user: result[1],
      token: result[2],
      amount: result[3],
      expiry: Number(result[4]),
      status: result[5],
      solver: result[6],
      createdAt: Number(result[7]),
      fulfilledAt: Number(result[8]),
      cancelledAt: Number(result[9]),
      expiredAt: Number(result[10]),
    };
  }

  async getUserIntents(user: string): Promise<string[]> {
    return this.intentRegistry.getUserIntents(user);
  }

  async getSolverIntents(solver: string): Promise<string[]> {
    return this.intentRegistry.getSolverIntents(solver);
  }

  async isIntentPending(intentId: string): Promise<boolean> {
    return this.intentRegistry.isIntentPending(intentId);
  }

  async getEscrowBalance(token: string, user: string, intentId: string): Promise<bigint> {
    return this.escrow.getBalance(token, user, intentId);
  }

  async getTotalIntents(): Promise<bigint> {
    return this.intentRegistry.totalIntents();
  }

  async getTotalIntentsFulfilled(): Promise<bigint> {
    return this.intentRegistry.totalIntentsFulfilled();
  }

  // ========== Fee Estimation ==========

  async estimateIntentCost(
    token: string,
    amount: bigint,
    gasPrice?: bigint
  ): Promise<CostEstimate> {
    const feeData = await this.provider.getFeeData();
    const currentGasPrice = gasPrice || feeData.gasPrice || 25000000000n;
    
    // Estimate gas for createIntent
    const gasLimit = 400000n; // Based on testnet measurements
    const gasCost = gasLimit * currentGasPrice;
    
    // Get protocol fee
    const protocolFee = await this.escrow.calculateProtocolFee(amount);
    
    // Convert to USD (using static rate for v1: 1 XDC = $0.03)
    const xdcPriceUsd = 0.03;
    const totalXdc = Number(ethers.formatEther(gasCost + protocolFee));
    const totalCostUsd = totalXdc * xdcPriceUsd;
    
    return {
      gasLimit,
      gasPrice: currentGasPrice,
      gasCost,
      protocolFee,
      totalCost: gasCost + protocolFee,
      totalCostUsd,
    };
  }

  // ========== Event Watching with WebSocket + Polling Fallback ==========

  watchIntents(
    callback: (intentId: string, user: string, token: string, amount: bigint, expiry: number) => void,
    filter?: EventFilter
  ): EventWatcher {
    const watcherId = `intent-created-${Date.now()}`;
    this.activeWatchers.add(watcherId);

    if (this.wsProvider) {
      // Use WebSocket for real-time events
      const eventFilter = this.intentRegistry.filters.IntentCreated();
      const listener = (intentId: string, user: string, token: string, amount: bigint, expiry: number) => {
        if (this.activeWatchers.has(watcherId)) {
          callback(intentId, user, token, amount, expiry);
        }
      };

      this.intentRegistry.on(eventFilter, listener);
      this.listeners.set(watcherId, { type: 'websocket', listener, filter: eventFilter });

      return {
        unsubscribe: () => {
          this.intentRegistry.off(eventFilter, listener);
          this.activeWatchers.delete(watcherId);
          this.listeners.delete(watcherId);
        },
        isActive: () => this.activeWatchers.has(watcherId),
      };
    } else {
      // Fallback to polling
      let lastBlock = filter?.fromBlock || -1;
      const intervalId = setInterval(async () => {
        if (!this.activeWatchers.has(watcherId)) return;
        
        try {
          const currentBlock = await this.provider.getBlockNumber();
          if (lastBlock === -1) {
            lastBlock = currentBlock - 10; // Start from 10 blocks ago
          }
          
          if (currentBlock > lastBlock) {
            const events = await this.intentRegistry.queryFilter(
              this.intentRegistry.filters.IntentCreated(),
              lastBlock + 1,
              currentBlock
            );
            
            for (const event of events) {
              const eventLog = event as any;
              if (eventLog.args) {
                callback(
                  eventLog.args.intentId,
                  eventLog.args.user,
                  eventLog.args.token,
                  eventLog.args.amount,
                  eventLog.args.expiry
                );
              }
            }
            
            lastBlock = currentBlock;
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, this.pollingInterval);

      this.listeners.set(watcherId, { type: 'polling', intervalId });

      return {
        unsubscribe: () => {
          clearInterval(intervalId);
          this.activeWatchers.delete(watcherId);
          this.listeners.delete(watcherId);
        },
        isActive: () => this.activeWatchers.has(watcherId),
      };
    }
  }

  watchFulfillments(
    callback: (intentId: string, solver: string, protocolFee: bigint, fulfilledAt: number) => void,
    filter?: EventFilter
  ): EventWatcher {
    const watcherId = `intent-fulfilled-${Date.now()}`;
    this.activeWatchers.add(watcherId);

    if (this.wsProvider) {
      const eventFilter = this.intentRegistry.filters.IntentFulfilled();
      const listener = (intentId: string, solver: string, protocolFee: bigint, fulfilledAt: number) => {
        if (this.activeWatchers.has(watcherId)) {
          callback(intentId, solver, protocolFee, fulfilledAt);
        }
      };

      this.intentRegistry.on(eventFilter, listener);
      this.listeners.set(watcherId, { type: 'websocket', listener, filter: eventFilter });

      return {
        unsubscribe: () => {
          this.intentRegistry.off(eventFilter, listener);
          this.activeWatchers.delete(watcherId);
          this.listeners.delete(watcherId);
        },
        isActive: () => this.activeWatchers.has(watcherId),
      };
    } else {
      // Fallback to polling
      let lastBlock = filter?.fromBlock || -1;
      const intervalId = setInterval(async () => {
        if (!this.activeWatchers.has(watcherId)) return;
        
        try {
          const currentBlock = await this.provider.getBlockNumber();
          if (lastBlock === -1) {
            lastBlock = currentBlock - 10;
          }
          
          if (currentBlock > lastBlock) {
            const events = await this.intentRegistry.queryFilter(
              this.intentRegistry.filters.IntentFulfilled(),
              lastBlock + 1,
              currentBlock
            );
            
            for (const event of events) {
              const eventLog = event as any;
              if (eventLog.args) {
                callback(
                  eventLog.args.intentId,
                  eventLog.args.solver,
                  eventLog.args.protocolFee,
                  eventLog.args.fulfilledAt
                );
              }
            }
            
            lastBlock = currentBlock;
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, this.pollingInterval);

      this.listeners.set(watcherId, { type: 'polling', intervalId });

      return {
        unsubscribe: () => {
          clearInterval(intervalId);
          this.activeWatchers.delete(watcherId);
          this.listeners.delete(watcherId);
        },
        isActive: () => this.activeWatchers.has(watcherId),
      };
    }
  }

  watchCancellations(
    callback: (intentId: string, user: string, refundedAmount: bigint, cancelledAt: number) => void
  ): EventWatcher {
    const watcherId = `intent-cancelled-${Date.now()}`;
    this.activeWatchers.add(watcherId);

    if (this.wsProvider) {
      const eventFilter = this.intentRegistry.filters.IntentCancelled();
      const listener = (intentId: string, user: string, refundedAmount: bigint, cancelledAt: number) => {
        if (this.activeWatchers.has(watcherId)) {
          callback(intentId, user, refundedAmount, cancelledAt);
        }
      };

      this.intentRegistry.on(eventFilter, listener);
      this.listeners.set(watcherId, { type: 'websocket', listener, filter: eventFilter });

      return {
        unsubscribe: () => {
          this.intentRegistry.off(eventFilter, listener);
          this.activeWatchers.delete(watcherId);
          this.listeners.delete(watcherId);
        },
        isActive: () => this.activeWatchers.has(watcherId),
      };
    } else {
      // Fallback to polling
      let lastBlock = -1;
      const intervalId = setInterval(async () => {
        if (!this.activeWatchers.has(watcherId)) return;
        
        try {
          const currentBlock = await this.provider.getBlockNumber();
          if (lastBlock === -1) {
            lastBlock = currentBlock - 10;
          }
          
          if (currentBlock > lastBlock) {
            const events = await this.intentRegistry.queryFilter(
              this.intentRegistry.filters.IntentCancelled(),
              lastBlock + 1,
              currentBlock
            );
            
            for (const event of events) {
              const eventLog = event as any;
              if (eventLog.args) {
                callback(
                  eventLog.args.intentId,
                  eventLog.args.user,
                  eventLog.args.refundedAmount,
                  eventLog.args.cancelledAt
                );
              }
            }
            
            lastBlock = currentBlock;
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, this.pollingInterval);

      this.listeners.set(watcherId, { type: 'polling', intervalId });

      return {
        unsubscribe: () => {
          clearInterval(intervalId);
          this.activeWatchers.delete(watcherId);
          this.listeners.delete(watcherId);
        },
        isActive: () => this.activeWatchers.has(watcherId),
      };
    }
  }

  async pollIntents(
    userAddress?: string,
    fromBlock?: number,
    toBlock?: number
  ): Promise<Intent[]> {
    const filter = this.intentRegistry.filters.IntentCreated(userAddress);
    const events = await this.intentRegistry.queryFilter(filter, fromBlock, toBlock);
    
    const intents: Intent[] = [];
    for (const event of events) {
      const eventLog = event as any;
      const intentId = eventLog.args?.intentId;
      if (intentId) {
        const intent = await this.getIntent(intentId);
        intents.push(intent);
      }
    }
    
    return intents;
  }

  cleanupAllListeners(): void {
    this.intentRegistry.removeAllListeners();
    this.listeners.forEach((listener, id) => {
      if (listener.type === 'polling') {
        clearInterval(listener.intervalId);
      }
    });
    this.listeners.clear();
    this.activeWatchers.clear();
  }

  // ========== Transaction Retry ==========

  async submitWithRetry<T>(
    txFn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 3;
    const delayMs = options.delayMs || 1000;
    
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await txFn();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on permanent errors
        if (this.isPermanentError(error)) {
          throw new Error(getUserFriendlyError(error.message) || error.message);
        }
        
        // Call retry callback if provided
        if (options.onRetry) {
          options.onRetry(attempt + 1, error);
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < maxRetries - 1) {
          const waitTime = delayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    throw new Error(getUserFriendlyError(lastError!.message) || lastError!.message);
  }

  private isPermanentError(error: any): boolean {
    const permanentErrors = [
      'INSUFFICIENT_FUNDS',
      'INVALID_SIGNATURE',
      'REPLACEMENT_UNDERPRICED',
      'UNPREDICTABLE_GAS_LIMIT',
      'IntentRegistry: not intent owner',
      'IntentRegistry: not pending',
      'Escrow: token not supported',
    ];
    
    return permanentErrors.some(err => error.message?.includes(err));
  }

  // ========== Error Recovery ==========

  async recover<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (this.isTransientError(error)) {
        return this.submitWithRetry(operation, options);
      }
      throw error;
    }
  }

  private isTransientError(error: any): boolean {
    const transientErrors = [
      'NETWORK_ERROR',
      'TIMEOUT',
      'NONCE_EXPIRED',
      'SERVER_ERROR',
      'ETIMEDOUT',
      'ECONNREFUSED',
    ];
    
    return transientErrors.some(err => error.message?.includes(err));
  }

  getUserMessage(error: Error): string {
    return getUserFriendlyError(error.message) || error.message;
  }

  // ========== Admin Functions ==========

  async setEscrow(newEscrow: string): Promise<ethers.TransactionResponse> {
    return this.intentRegistry.setEscrow(newEscrow);
  }

  async setPaymentVerifier(newVerifier: string): Promise<ethers.TransactionResponse> {
    return this.intentRegistry.setPaymentVerifier(newVerifier);
  }

  async addSupportedToken(token: string): Promise<ethers.TransactionResponse> {
    return this.escrow.addSupportedToken(token);
  }

  async removeSupportedToken(token: string): Promise<ethers.TransactionResponse> {
    return this.escrow.removeSupportedToken(token);
  }

  async addSigner(signer: string): Promise<ethers.TransactionResponse> {
    return this.paymentVerifier.addSigner(signer);
  }

  async removeSigner(signer: string): Promise<ethers.TransactionResponse> {
    return this.paymentVerifier.removeSigner(signer);
  }

  async pause(): Promise<ethers.TransactionResponse> {
    return this.intentRegistry.pause();
  }

  async unpause(): Promise<ethers.TransactionResponse> {
    return this.intentRegistry.unpause();
  }

  // ========== Utility ==========

  static parseEther(amount: string): bigint {
    return ethers.parseEther(amount);
  }

  static formatEther(amount: bigint): string {
    return ethers.formatEther(amount);
  }

  getAddresses(): { escrow: string; paymentVerifier: string; intentRegistry: string } {
    return { ...this.addresses };
  }

  isWebSocketConnected(): boolean {
    return !!this.wsProvider;
  }
}

export { IntentStatus, CHAIN_IDS, CONTRACT_ADDRESSES, getUserFriendlyError };
export type {
  CreateIntentInput,
  FulfillIntentInput,
  PaymentProof,
  IntentInput,
  Intent as IntentInfo,
  CostEstimate as IntentCostEstimate,
  RetryOptions as IntentRetryOptions,
  EventWatcher as IntentEventWatcher,
};
