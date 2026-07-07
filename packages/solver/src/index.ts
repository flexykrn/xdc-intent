import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '@xdc-intent/constants';
import { Logger, createLogger } from './logger';
import { SolverConfig, loadConfig } from './config';
import { EventWatcher, IntentEvent } from './watcher';
import { IntentEvaluator } from './evaluator';
import { BridgeAdapter, MockBridgeAdapter } from './adapters/bridge';
import { DEXAdapter, MockDEXAdapter, SimpleDEXAdapter, XSwapV3Adapter } from './adapters/dex';
import { FacilitatorClient, PaymentRequirements } from './facilitator-client';
import { TransactionSubmitter } from './submitter';
import { StateManager } from './state';
import { startSolverHttpServer } from './server';
import { CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_CONFIG } from './circuit-breaker';
import { InventoryTracker } from './inventory';

export class Solver {
  private logger: Logger;
  private config: SolverConfig;
  private provider: ethers.JsonRpcProvider;
  private watcher: EventWatcher;
  private evaluator: IntentEvaluator;
  private dexAdapter: DEXAdapter;
  private bridgeAdapter: BridgeAdapter;
  private facilitator: FacilitatorClient;
  private submitter: TransactionSubmitter;
  private state: StateManager;
  private inventory: InventoryTracker;
  private httpServer?: ReturnType<typeof startSolverHttpServer>;
  private isRunning: boolean = false;
  private retryInterval?: NodeJS.Timeout;
  private fulfillmentBreaker: CircuitBreaker;
  private handlingIntents = new Set<string>();

  constructor() {
    this.config = loadConfig();
    this.logger = createLogger(this.config);
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);

    this.dexAdapter = this.config.quoterAddress
      ? new XSwapV3Adapter(this.config.quoterAddress, this.config.routerAddress ?? '', this.provider)
      : this.config.routerAddress
        ? new SimpleDEXAdapter(
            this.config.routerAddress,
            this.provider,
            CONTRACT_ADDRESSES[this.config.chainId]?.mockXDC
          )
        : new MockDEXAdapter();

    this.bridgeAdapter = new MockBridgeAdapter(this.config.bridgeAddress, this.provider);

    this.state = new StateManager(this.config.stateFilePath, this.logger);
    this.watcher = new EventWatcher(this.config, this.logger, this.state);
    this.evaluator = new IntentEvaluator(this.config, this.logger, this.provider, this.dexAdapter, this.bridgeAdapter);
    this.facilitator = new FacilitatorClient(this.config, this.logger);
    this.submitter = new TransactionSubmitter(this.config, this.logger);

    const inventoryProviders = new Map<number, ethers.Provider>();
    for (const chainId of this.config.supportedChains) {
      const chainRpcUrl = this.config.chainRpcUrls[chainId.toString()];
      inventoryProviders.set(chainId, chainRpcUrl ? new ethers.JsonRpcProvider(chainRpcUrl) : this.provider);
    }
    this.inventory = new InventoryTracker(inventoryProviders, this.submitter.getAddress());

    this.fulfillmentBreaker = new CircuitBreaker('fulfillment', DEFAULT_CIRCUIT_BREAKER_CONFIG, this.logger);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    await this.state.load();
    this.logger.info(`Starting solver ${this.submitter.getAddress()} on chain ${this.config.chainId}`);

    await this.registerSolver();

    this.httpServer = startSolverHttpServer(
      this.config.httpPort,
      this.state,
      this.submitter,
      this.config,
      this.fulfillmentBreaker,
      this.inventory,
      this.logger,
      this.config.facilitatorUrl
    );

    this.startRetryLoop();

    await this.watcher.start(async (intent) => this.handleIntent(intent));

