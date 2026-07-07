import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface PendingIntent {
  intentId: string;
  user: string;
  sourceChainId: number;
  sourceToken: string;
  sourceAmount: string;
  destChainId: number;
  destToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  expiry: number;
  blockNumber: number;
  transactionHash: string;
  status: 'pending' | 'in-flight' | 'completed' | 'failed';
  createdAt: number;
  attempts?: number;
  nextRetryAt?: number;
  lastError?: string;
  quoted?: boolean;
  outputAmount?: string;
}

export interface DecisionLog {
  timestamp: number;
  intentId: string;
  decision: 'detected' | 'evaluated' | 'skipped' | 'attempted' | 'succeeded' | 'failed';
  reason: string;
  metadata?: string;
}

interface PersistedState {
  pending: Record<string, PendingIntent>;
  decisions: DecisionLog[];
  seenIntentIds: string[];
  lastProcessedBlock: number;
}

export class StateManager {
  private pending = new Map<string, PendingIntent>();
  private decisions: DecisionLog[] = [];
  private seenIntentIds = new Set<string>();
  private lastProcessedBlock = 0;
  private filePath: string;

  constructor(
    filePath: string,
    private logger: { info: (msg: string) => void; error: (msg: string, err?: any) => void }
  ) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      if (!existsSync(this.filePath)) return;
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed: PersistedState = JSON.parse(raw);
      this.pending = new Map(Object.entries(parsed.pending || {}));
      this.decisions = parsed.decisions || [];
      this.seenIntentIds = new Set(parsed.seenIntentIds || []);
      this.lastProcessedBlock = parsed.lastProcessedBlock || 0;
      this.logger.info(`Loaded solver state: ${this.pending.size} intents, last block ${this.lastProcessedBlock}`);
    } catch (error: any) {
      this.logger.error('Failed to load solver state:', error.message);
    }
  }

  async save(): Promise<void> {
    try {
      const dir = join(this.filePath, '..');
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      const state: PersistedState = {
        pending: Object.fromEntries(this.pending),
        decisions: this.decisions,
        seenIntentIds: Array.from(this.seenIntentIds),
        lastProcessedBlock: this.lastProcessedBlock,
      };
      await writeFile(this.filePath, JSON.stringify(state, null, 2));
    } catch (error: any) {
      this.logger.error('Failed to save solver state:', error.message);
    }
  }

  hasSeenIntent(intentId: string): boolean {
    return this.seenIntentIds.has(intentId);
  }

  markIntentSeen(intentId: string): void {
    this.seenIntentIds.add(intentId);
    this.save().catch(() => {});
  }

  addPendingIntent(intent: PendingIntent): void {
    if (!this.pending.has(intent.intentId)) {
      this.pending.set(intent.intentId, intent);
      this.save().catch(() => {});
    }
  }

  markInFlight(intentId: string): void {
    const intent = this.pending.get(intentId);
    if (intent) {
      intent.status = 'in-flight';
      this.save().catch(() => {});
    }
  }

  getIntent(intentId: string): PendingIntent | undefined {
    return this.pending.get(intentId);
  }

  scheduleRetry(intentId: string, error: string, delayMs: number, maxRetries: number): boolean {
    const intent = this.pending.get(intentId);
    if (!intent) return false;
    const attempts = (intent.attempts || 0) + 1;
    if (attempts >= maxRetries) {
      this.markFailed(intentId);
      return false;
    }
    intent.attempts = attempts;
    intent.lastError = error;
    intent.nextRetryAt = Date.now() + delayMs;
    intent.status = 'pending';
    this.save().catch(() => {});
    return true;
  }

  getRetryableIntents(now: number, maxRetries: number): PendingIntent[] {
    return Array.from(this.pending.values()).filter((i) => {
      if (i.status !== 'pending') return false;
      const attempts = i.attempts || 0;
      if (attempts >= maxRetries) return false;
      return (i.nextRetryAt || 0) <= now;
    });
  }

  setQuoted(intentId: string, outputAmount: bigint): void {
    const intent = this.pending.get(intentId);
    if (intent) {
      intent.quoted = true;
      intent.outputAmount = outputAmount.toString();
      this.save().catch(() => {});
    }
  }

  isQuoted(intentId: string): boolean {
    return this.pending.get(intentId)?.quoted === true;
  }

  markCompleted(intentId: string): void {
    const intent = this.pending.get(intentId);
    if (intent) {
      intent.status = 'completed';
      this.save().catch(() => {});
    }
  }

  markFailed(intentId: string): void {
    const intent = this.pending.get(intentId);
    if (intent) {
      intent.status = 'failed';
      this.save().catch(() => {});
    }
  }

  getPendingIntents(): PendingIntent[] {
    return Array.from(this.pending.values()).filter((i) => i.status === 'pending');
  }

  getInFlightIntents(): PendingIntent[] {
    return Array.from(this.pending.values()).filter((i) => i.status === 'in-flight');
  }

  getCompletedIntents(): PendingIntent[] {
    return Array.from(this.pending.values()).filter((i) => i.status === 'completed');
  }

  getFailedIntents(): PendingIntent[] {
    return Array.from(this.pending.values()).filter((i) => i.status === 'failed');
  }

  getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  setLastProcessedBlock(block: number): void {
    if (block > this.lastProcessedBlock) {
      this.lastProcessedBlock = block;
      this.save().catch(() => {});
    }
  }

  logDecision(decision: DecisionLog): void {
    this.decisions.push(decision);
    if (this.decisions.length > 10000) this.decisions.shift();
    this.save().catch(() => {});
  }

  getDecisionLogs(intentId: string): DecisionLog[] {
    return this.decisions.filter((d) => d.intentId === intentId).sort((a, b) => b.timestamp - a.timestamp);
  }

  getMetrics(): { pending: number; inFlight: number; completed: number; failed: number; totalSeen: number; retryable: number } {
    const now = Date.now();
    return {
      pending: this.getPendingIntents().length,
      inFlight: this.getInFlightIntents().length,
      completed: this.getCompletedIntents().length,
      failed: this.getFailedIntents().length,
      totalSeen: this.seenIntentIds.size,
      retryable: this.getRetryableIntents(now, Infinity).length,
    };
  }

  close(): void {
    this.pending.clear();
    this.decisions = [];
    this.seenIntentIds.clear();
  }
}
