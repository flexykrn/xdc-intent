export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig,
    private logger?: { info: (msg: string) => void; warn: (msg: string) => void }
  ) {}

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        this.logger?.info(`Circuit breaker ${this.name} entering HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls += 1;
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.halfOpenCalls = 0;
        this.logger?.info(`Circuit breaker ${this.name} is CLOSED`);
      }
    } else {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  private onFailure(): void {
    this.failures += 1;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.logger?.warn(`Circuit breaker ${this.name} is OPEN (half-open failure)`);
      return;
    }

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.logger?.warn(`Circuit breaker ${this.name} is OPEN after ${this.failures} failures`);
    }
  }
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 2,
};
