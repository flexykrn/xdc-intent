import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig, loadConfig } from './config';
import { EventWatcher, IntentEvent } from './watcher';
import { IntentEvaluator } from './evaluator';
import { MockDEXAdapter, DEXAdapter } from './adapters/dex';
import { XDCOnlyStrategy } from './strategies/xdc-only';
import { MiddlewareClient } from './middleware-client';
import { TransactionSubmitter } from './submitter';
import { StateManager } from './state';
import { DynamicFeeManager } from './fees';
import { FallbackStrategyManager } from './strategies';
import { MultiHopRouter } from './routes';

export class Solver {
  private logger: Logger;
  private config: SolverConfig;
  private watcher: EventWatcher;
  private evaluator: IntentEvaluator;
  private strategy: XDCOnlyStrategy;
  private middleware: MiddlewareClient;
  private submitter: TransactionSubmitter;
  private state: StateManager;
  private feeManager: DynamicFeeManager;
  private fallbackManager: FallbackStrategyManager;
  private isRunning: boolean = false;

  constructor() {
    this.config = loadConfig();
    this.logger = createLogger(this.config);
    
    const dexAdapter = new MockDEXAdapter();
    const dexAdapters = new Map<string, DEXAdapter>();
    dexAdapters.set('XDC-USDC', dexAdapter);
    dexAdapters.set('USDC-XDC', dexAdapter);
    
    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    
    this.watcher = new EventWatcher(this.config, this.logger);
    this.evaluator = new IntentEvaluator(this.config, this.logger);
    this.strategy = new XDCOnlyStrategy(this.config, this.logger, dexAdapter);
    this.middleware = new MiddlewareClient(this.config, this.logger);
    this.submitter = new TransactionSubmitter(this.config, this.logger);
    this.state = new StateManager(this.logger);
    this.feeManager = new DynamicFeeManager(this.config, this.logger, provider);
    this.fallbackManager = new FallbackStrategyManager(this.config, this.logger, dexAdapter, dexAdapters);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Solver already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting XDC Intent Solver');
    this.logger.info(`Solver address: ${new ethers.Wallet(this.config.privateKey).address}`);
    this.logger.info(`Network: XDC Apothem (Chain ID: ${this.config.chainId})`);
    this.logger.info(`Min profit margin: ${this.config.minProfitMargin}%`);
    this.logger.info(`Max gas price: ${this.config.maxGasPriceGwei} gwei`);
    this.logger.info('Features: Dynamic fees, Partial fills, Multi-hop routes, Fallback strategies');

    // Start dynamic fee monitoring
    this.feeManager.startMonitoring(5); // Every 5 minutes

    // Start event watcher
    await this.watcher.start(async (intent) => {
      await this.handleIntent(intent);
    });

    // Load pending intents from database
    const pendingIntents = this.state.getPendingIntents();
    this.logger.info(`Loaded ${pendingIntents.length} pending intents from database`);

    // Process pending intents
    for (const intent of pendingIntents) {
      await this.handleIntent({
        intentId: intent.intentId,
        user: intent.user,
        token: intent.token,
        amount: BigInt(intent.amount),
        expiry: intent.expiry,
        blockNumber: intent.blockNumber,
        transactionHash: intent.transactionHash,
      });
    }

    this.logger.info('Solver is running and watching for intents');
  }

  private async handleIntent(intent: IntentEvent): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Log detection
      this.state.logDecision({
        timestamp: Math.floor(Date.now() / 1000),
        intentId: intent.intentId,
        decision: 'detected',
        reason: `Intent detected at block ${intent.blockNumber}`,
      });

