import { ethers } from 'ethers';
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

  constructor() {
    this.config = loadConfig();
    this.logger = createLogger(this.config);
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);

    this.dexAdapter = this.config.quoterAddress
      ? new XSwapV3Adapter(this.config.quoterAddress, this.config.routerAddress ?? '', this.provider)
      : this.config.routerAddress
        ? new SimpleDEXAdapter(this.config.routerAddress, this.provider)
        : new MockDEXAdapter();

    this.bridgeAdapter = new MockBridgeAdapter(this.config.bridgeAddress, this.provider);

    this.state = new StateManager(this.config.stateFilePath, this.logger);
    this.watcher = new EventWatcher(this.config, this.logger, this.state);
    this.evaluator = new IntentEvaluator(this.config, this.logger, this.provider, this.dexAdapter, this.bridgeAdapter);
    this.facilitator = new FacilitatorClient(this.config, this.logger);
    this.submitter = new TransactionSubmitter(this.config, this.logger);
    this.inventory = new InventoryTracker(this.provider, this.submitter.getAddress());
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
        ['function registerSolver(string memory name, uint256 feeBps, uint256[] memory supportedChains) external returns (uint256)'],
        wallet
      );
      const tx = await registry.registerSolver(this.config.solverName, this.config.solverFeeBps, this.config.supportedChains);
      await tx.wait();
      this.logger.info(`Registered solver ${this.config.solverName} with fee ${this.config.solverFeeBps} bps`);
    } catch (error: any) {
      if (error.message?.includes('already registered')) {
        this.logger.info('Solver already registered');
      } else {
        this.logger.warn(`Solver registration failed: ${error.message}`);
      }
    }
  }

  private async handleIntent(intent: IntentEvent): Promise<void> {
    if (!this.isRunning) return;

    const stored = this.state.getIntent(intent.intentId);
    if (stored?.status === 'completed' || stored?.status === 'failed') return;

    this.state.logDecision({
      timestamp: Date.now(),
      intentId: intent.intentId,
      decision: 'detected',
      reason: `Detected at block ${intent.blockNumber}`,
    });

    try {
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

        if (intent.destChainId === this.config.chainId) {
          const hasInventory = await this.inventory.hasSufficientBalance(intent.destChainId, intent.destToken, outputAmount);
          if (!hasInventory) {
            this.logger.warn(`Insufficient inventory for ${intent.intentId}`);
            this.state.logDecision({
              timestamp: Date.now(),
              intentId: intent.intentId,
              decision: 'skipped',
              reason: 'Insufficient inventory',
              metadata: outputAmount.toString(),
            });
            this.state.markFailed(intent.intentId);
            return;
          }
        }

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
          return;
        }
        throw new Error(result.error || 'Fulfillment failed');
      }
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      const retriable = this.isRetriableError(message);
      if (retriable) {
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
      lower.includes('rate limit') ||
      lower.includes('did not win quote competition')
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

  private async rebalanceCrossChain(intent: IntentEvent): Promise<void> {
    if (!this.config.bridgeAddress) return;
    try {
      const wallet = this.submitter.getSigner() as ethers.Wallet;
      const token = new ethers.Contract(
        intent.sourceToken,
        ['function approve(address spender, uint256 amount) external returns (bool)'],
        wallet
      );
      const bridge = new ethers.Contract(
        this.config.bridgeAddress,
        ['function bridgeOut(bytes32 intentId, address token, uint256 amount, uint256 destChainId) external'],
        wallet
      );

      this.logger.info(`Rebalancing cross-chain intent ${intent.intentId}`);
      const approveTx = await (token as any).approve(this.config.bridgeAddress, intent.sourceAmount);
      await approveTx.wait();

      const bridgeTx = await (bridge as any).bridgeOut(
        intent.intentId,
        intent.sourceToken,
        intent.sourceAmount,
        intent.destChainId
      );
      await bridgeTx.wait();

      this.state.logDecision({
        timestamp: Date.now(),
        intentId: intent.intentId,
        decision: 'succeeded',
        reason: `Rebalanced via MockBridge`,
        metadata: bridgeTx.hash,
      });
      this.logger.info(`Rebalanced ${intent.intentId} via MockBridge: ${bridgeTx.hash}`);
    } catch (error: any) {
      this.logger.warn(`Rebalance failed for ${intent.intentId}: ${error.message}`);
    }
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
