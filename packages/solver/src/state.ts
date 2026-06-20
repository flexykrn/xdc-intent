import Database from 'better-sqlite3';
import { join } from 'path';
import { Logger } from './logger';

export interface PendingIntent {
  intentId: string;
  user: string;
  token: string;
  amount: string;
  expiry: number;
  blockNumber: number;
  transactionHash: string;
  status: 'pending' | 'in-flight' | 'completed' | 'failed';
  createdAt: number;
}

export interface DecisionLog {
  timestamp: number;
  intentId: string;
  decision: 'detected' | 'evaluated' | 'skipped' | 'attempted' | 'succeeded' | 'failed';
  reason: string;
  metadata?: string;
}

export class StateManager {
  private db: Database.Database;

  constructor(
    private logger: Logger,
    dbPath?: string
  ) {
    this.db = new Database(dbPath || join(__dirname, '..', 'solver.db'));
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_intents (
        intent_id TEXT PRIMARY KEY,
        user TEXT NOT NULL,
        token TEXT NOT NULL,
        amount TEXT NOT NULL,
        expiry INTEGER NOT NULL,
        block_number INTEGER NOT NULL,
        transaction_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS decision_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        intent_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_intent_status ON pending_intents(status);
      CREATE INDEX IF NOT EXISTS idx_decision_intent ON decision_logs(intent_id);
    `);
  }

  addPendingIntent(intent: PendingIntent): void {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO pending_intents 
        (intent_id, user, token, amount, expiry, block_number, transaction_hash, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        intent.intentId,
        intent.user,
        intent.token,
        intent.amount,
        intent.expiry,
        intent.blockNumber,
        intent.transactionHash,
        intent.status
      );
    } catch (error) {
      this.logger.error('Failed to add pending intent:', error);
    }
  }

  markInFlight(intentId: string): void {
    this.db.prepare(`
      UPDATE pending_intents SET status = 'in-flight' WHERE intent_id = ?
    `).run(intentId);
  }

  markCompleted(intentId: string): void {
    this.db.prepare(`
      UPDATE pending_intents SET status = 'completed' WHERE intent_id = ?
    `).run(intentId);
  }

  markFailed(intentId: string): void {
    this.db.prepare(`
      UPDATE pending_intents SET status = 'failed' WHERE intent_id = ?
    `).run(intentId);
  }

  getPendingIntents(): PendingIntent[] {
    return this.db.prepare(`
      SELECT * FROM pending_intents WHERE status = 'pending' ORDER BY created_at ASC
    `).all() as PendingIntent[];
  }

  getInFlightIntents(): PendingIntent[] {
    return this.db.prepare(`
      SELECT * FROM pending_intents WHERE status = 'in-flight' ORDER BY created_at ASC
    `).all() as PendingIntent[];
  }

  logDecision(decision: DecisionLog): void {
    this.db.prepare(`
      INSERT INTO decision_logs (timestamp, intent_id, decision, reason, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      decision.timestamp,
      decision.intentId,
      decision.decision,
      decision.reason,
      decision.metadata || null
    );
  }

  getDecisionLogs(intentId: string): DecisionLog[] {
    return this.db.prepare(`
      SELECT * FROM decision_logs WHERE intent_id = ? ORDER BY timestamp DESC
    `).all(intentId) as DecisionLog[];
  }

  getLastProcessedBlock(): number {
    const result = this.db.prepare(`
      SELECT MAX(block_number) as last_block FROM pending_intents
    `).get() as { last_block: number | null };
    return result.last_block || 0;
  }

  close(): void {
    this.db.close();
  }
}
