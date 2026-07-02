export interface PendingIntent {
  intentId: string;
  user: string;
  sourceToken: string;
  sourceAmount: string;
  destToken: string;
  minDestAmount: string;
  maxSolverFee: string;
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
  private pending = new Map<string, PendingIntent>();
  private decisions: DecisionLog[] = [];

  constructor(private logger: { info: (msg: string) => void; error: (msg: string, err?: any) => void }) {}

  addPendingIntent(intent: PendingIntent): void {
    if (!this.pending.has(intent.intentId)) {
      this.pending.set(intent.intentId, intent);
    }
  }

  markInFlight(intentId: string): void {
    const intent = this.pending.get(intentId);
    if (intent) intent.status = 'in-flight';
  }

  markCompleted(intentId: string): void {
    const intent = this.pending.get(intentId);
    if (intent) intent.status = 'completed';
  }

  markFailed(intentId: string): void {
    const intent = this.pending.get(intentId);
    if (intent) intent.status = 'failed';
  }

  getPendingIntents(): PendingIntent[] {
    return Array.from(this.pending.values()).filter((i) => i.status === 'pending');
  }

  getInFlightIntents(): PendingIntent[] {
    return Array.from(this.pending.values()).filter((i) => i.status === 'in-flight');
  }

  logDecision(decision: DecisionLog): void {
    this.decisions.push(decision);
    if (this.decisions.length > 10000) this.decisions.shift();
  }

  getDecisionLogs(intentId: string): DecisionLog[] {
    return this.decisions.filter((d) => d.intentId === intentId).sort((a, b) => b.timestamp - a.timestamp);
  }

  close(): void {
    this.pending.clear();
    this.decisions = [];
  }
}
