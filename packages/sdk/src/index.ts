import { ethers } from 'ethers';
import {
  IntentParams,
  SignedIntent,
  IntentStatus,
  PaymentProofRequest,
} from '@xdc-intent/types';
import { CHAIN_IDS, CAIP2, CONTRACT_ADDRESSES } from '@xdc-intent/constants';
import { deriveIntentId, normalizeAddress, getUserFriendlyError, isXDCAddress } from '@xdc-intent/utils';

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

export interface Intent extends IntentParams {
  intentId: string;
  user: string;
  status: IntentStatus;
  solver: string;
  fulfilledAmount: bigint;
  paymentTxHash: string;
  signature: string;
}

export { IntentParams, SignedIntent, IntentStatus, PaymentProofRequest };

export { ethers };

export interface EventFilter {
  fromBlock?: number;
  toBlock?: number;
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
      throw new Error(`No contract addresses for chainId ${config.chainId}`);
    }

    this.addresses = config.contractAddresses || defaultAddresses!;

    if (config.webSocketUrl) {
      try {
        this.wsProvider = new ethers.WebSocketProvider(config.webSocketUrl);
      } catch {
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

  async checkChainId(): Promise<void> {
    const network = await this.provider.getNetwork();
    const currentChainId = Number(network.chainId);
    if (currentChainId !== this.chainId) {
      throw new Error(
        `Wrong network. Expected chain ID ${this.chainId}, connected to ${currentChainId}.`
      );
    }
  }

  static normalizeAddress(address: string): string {
    return normalizeAddress(address);
  }

  static isXDCAddress(address: string): boolean {
    return isXDCAddress(address);
  }

  static deriveIntentId(user: string, params: IntentParams): string {
    return deriveIntentId(user, {
      sourceChainId: params.sourceChainId,
      sourceToken: params.sourceToken,
      sourceAmount: params.sourceAmount,
      destChainId: params.destChainId,
      destToken: params.destToken,
      minDestAmount: params.minDestAmount,
      maxSolverFee: params.maxSolverFee,
      expiry: params.expiry,
      nonce: params.nonce,
    });
  }

  createIntent(params: IntentParams): SignedIntent {
    if (!this.signer) throw new Error('Signer required');
    const signerAddress = this.signer.getAddress();
    // We need the address synchronously for ID derivation; callers should pass user address.
    // For now, deriveIntentId requires an address. We will compute it asynchronously in signAndSubmit.
    throw new Error('Use createAndSubmitIntent or signIntent with a signer address');
  }

  async createAndSubmitIntent(params: IntentParams): Promise<{ intentId: string; txHash: string }> {
    if (!this.signer) throw new Error('Signer required');
    await this.checkChainId();

    const user = await this.signer.getAddress();
    const signed = await this.signIntent(user, params);
    const tx = await this.submitIntent(signed);
    return { intentId: signed.intentId, txHash: tx.hash };
  }

  async signIntent(user: string, params: IntentParams): Promise<SignedIntent> {
    const intentId = deriveIntentId(user, {
      sourceChainId: params.sourceChainId,
      sourceToken: params.sourceToken,
      sourceAmount: params.sourceAmount,
      destChainId: params.destChainId,
      destToken: params.destToken,
      minDestAmount: params.minDestAmount,
      maxSolverFee: params.maxSolverFee,
      expiry: params.expiry,
      nonce: params.nonce,
    });

    const domain = {
      name: 'XDCIntents',
      version: '1',
      chainId: this.chainId,
      verifyingContract: this.addresses.intentRegistry,
    };

    const types = {
      Intent: [
        { name: 'sourceChainId', type: 'uint256' },
        { name: 'sourceToken', type: 'address' },
        { name: 'sourceAmount', type: 'uint256' },
        { name: 'destChainId', type: 'uint256' },
        { name: 'destToken', type: 'address' },
        { name: 'minDestAmount', type: 'uint256' },
        { name: 'maxSolverFee', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
    };

    const signature = await this.signer!.signTypedData(domain, types, {
      sourceChainId: params.sourceChainId,
      sourceToken: params.sourceToken,
      sourceAmount: params.sourceAmount,
      destChainId: params.destChainId,
      destToken: params.destToken,
      minDestAmount: params.minDestAmount,
      maxSolverFee: params.maxSolverFee,
      expiry: params.expiry,
      nonce: params.nonce,
    });

    return { params, intentId, signature };
  }

  async submitIntent(signed: SignedIntent): Promise<ethers.TransactionResponse> {
    await this.checkChainId();
    const params = signed.params;
    return this.submitWithRetry(() =>
      this.intentRegistry.submitIntent(
        {
          sourceChainId: params.sourceChainId,
          sourceToken: params.sourceToken,
          sourceAmount: params.sourceAmount,
          destChainId: params.destChainId,
          destToken: params.destToken,
          minDestAmount: params.minDestAmount,
          maxSolverFee: params.maxSolverFee,
          expiry: params.expiry,
          nonce: params.nonce,
          allowedSolvers: params.allowedSolvers || [],
        },
        signed.signature
      )
    );
  }

  async cancelIntent(intentId: string): Promise<ethers.TransactionResponse> {
    await this.checkChainId();
    return this.submitWithRetry(() => this.intentRegistry.cancelIntent(intentId));
  }

  async cancelExpiredIntents(intentIds: string[]): Promise<ethers.TransactionResponse> {
    await this.checkChainId();
    return this.submitWithRetry(() => this.intentRegistry.cancelExpiredIntents(intentIds));
  }

  async fulfillIntent(
    intentId: string,
    destAmount: bigint,
    paymentTxHash: string
  ): Promise<ethers.TransactionResponse> {
    await this.checkChainId();
    return this.submitWithRetry(() => this.intentRegistry.fulfillIntent(intentId, destAmount, paymentTxHash));
  }

  async getIntent(intentId: string): Promise<Intent> {
    const result = await this.intentRegistry.getIntent(intentId);
    return {
      intentId: result.intentId,
      user: result.user,
      sourceChainId: result.sourceChainId,
      sourceToken: result.sourceToken,
      sourceAmount: result.sourceAmount,
      destChainId: result.destChainId,
      destToken: result.destToken,
      minDestAmount: result.minDestAmount,
      maxSolverFee: result.maxSolverFee,
      expiry: Number(result.expiry),
      nonce: result.nonce,
      signature: result.signature,
      allowedSolvers: result.allowedSolvers,
      status: Number(result.status) as IntentStatus,
      solver: result.solver,
      fulfilledAmount: result.fulfilledAmount,
      paymentTxHash: result.paymentTxHash,
    };
  }

  async getUserNonce(address: string): Promise<bigint> {
    await this.checkChainId();
    return this.intentRegistry.getUserNonce(address);
  }

  async getPaymentProofRequest(
    intentId: string,
    recipient: string
  ): Promise<PaymentProofRequest> {
    const intent = await this.getIntent(intentId);
    const nonce = ethers.keccak256(ethers.randomBytes(32));
    return {
      intentId,
      amount: intent.maxSolverFee.toString(),
      asset: intent.sourceToken,
      recipient,
      network: CAIP2[this.chainId] || `eip155:${this.chainId}`,
      nonce,
      deadline: intent.expiry,
    };
  }

  watchIntents(callback: (intent: Intent) => void, filter?: EventFilter): EventWatcher {
    return this.watchEvent(
      'IntentSubmitted',
      this.intentRegistry.filters.IntentSubmitted(),
      async (intentId: string) => {
        const intent = await this.getIntent(intentId);
        callback(intent);
      },
      filter
    );
  }

  watchFulfillments(
    callback: (intentId: string, solver: string, destAmount: bigint, paymentTxHash: string) => void,
    filter?: EventFilter
  ): EventWatcher {
    return this.watchEvent(
      'IntentFulfilled',
      this.intentRegistry.filters.IntentFulfilled(),
      (intentId: string, solver: string, destAmount: bigint, paymentTxHash: string) => {
        callback(intentId, solver, destAmount, paymentTxHash);
      },
      filter
    );
  }

  private watchEvent(
    name: string,
    eventFilter: any,
    handler: (...args: any[]) => void,
    filter?: EventFilter
  ): EventWatcher {
    const watcherId = `${name}-${Date.now()}`;
    this.activeWatchers.add(watcherId);

    if (this.wsProvider) {
      const listener = (...args: any[]) => {
        if (this.activeWatchers.has(watcherId)) handler(...args);
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
    }

    let lastBlock = filter?.fromBlock || -1;
    const intervalId = setInterval(async () => {
      if (!this.activeWatchers.has(watcherId)) return;
      try {
        const currentBlock = await this.provider.getBlockNumber();
        if (lastBlock === -1) lastBlock = currentBlock - 10;
        if (currentBlock > lastBlock) {
          const events = await this.intentRegistry.queryFilter(eventFilter, lastBlock + 1, currentBlock);
          for (const event of events) {
            const args = (event as ethers.EventLog).args;
            if (args) handler(...args);
          }
          lastBlock = currentBlock;
        }
      } catch (error) {
        console.error(`Polling error (${name}):`, error);
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

  async submitWithRetry<T>(
    txFn: () => Promise<T>,
    options: { maxRetries?: number; delayMs?: number } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 3;
    const delayMs = options.delayMs || 1000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await txFn();
      } catch (error: any) {
        lastError = error;
        if (this.isPermanentError(error)) throw error;
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt));
        }
      }
    }

    throw lastError;
  }

  private isPermanentError(error: any): boolean {
    const msgs = ['INSUFFICIENT_FUNDS', 'INVALID_SIGNATURE', 'REPLACEMENT_UNDERPRICED', 'UNPREDICTABLE_GAS_LIMIT'];
    return msgs.some((m) => error.message?.includes(m));
  }

  static parseEther(amount: string): bigint {
    return ethers.parseEther(amount);
  }

  static formatEther(amount: bigint): string {
    return ethers.formatEther(amount);
  }

  getProvider(): ethers.Provider {
    return this.provider;
  }

  getAddresses() {
    return { ...this.addresses };
  }
}

export { CHAIN_IDS, CAIP2, CONTRACT_ADDRESSES, getUserFriendlyError };

const EscrowABI = [
  'function lockTokens(address token, uint256 amount, bytes32 intentId, address user) external',
  'function releaseTokens(address token, uint256 amount, address recipient, bytes32 intentId) external',
  'function refundTokens(bytes32 intentId) external',
  'function setRegistry(address registry) external',
  'function addAllowedToken(address token) external',
  'function removeAllowedToken(address token) external',
  'function isTokenAllowed(address token) external view returns (bool)',
  'event TokensLocked(bytes32 indexed intentId, address indexed token, uint256 amount, address indexed user)',
  'event TokensReleased(bytes32 indexed intentId, address indexed token, uint256 amount, address indexed recipient)',
  'event TokensRefunded(bytes32 indexed intentId, address indexed token, uint256 amount, address indexed user)',
];

const PaymentVerifierABI = [
  'function verifyPayment(bytes32 paymentTxHash, address payer, address payee, uint256 amount, bytes32 intentId) external returns (bool)',
  'function registerFacilitator(address facilitator) external',
  'function revokeFacilitator(address facilitator) external',
  'function facilitators(address) external view returns (bool)',
  'event PaymentVerified(bytes32 indexed intentId, address payer, uint256 amount)',
  'event FacilitatorRegistered(address indexed facilitator)',
  'event FacilitatorRevoked(address indexed facilitator)',
];

const IntentRegistryABI = [
  'function submitIntent(tuple(uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, address[] allowedSolvers) intent, bytes signature) external returns (bytes32)',
  'function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash) external returns (bool)',
  'function cancelIntent(bytes32 intentId) external',
  'function cancelExpiredIntents(bytes32[] intentIds) external',
  'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))',
  'function getUserNonce(address user) external view returns (uint256)',
  'function getUserIntents(address user) external view returns (bytes32[])',
  'function setPaymentVerifier(address verifier) external',
  'function setEscrow(address escrow) external',
  'function pause() external',
  'function unpause() external',
  'event IntentSubmitted(bytes32 indexed intentId, address indexed user, address sourceToken, uint256 sourceAmount, address destToken, uint256 minDestAmount, uint256 expiry)',
  'event IntentFulfilled(bytes32 indexed intentId, address indexed solver, uint256 destAmount, bytes32 paymentTxHash)',
  'event IntentCancelled(bytes32 indexed intentId, address indexed user, uint256 refundAmount)',
];
