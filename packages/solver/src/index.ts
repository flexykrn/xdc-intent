import { ethers } from 'ethers';
import { Logger, createLogger } from './logger';
import { SolverConfig, loadConfig } from './config';
import { EventWatcher, IntentEvent } from './watcher';
import { IntentEvaluator } from './evaluator';
import { DEXAdapter, MockDEXAdapter, XSwapV3Adapter } from './adapters/dex';
import { FacilitatorClient } from './facilitator-client';
import { TransactionSubmitter } from './submitter';
import { StateManager } from './state';
import { startSolverHttpServer } from './server';

export class Solver {
  private logger: Logger;
  private config: SolverConfig;
  private watcher: EventWatcher;
  private evaluator: IntentEvaluator;
  private dexAdapter: DEXAdapter;
  private facilitator: FacilitatorClient;
  private submitter: TransactionSubmitter;
  private state: StateManager;
  private httpServer?: ReturnType<typeof startSolverHttpServer>;
  private isRunning: boolean = false;

  constructor() {
    this.config = loadConfig();
    this.logger = createLogger(this.config);
    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);

    this.dexAdapter =
      this.config.quoterAddress && this.config.routerAddress
        ? new XSwapV3Adapter(this.config.quoterAddress, this.config.routerAddress, provider)
        : new MockDEXAdapter();

    this.state = new StateManager(this.config.stateFilePath, this.logger);
    this.watcher = new EventWatcher(this.config, this.logger, this.state);
    this.evaluator = new IntentEvaluator(this.config, this.logger, this.dexAdapter);
    this.facilitator = new FacilitatorClient(this.config, this.logger);
    this.submitter = new TransactionSubmitter(this.config, this.logger);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    await this.state.load();
    this.logger.info(`Starting solver ${this.submitter.getAddress()} on chain ${this.config.chainId}`);

    this.httpServer = startSolverHttpServer(this.config.httpPort, this.state, this.submitter, this.logger);

    await this.watcher.start(async (intent) => this.handleIntent(intent));

    for (const intent of this.state.getPendingIntents()) {
      await this.handleIntent({
        intentId: intent.intentId,
        user: intent.user,
        sourceToken: intent.sourceToken,
        sourceAmount: BigInt(intent.sourceAmount),
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

  private async handleIntent(intent: IntentEvent): Promise<void> {
    if (!this.isRunning) return;

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
        sourceToken: intent.sourceToken,
        sourceAmount: intent.sourceAmount.toString(),
        destToken: intent.destToken,
        minDestAmount: intent.minDestAmount.toString(),
        maxSolverFee: intent.maxSolverFee.toString(),
        expiry: intent.expiry,
        blockNumber: intent.blockNumber,
        transactionHash: intent.transactionHash,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      this.state.logDecision({
        timestamp: Date.now(),
        intentId: intent.intentId,
        decision: 'evaluated',
        reason: 'Evaluating profitability',
      });

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

      this.state.markInFlight(intent.intentId);
      this.state.logDecision({
        timestamp: Date.now(),
        intentId: intent.intentId,
        decision: 'attempted',
        reason: 'Intent passed evaluation',
        metadata: evaluation.estimatedOutput?.toString(),
      });
      this.logger.info(`Fulfilling ${intent.intentId}`, {
        estimatedOutput: evaluation.estimatedOutput?.toString(),
      });

      const paymentRequest = await this.facilitator.requestPayment(
        intent.intentId,
        this.submitter.getAddress()
      );

      // Execute the ERC-20 payment on-chain (x402 V2 style).
      const signer = this.submitter.getSigner();
      const token = new ethers.Contract(
        paymentRequest.asset,
        ['function transfer(address to, uint256 amount) external returns (bool)'],
        signer
      );
      const paymentTx = await token.transfer(paymentRequest.payTo, paymentRequest.amount);
      const paymentReceipt = await paymentTx.wait();
      const paymentTxHash = paymentReceipt?.hash || paymentTx.hash;

      await this.facilitator.submitPaymentProof(paymentTxHash, intent.intentId, this.submitter.getAddress());

      const result = await this.submitter.submitFulfillment(
        intent.intentId,
        evaluation.estimatedOutput!,
        paymentTxHash
      );

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
      } else {
        this.state.markFailed(intent.intentId);
        this.state.logDecision({
          timestamp: Date.now(),
          intentId: intent.intentId,
          decision: 'failed',
          reason: result.error || 'Fulfillment failed',
        });
        this.logger.error(`Fulfillment failed ${intent.intentId}: ${result.error}`);
      }
    } catch (error: any) {
      this.state.markFailed(intent.intentId);
      this.state.logDecision({
        timestamp: Date.now(),
        intentId: intent.intentId,
        decision: 'failed',
        reason: error.message || 'Unknown error',
      });
      this.logger.error(`Error handling ${intent.intentId}:`, error.message);
    }
  }

  stop(): void {
    this.isRunning = false;
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