      // Add to pending if not already there
      this.state.addPendingIntent({
        intentId: intent.intentId,
        user: intent.user,
        token: intent.token,
        amount: intent.amount.toString(),
        expiry: intent.expiry,
        blockNumber: intent.blockNumber,
        transactionHash: intent.transactionHash,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      // Evaluate intent
      const evaluation = this.evaluator.evaluate(intent);
      
      if (!evaluation.shouldFulfill) {
        this.logger.info(`Intent ${intent.intentId} skipped: ${evaluation.reason}`);
        this.state.logDecision({
          timestamp: Math.floor(Date.now() / 1000),
          intentId: intent.intentId,
          decision: 'skipped',
          reason: evaluation.reason,
        });
        return;
      }

      this.logger.info(`Intent ${intent.intentId} evaluated: ${evaluation.reason}`, {
        estimatedProfit: evaluation.estimatedProfit,
        estimatedOutput: evaluation.estimatedOutput?.toString(),
      });

      // Mark as in-flight
      this.state.markInFlight(intent.intentId);
      this.state.logDecision({
        timestamp: Math.floor(Date.now() / 1000),
        intentId: intent.intentId,
        decision: 'evaluated',
        reason: `Profitable: ${evaluation.estimatedProfit?.toFixed(2)}%`,
      });

      // Get fulfillment plan using fallback strategies
      const strategyResult = await this.fallbackManager.evaluateWithFallback(intent);
      
      if (!strategyResult || strategyResult.strategy === 'retry-later') {
        this.logger.info(`No profitable strategy found for intent ${intent.intentId}`);
        this.state.markFailed(intent.intentId);
        this.state.logDecision({
          timestamp: Math.floor(Date.now() / 1000),
          intentId: intent.intentId,
          decision: 'skipped',
          reason: 'No profitable strategy found',
        });
        return;
      }

      this.logger.info(`Using strategy: ${this.fallbackManager.getStrategyName(strategyResult.strategy)}`, {
        executionTime: strategyResult.executionTime,
      });

      const plan = strategyResult.plan;
      
      if (!plan) {
        this.logger.info(`Intent ${intent.intentId} not profitable after strategy evaluation`);
        this.state.markFailed(intent.intentId);
        this.state.logDecision({
          timestamp: Math.floor(Date.now() / 1000),
          intentId: intent.intentId,
          decision: 'skipped',
          reason: 'Strategy evaluation failed',
        });
        return;
      }

      // Request payment from middleware
      const solverAddress = new ethers.Wallet(this.config.privateKey).address;
      const paymentRequest = await this.middleware.requestPayment(intent.intentId, solverAddress);

      // Sign payment request (mock signature for testnet)
      const signature = '0x' + '00'.repeat(65); // Mock signature

      // Submit payment
      const proof = await this.middleware.submitPayment(paymentRequest, solverAddress, signature);

      // Verify proof
      const isValid = await this.middleware.verifyProof(proof);
      if (!isValid) {
        throw new Error('Proof verification failed');
      }

      // Submit fulfillment
      const result = await this.submitter.submitFulfillment(plan, proof);

      if (result.success) {
        this.state.markCompleted(intent.intentId);
        this.state.logDecision({
          timestamp: Math.floor(Date.now() / 1000),
          intentId: intent.intentId,
          decision: 'succeeded',
          reason: `Fulfillment confirmed: ${result.txHash}`,
        });
        this.logger.info(`Intent ${intent.intentId} fulfilled successfully: ${result.txHash}`);
      } else {
        this.state.markFailed(intent.intentId);
        this.state.logDecision({
          timestamp: Math.floor(Date.now() / 1000),
          intentId: intent.intentId,
          decision: 'failed',
          reason: result.error || 'Unknown error',
        });
        this.logger.error(`Intent ${intent.intentId} fulfillment failed: ${result.error}`);
      }

    } catch (error: any) {
      this.logger.error(`Error handling intent ${intent.intentId}:`, error);
      this.state.markFailed(intent.intentId);
      this.state.logDecision({
        timestamp: Math.floor(Date.now() / 1000),
        intentId: intent.intentId,
        decision: 'failed',
        reason: error.message,
      });
    }
  }

  stop(): void {
    this.isRunning = false;
    this.watcher.stop();
    this.state.close();
    this.logger.info('Solver stopped');
  }
}

// Import createLogger
import { createLogger } from './logger';

// Start solver if run directly
if (require.main === module) {
  const solver = new Solver();
  
  solver.start().catch((error) => {
    console.error('Failed to start solver:', error);
    process.exit(1);
  });

  // Handle shutdown
  process.on('SIGTERM', () => solver.stop());
  process.on('SIGINT', () => solver.stop());
}

export default Solver;
