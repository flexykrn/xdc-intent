import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';

export interface IntentEvent {
  intentId: string;
  user: string;
  sourceToken: string;
  sourceAmount: bigint;
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
  private seenIntents: Set<string> = new Set();
  private lastProcessedBlock: number = 0;
  private isRunning: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;

  constructor(private config: SolverConfig, private logger: Logger) {
    const wsUrl = config.rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    try {
      this.provider = new ethers.WebSocketProvider(wsUrl);
      this.logger.info('Using WebSocket provider');
    } catch {
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
      this.logger.info('Using HTTP polling provider');
    }

    const abi = [
      'event IntentSubmitted(bytes32 indexed intentId, address indexed user, address sourceToken, uint256 sourceAmount, address destToken, uint256 minDestAmount, uint256 expiry)',
      'function getIntent(bytes32 intentId) external view returns (bytes32, address, uint256, address, uint256, uint256, address, uint256, uint256, uint256, uint256, address[], uint8, address, uint256, bytes32)',
    ];
    this.contract = new ethers.Contract(config.intentRegistryAddress, abi, this.provider);
  }

  async start(callback: (intent: IntentEvent) => void): Promise<void> {
    this.isRunning = true;
    const currentBlock = await this.provider.getBlockNumber();
    if (this.lastProcessedBlock > 0 && this.lastProcessedBlock < currentBlock) {
      await this.backfillEvents(this.lastProcessedBlock, currentBlock, callback);
    }
    this.lastProcessedBlock = currentBlock;

    this.contract.on(
      'IntentSubmitted',
      async (intentId, user, sourceToken, sourceAmount, destToken, minDestAmount, expiry, event) => {
        if (!this.isRunning) return;
        if (this.seenIntents.has(intentId)) return;
        this.seenIntents.add(intentId);

        try {
          const full = await this.contract.getIntent(intentId);
          callback({
            intentId,
            user,
            sourceToken,
            sourceAmount,
            destToken,
            minDestAmount,
            maxSolverFee: full[8],
            expiry: Number(expiry),
            blockNumber: event.log.blockNumber,
            transactionHash: event.log.transactionHash,
          });
        } catch (error: any) {
          this.logger.error(`Failed to fetch intent ${intentId}: ${error.message}`);
        }
      }
    );

    this.provider.on('error', (error) => {
      this.logger.error('Provider error:', error);
      this.handleReconnection(callback);
    });
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
          const full = await this.contract.getIntent(args[0]);
          callback({
            intentId: args[0],
            user: args[1],
            sourceToken: args[2],
            sourceAmount: args[3],
            destToken: args[4],
            minDestAmount: args[5],
            maxSolverFee: full[8],
            expiry: Number(args[6]),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
          });
        }
      } catch (error: any) {
        this.logger.error(`Backfill error ${start}-${end}: ${error.message}`);
      }
    }
  }

  private async handleReconnection(callback: (intent: IntentEvent) => void): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(async () => {
      try {
        const wsUrl = this.config.rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        try {
          this.provider = new ethers.WebSocketProvider(wsUrl);
        } catch {
          this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
        }
        const abi = [
          'event IntentSubmitted(bytes32 indexed intentId, address indexed user, address sourceToken, uint256 sourceAmount, address destToken, uint256 minDestAmount, uint256 expiry)',
        ];
        this.contract = new ethers.Contract(this.config.intentRegistryAddress, abi, this.provider);
        await this.start(callback);
        this.reconnectAttempts = 0;
      } catch (error: any) {
        this.logger.error('Reconnection failed:', error.message);
        this.handleReconnection(callback);
      }
    }, delay);
  }

  stop(): void {
    this.isRunning = false;
    this.contract.removeAllListeners();
    this.provider.removeAllListeners();
  }
}
