import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';
import { StateManager } from './state';

export interface IntentEvent {
  intentId: string;
  user: string;
  sourceChainId: number;
  sourceToken: string;
  sourceAmount: bigint;
  destChainId: number;
  destToken: string;
  minDestAmount: bigint;
  maxSolverFee: bigint;
  expiry: number;
  blockNumber: number;
  transactionHash: string;
}

export class EventWatcher {
  private provider: ethers.WebSocketProvider | ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private isRunning: boolean = false;

  constructor(private config: SolverConfig, private logger: Logger, private state: StateManager) {
    this.provider = this.createProvider();

    const abi = [
      'event IntentSubmitted(bytes32 indexed intentId, address indexed user, address sourceToken, uint256 sourceAmount, address destToken, uint256 minDestAmount, uint256 expiry)',
      'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))',
    ];
    this.contract = new ethers.Contract(config.intentRegistryAddress, abi, this.provider);
  }

  private createProvider(): ethers.WebSocketProvider | ethers.JsonRpcProvider {
    const url = this.config.rpcUrl;
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return new ethers.WebSocketProvider(url);
    }
    this.logger.info('Using HTTP polling provider');
    return new ethers.JsonRpcProvider(url);
  }

  async start(callback: (intent: IntentEvent) => void): Promise<void> {
    this.isRunning = true;
    const currentBlock = await this.provider.getBlockNumber();
    const lastProcessed = this.state.getLastProcessedBlock();
    if (lastProcessed > 0 && lastProcessed < currentBlock) {
      await this.backfillEvents(lastProcessed, currentBlock, callback);
    }
    this.state.setLastProcessedBlock(currentBlock);

    this.pollLoop(callback);
  }

  private async pollLoop(callback: (intent: IntentEvent) => void): Promise<void> {
    while (this.isRunning) {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        const lastProcessed = this.state.getLastProcessedBlock();
        if (lastProcessed < currentBlock) {
          await this.backfillEvents(lastProcessed + 1, currentBlock, callback);
        }
      } catch (error: any) {
        this.logger.error('Polling error:', error.message);
      }
      await new Promise((r) => setTimeout(r, this.config.pollingInterval || 5000));
    }
  }

  private async backfillEvents(
    fromBlock: number,
    toBlock: number,
    callback: (intent: IntentEvent) => void
  ): Promise<void> {
    this.logger.info(`Backfilling events from ${fromBlock} to ${toBlock}`);
    const batchSize = 2000;
    for (let start = fromBlock; start <= toBlock; start += batchSize) {
      const end = Math.min(start + batchSize - 1, toBlock);
      try {
        const events = await this.contract.queryFilter(this.contract.filters.IntentSubmitted(), start, end);
        for (const event of events) {
          const args = (event as ethers.EventLog).args;
          if (!args) continue;
          const intentId = args[0];
          if (this.state.hasSeenIntent(intentId)) continue;
          this.state.markIntentSeen(intentId);
          const full = await this.contract.getIntent(intentId);
          callback({
            intentId,
            user: args[1],
            sourceChainId: Number(full.sourceChainId),
            sourceToken: args[2],
            sourceAmount: args[3],
            destChainId: Number(full.destChainId),
            destToken: args[4],
            minDestAmount: args[5],
            maxSolverFee: full.maxSolverFee,
            expiry: Number(args[6]),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
          });
        }
      } catch (error: any) {
        this.logger.error(`Backfill error ${start}-${end}: ${error.message}`);
      }
    }
    this.state.setLastProcessedBlock(toBlock);
  }

  stop(): void {
    this.isRunning = false;
  }
}
