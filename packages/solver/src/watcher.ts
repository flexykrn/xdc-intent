import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';

export interface IntentEvent {
  intentId: string;
  user: string;
  token: string;
  amount: bigint;
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
  private reconnectDelay: number = 1000; // Start with 1 second

  constructor(
    private config: SolverConfig,
    private logger: Logger
  ) {
    // Try WebSocket first, fall back to HTTP polling
    const wsUrl = config.rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    try {
      this.provider = new ethers.WebSocketProvider(wsUrl);
      this.logger.info('Using WebSocket provider');
    } catch (error) {
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
      this.logger.info('Using HTTP polling provider');
    }

    const abi = [
      'event IntentSubmitted(bytes32 indexed intentId, address indexed user, address indexed token, uint256 amount, uint256 expiry)',
      'function getIntent(bytes32 intentId) external view returns (bytes32, address, address, uint256, uint256, uint8, address, uint256, uint256, uint256, uint256)',
    ];

    this.contract = new ethers.Contract(config.intentRegistryAddress, abi, this.provider);
  }

  async start(callback: (intent: IntentEvent) => void): Promise<void> {
    this.isRunning = true;
    this.logger.info('Starting event watcher');

    // Get current block for backfill
    const currentBlock = await this.provider.getBlockNumber();
    this.logger.info(`Current block: ${currentBlock}`);

    // Backfill from last processed block
    if (this.lastProcessedBlock > 0 && this.lastProcessedBlock < currentBlock) {
      await this.backfillEvents(this.lastProcessedBlock, currentBlock, callback);
    }
    this.lastProcessedBlock = currentBlock;

    // Listen for new events
    this.contract.on('IntentSubmitted', async (intentId, user, token, amount, expiry, event) => {
      if (!this.isRunning) return;

      // Deduplicate
      if (this.seenIntents.has(intentId)) {
        this.logger.debug(`Duplicate intent detected: ${intentId}`);
        return;
      }
      this.seenIntents.add(intentId);

      const intentEvent: IntentEvent = {
        intentId,
        user,
        token,
        amount,
        expiry: Number(expiry),
        blockNumber: event.log.blockNumber,
        transactionHash: event.log.transactionHash,
      };

      this.logger.info(`New intent detected: ${intentId}`, {
        user,
        token,
        amount: amount.toString(),
        expiry: intentEvent.expiry,
      });

      callback(intentEvent);
    });

    // Handle provider errors
    this.provider.on('error', (error) => {
      this.logger.error('Provider error:', error);
      this.handleReconnection(callback);
    });

    // Periodic cleanup of seen intents (prevent memory leak)
    setInterval(() => {
      if (this.seenIntents.size > 10000) {
        this.logger.info('Cleaning up seen intents set');
        this.seenIntents.clear();
      }
    }, 3600000); // Every hour
  }

  private async backfillEvents(
    fromBlock: number,
    toBlock: number,
    callback: (intent: IntentEvent) => void
  ): Promise<void> {
    this.logger.info(`Backfilling events from block ${fromBlock} to ${toBlock}`);

    const batchSize = 10; // Rate limit: 10 blocks per second
    for (let start = fromBlock; start <= toBlock; start += batchSize) {
      const end = Math.min(start + batchSize - 1, toBlock);
      
      try {
        const events = await this.contract.queryFilter(
          this.contract.filters.IntentSubmitted(),
          start,
          end
        );

        for (const event of events) {
          const args = (event as ethers.EventLog).args;
          if (!args) continue;

          const intentId = args[0];
          if (this.seenIntents.has(intentId)) continue;
          this.seenIntents.add(intentId);

          callback({
            intentId,
            user: args[1],
            token: args[2],
            amount: args[3],
            expiry: Number(args[4]),
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
          });
        }
      } catch (error) {
        this.logger.error(`Backfill error for blocks ${start}-${end}:`, error);
      }

      // Rate limit: 10 blocks per second = 100ms per block
      await new Promise(resolve => setTimeout(resolve, 100 * batchSize));
    }

    this.logger.info('Backfill complete');
  }

  private async handleReconnection(callback: (intent: IntentEvent) => void): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    
    this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        // Create new provider
        const wsUrl = this.config.rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        try {
          this.provider = new ethers.WebSocketProvider(wsUrl);
        } catch (error) {
          this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
        }

        // Update contract with new provider
        const abi = [
          'event IntentSubmitted(bytes32 indexed intentId, address indexed user, address indexed token, uint256 amount, uint256 expiry)',
        ];
        this.contract = new ethers.Contract(this.config.intentRegistryAddress, abi, this.provider);

        // Restart watcher
        await this.start(callback);
        this.reconnectAttempts = 0;
        this.logger.info('Reconnection successful');
      } catch (error) {
        this.logger.error('Reconnection failed:', error);
        this.handleReconnection(callback);
      }
    }, delay);
  }

  stop(): void {
    this.isRunning = false;
    this.contract.removeAllListeners();
    this.provider.removeAllListeners();
    this.logger.info('Event watcher stopped');
  }

  getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  getSeenIntentsCount(): number {
    return this.seenIntents.size;
  }
}