    for (const intent of this.state.getPendingIntents()) {
      if (this.state.isQuoted(intent.intentId) || this.handlingIntents.has(intent.intentId)) {
        continue;
      }
      await this.handleIntent({
        intentId: intent.intentId,
        user: intent.user,
        sourceChainId: intent.sourceChainId ?? 51,
        sourceToken: intent.sourceToken,
        sourceAmount: BigInt(intent.sourceAmount),
        destChainId: intent.destChainId ?? 51,
        destToken: intent.destToken,
        minDestAmount: BigInt(intent.minDestAmount),
        maxSolverFee: BigInt(intent.maxSolverFee),
        expiry: intent.expiry,
        blockNumber: intent.blockNumber,
        transactionHash: intent.transactionHash,
      });
    }

    this.logger.info('Solver is running');
  }

  private startRetryLoop(): void {
    const interval = Math.max(1000, this.config.retryBaseDelayMs);
    this.retryInterval = setInterval(async () => {
      if (!this.isRunning) return;
      const retryable = this.state.getRetryableIntents(Date.now(), this.config.maxRetries);
      for (const intent of retryable) {
        if (this.handlingIntents.has(intent.intentId)) continue;
        this.logger.info(`Retrying intent ${intent.intentId} (attempt ${(intent.attempts || 0) + 1})`);
        await this.handleIntent({
          intentId: intent.intentId,
          user: intent.user,
          sourceChainId: intent.sourceChainId ?? 51,
          sourceToken: intent.sourceToken,
          sourceAmount: BigInt(intent.sourceAmount),
          destChainId: intent.destChainId ?? 51,
          destToken: intent.destToken,
          minDestAmount: BigInt(intent.minDestAmount),
          maxSolverFee: BigInt(intent.maxSolverFee),
          expiry: intent.expiry,
          blockNumber: intent.blockNumber,
          transactionHash: intent.transactionHash,
        });
      }
    }, interval);
  }

  private async registerSolver(): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      const wallet = new ethers.Wallet(this.config.privateKey, provider);
      const registry = new ethers.Contract(
        this.config.solverRegistryAddress,
        [
          'function registerSolver(string memory name, uint256 feeBps, uint256[] memory supportedChains) external returns (uint256)',
          'function updateSupportedChains(uint256[] memory supportedChains) external',
          'function getSolverByAddress(address solver) external view returns (tuple(address solverAddress, string name, uint256 feeBps, bool active, uint256 registeredAt, uint256[] supportedChains))',
        ],
        wallet
      );
      try {
        const tx = await registry.registerSolver(this.config.solverName, this.config.solverFeeBps, this.config.supportedChains);
        await tx.wait();
        this.logger.info(`Registered solver ${this.config.solverName} with fee ${this.config.solverFeeBps} bps`);
        return;
      } catch (error: any) {
        if (!error.message?.includes('already registered')) {
          throw error;
        }
      }

      const current = await registry.getSolverByAddress(wallet.address);
      const currentChains = (current.supportedChains as bigint[]).map((n) => Number(n)).sort();
      const desiredChains = [...this.config.supportedChains].sort();
      if (JSON.stringify(currentChains) !== JSON.stringify(desiredChains)) {
        const tx = await registry.updateSupportedChains(this.config.supportedChains);
        await tx.wait();
        this.logger.info(`Updated supported chains for ${this.config.solverName}: ${desiredChains.join(',')}`);
      } else {
        this.logger.info('Solver already registered');
      }
    } catch (error: any) {
      this.logger.warn(`Solver registration failed: ${error.message}`);
    }
  }

  private async handleIntent(intent: IntentEvent): Promise<void> {
    if (!this.isRunning) return;
    if (this.handlingIntents.has(intent.intentId)) return;
    this.handlingIntents.add(intent.intentId);

    try {
      const stored = this.state.getIntent(intent.intentId);
      if (stored?.status === 'completed' || stored?.status === 'failed') return;

      this.state.logDecision({
        timestamp: Date.now(),
        intentId: intent.intentId,
        decision: 'detected',
        reason: `Detected at block ${intent.blockNumber}`,
      });

      this.state.addPendingIntent({
        intentId: intent.intentId,
        user: intent.user,
        sourceChainId: intent.sourceChainId,
        sourceToken: intent.sourceToken,
        sourceAmount: intent.sourceAmount.toString(),
        destChainId: intent.destChainId,
        destToken: intent.destToken,
        minDestAmount: intent.minDestAmount.toString(),
        maxSolverFee: intent.maxSolverFee.toString(),
        expiry: intent.expiry,
        blockNumber: intent.blockNumber,
        transactionHash: intent.transactionHash,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      let outputAmount: bigint;
      if (stored?.quoted && stored.outputAmount) {
        outputAmount = BigInt(stored.outputAmount);
        this.logger.debug(`Using cached quote for ${intent.intentId}: ${outputAmount}`);
      } else {
        const evaluation = await this.evaluator.evaluate(intent);
        if (!evaluation.shouldFulfill) {
          this.logger.info(`Skipping ${intent.intentId}: ${evaluation.reason}`);
          this.state.logDecision({
            timestamp: Date.now(),
            intentId: intent.intentId,
            decision: 'skipped',
            reason: evaluation.reason,
            metadata: evaluation.estimatedOutput?.toString(),
          });
          this.state.markFailed(intent.intentId);
          return;
        }
        outputAmount = evaluation.estimatedOutput!;
      }

      const hasInventory = await this.inventory.hasSufficientBalance(intent.destChainId, intent.destToken, outputAmount);
      if (!hasInventory) {
        this.logger.warn(`Insufficient inventory on chain ${intent.destChainId} for ${intent.intentId}`);
        this.state.logDecision({
          timestamp: Date.now(),
          intentId: intent.intentId,
          decision: 'skipped',
          reason: `Insufficient inventory on chain ${intent.destChainId}`,
          metadata: outputAmount.toString(),
        });
        this.state.markFailed(intent.intentId);
        return;
      }

      if (!stored?.quoted || !stored.outputAmount) {
        const quoteSignature = await this.signQuote(intent.intentId, outputAmount);
        const quoteResult = await this.facilitator.submitQuote({
          intentId: intent.intentId,
          solverAddress: this.submitter.getAddress(),
          outputAmount: outputAmount.toString(),
          feeBps: this.config.solverFeeBps,
          signature: quoteSignature,
        });

        if (!quoteResult.success) {
          this.logger.warn(`Quote submission failed for ${intent.intentId}: ${quoteResult.error}`);
          this.state.markFailed(intent.intentId);
          return;
        }

        this.state.setQuoted(intent.intentId, outputAmount);
      }

      this.state.markInFlight(intent.intentId);
      this.logger.info(`Quoted ${intent.intentId}`, { outputAmount: outputAmount.toString() });

      await this.waitForQuoteWin(intent.intentId);

      const result = await this.fulfillmentBreaker.execute(async () => {
        const paymentRequired = await this.facilitator.requestPayment(intent.intentId);
        const accepted = paymentRequired.accepts[0];
        if (!accepted) {
          throw new Error('No payment requirements available');
        }

        const paymentPayload = await this.buildEIP3009Payment(accepted);
        const settleResult = await this.facilitator.settlePayment(intent.intentId, paymentPayload);
        if (!settleResult.success || !settleResult.transaction) {
          throw new Error(settleResult.error || 'Settlement failed');
        }

        return this.submitter.submitFulfillment(intent.intentId, outputAmount, settleResult.transaction);
      });

      if (result.success) {
        this.state.markCompleted(intent.intentId);
        this.state.logDecision({
          timestamp: Date.now(),
          intentId: intent.intentId,
          decision: 'succeeded',
          reason: `Fulfilled in ${result.txHash}`,
          metadata: result.txHash,
        });
        this.logger.info(`Fulfilled ${intent.intentId}: ${result.txHash}`);

        if (intent.sourceChainId !== intent.destChainId && this.config.bridgeAddress) {
          await this.rebalanceCrossChain(intent);
        }
      } else {
        if (result.error?.includes('already fulfilled') || result.error?.includes('not open')) {
          this.state.markCompleted(intent.intentId);
          this.logger.info(`Intent ${intent.intentId} already fulfilled`);
          if (intent.sourceChainId !== intent.destChainId && this.config.bridgeAddress) {
            const recordedSolver = await this.getRecordedSolver(intent.intentId);
            if (recordedSolver?.toLowerCase() === this.submitter.getAddress().toLowerCase()) {
              await this.rebalanceCrossChain(intent);
            }
          }
          return;
        }
        throw new Error(result.error || 'Fulfillment failed');
      }
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      const retriable = this.isRetriableError(message);
      if (retriable) {
        const stored = this.state.getIntent(intent.intentId);
        const attempts = stored?.attempts || 0;
        const delay = Math.min(
          this.config.retryMaxDelayMs,
          this.config.retryBaseDelayMs * 2 ** attempts
        );
        const scheduled = this.state.scheduleRetry(intent.intentId, message, delay, this.config.maxRetries);
        if (scheduled) {
          this.logger.warn(`Scheduled retry for ${intent.intentId} in ${delay}ms: ${message}`);
          this.state.logDecision({
            timestamp: Date.now(),
            intentId: intent.intentId,
            decision: 'attempted',
            reason: message,
          });
          return;
        }
      }
      this.state.markFailed(intent.intentId);
      this.state.logDecision({
        timestamp: Date.now(),
        intentId: intent.intentId,
        decision: 'failed',
        reason: message,
      });
      this.logger.error(`Error handling ${intent.intentId}:`, message);
    } finally {
      this.handlingIntents.delete(intent.intentId);
    }
  }

  private isRetriableError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('nonce') ||
      lower.includes('timeout') ||
      lower.includes('network') ||
      lower.includes('econnrefused') ||
      lower.includes('circuit breaker') ||
      lower.includes('gas price too high') ||
      lower.includes('rate limit')
    );
  }

  private async signQuote(intentId: string, outputAmount: bigint): Promise<string> {
    const wallet = this.submitter.getSigner() as ethers.Wallet;
    const message = JSON.stringify({ intentId, outputAmount: outputAmount.toString(), solver: this.submitter.getAddress() });
    return await wallet.signMessage(message);
  }

  private async waitForQuoteWin(intentId: string): Promise<void> {
    const maxWait = 30000;
    const interval = 1000;
    const start = Date.now();
    const solverAddress = this.submitter.getAddress().toLowerCase();

    while (Date.now() - start < maxWait) {
      const quotes = await this.facilitator.getQuotes(intentId);
      const best = quotes.reduce((max, q) =>
        BigInt(q.outputAmount) > BigInt(max.outputAmount) ? q : max, quotes[0]);
      if (best && best.solverAddress.toLowerCase() === solverAddress) {
        return;
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error('Did not win quote competition');
  }

  private async buildEIP3009Payment(accepted: PaymentRequirements): Promise<{
    x402Version: number;
    accepted: PaymentRequirements;
    payload: {
      authorization: {
        from: string;
        to: string;
        value: string;
        validAfter: string;
        validBefore: string;
        nonce: string;
      };
      signature: string;
    };
  }> {
    const wallet = this.submitter.getSigner() as ethers.Wallet;
    const now = Math.floor(Date.now() / 1000);
    const validAfter = now - 60;
    const validBefore = now + 600;
    const nonce = ethers.keccak256(ethers.randomBytes(32));

    const domain = {
      name: typeof accepted.extra?.tokenName === 'string' ? accepted.extra.tokenName : 'Mock USDC',
      version: typeof accepted.extra?.tokenVersion === 'string' ? accepted.extra.tokenVersion : '1',
      chainId: parseInt(accepted.network.split(':')[1], 10),
      verifyingContract: ethers.getAddress(accepted.asset),
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const message = {
      from: wallet.address,
      to: ethers.getAddress(accepted.payTo),
      value: accepted.amount,
      validAfter,
      validBefore,
      nonce,
    };

    const signature = await wallet.signTypedData(domain, types, message);

    return {
      x402Version: 2,
      accepted,
      payload: {
        authorization: {
          from: wallet.address,
          to: accepted.payTo,
          value: accepted.amount,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
        signature,
      },
    };
  }

  private async getRecordedSolver(intentId: string): Promise<string | null> {
    try {
      const registry = new ethers.Contract(
        this.config.intentRegistryAddress,
        ['function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))'],
        this.provider
      );
      const full = await registry.getIntent(intentId);
      return full.solver;
    } catch (error: any) {
      this.logger.warn(`Failed to read recorded solver for ${intentId}: ${error.message}`);
      return null;
    }
  }

  private async rebalanceCrossChain(intent: IntentEvent): Promise<void> {
    if (intent.sourceChainId === intent.destChainId || !this.config.bridgeAddress) return;

    const hasSourceTokens = await this.inventory.hasSufficientBalance(
      intent.sourceChainId,
      intent.sourceToken,
      intent.sourceAmount
    );
    if (!hasSourceTokens) {
      this.logger.warn(
        `Cannot rebalance ${intent.intentId}: solver does not have ${intent.sourceAmount} ${intent.sourceToken} on chain ${intent.sourceChainId}`
      );
      return;
    }

    try {
      const sourceProvider = this.inventory.getProvider(intent.sourceChainId) ?? this.provider;
      const sourceWallet = new ethers.Wallet(this.config.privateKey, sourceProvider);

      this.logger.info(
        `Rebalancing cross-chain intent ${intent.intentId}: bridging ${intent.sourceAmount} ${intent.sourceToken} from chain ${intent.sourceChainId} to chain ${intent.destChainId}`
      );
      await this.approveToken(intent.sourceToken, this.config.bridgeAddress, intent.sourceAmount, sourceWallet);
      const bridgeTxHash = await this.bridgeSourceTokens(
        intent.intentId,
        intent.sourceToken,
        intent.sourceAmount,
        intent.destChainId,
        sourceWallet
      );

      this.state.logDecision({
        timestamp: Date.now(),
        intentId: intent.intentId,
        decision: 'succeeded',
        reason: `Rebalanced via MockBridge`,
        metadata: bridgeTxHash,
      });
      this.logger.info(`Rebalanced ${intent.intentId} via MockBridge: ${bridgeTxHash}`);
    } catch (error: any) {
      this.logger.warn(`Rebalance failed for ${intent.intentId}: ${error.message}`);
    }
  }

  private async approveToken(
    tokenAddress: string,
    spender: string,
    amount: bigint,
    signer: ethers.Signer
  ): Promise<void> {
    const token = new ethers.Contract(
      tokenAddress,
      ['function approve(address spender, uint256 amount) external returns (bool)'],
      signer
    );
    const tx = await (token as any).approve(spender, amount);
    await tx.wait();
  }

  private async bridgeSourceTokens(
    intentId: string,
    token: string,
    amount: bigint,
    destChainId: number,
    signer: ethers.Signer
  ): Promise<string> {
    const bridge = new ethers.Contract(
      this.config.bridgeAddress!,
      ['function bridgeOut(bytes32 intentId, address token, uint256 amount, uint256 destChainId) external'],
      signer
    );
    const tx = await (bridge as any).bridgeOut(intentId, token, amount, destChainId);
    await tx.wait();
    return tx.hash;
  }

  stop(): void {
    this.isRunning = false;
    if (this.retryInterval) clearInterval(this.retryInterval);
    this.watcher.stop();
    this.httpServer?.close();
    this.state.close();
    this.logger.info('Solver stopped');
  }
}

if (require.main === module) {
  const solver = new Solver();
  solver.start().catch((error) => {
    console.error('Failed to start solver:', error);
    process.exit(1);
  });
  process.on('SIGTERM', () => solver.stop());
  process.on('SIGINT', () => solver.stop());
}

export default Solver;
