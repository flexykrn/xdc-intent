import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { SolverConfig } from '../src/config';
import { IntentEvaluator } from '../src/evaluator';
import { MockDEXAdapter } from '../src/adapters/dex';
import { StateManager } from '../src/state';
import { IntentEvent } from '../src/watcher';
import { CircuitBreaker } from '../src/circuit-breaker';
import winston from 'winston';

describe('Solver Components', () => {
  const mockConfig: SolverConfig = {
    rpcUrl: 'https://erpc.apothem.network',
    chainId: 51,
    privateKey: '0x' + '00'.repeat(32),
    escrowAddress: '0x' + '00'.repeat(20),
    paymentVerifierAddress: '0x' + '00'.repeat(20),
    intentRegistryAddress: '0x' + '00'.repeat(20),
    solverRegistryAddress: '0x' + '00'.repeat(20),
    facilitatorUrl: 'http://localhost:3000',
    facilitatorApiKey: 'test-key',
    quoterAddress: '',
    routerAddress: '',
    stateFilePath: ':memory:',
    httpPort: 3001,
    pollingInterval: 5000,
    minProfitMargin: 0.5,
    maxSlippage: 1.0,
    maxGasPriceGwei: 50,
    supportedTokens: ['USDC', 'USDT', 'XDC'],
    logLevel: 'info',
    solverName: 'TestSolver',
    solverFeeBps: 30,
    minDestAmount: 0.95,
    minSourceAmount: ethers.parseEther('0.001'),
    maxRetries: 3,
    retryBaseDelayMs: 100,
    retryMaxDelayMs: 1000,
  };

  const mockLogger = winston.createLogger({
    level: 'info',
    transports: [new winston.transports.Console({ silent: true })],
  });

  describe('IntentEvaluator', () => {
    const dexAdapter = new MockDEXAdapter();
    const evaluator = new IntentEvaluator(mockConfig, mockLogger, dexAdapter, 0.05);

    it('should reject expired intent', async () => {
      const intent: IntentEvent = {
        intentId: '0x123',
        user: '0x456',
        sourceToken: '0x86530a99784d188e8343e119140114d9e5fd0546',
        destToken: '0xfe4e746ca450c46fe6ede5eac184a7f2082b2312',
        sourceAmount: ethers.parseEther('1'),
        minDestAmount: ethers.parseEther('0.01'),
        maxSolverFee: ethers.parseEther('0.001'),
        expiry: Math.floor(Date.now() / 1000) + 60,
        blockNumber: 100,
        transactionHash: '0xabc',
      };

      const result = await evaluator.evaluate(intent);
      expect(result.shouldFulfill).toBe(false);
      expect(result.reason).toContain('too soon');
    });

    it('should reject small amount', async () => {
      const intent: IntentEvent = {
        intentId: '0x123',
        user: '0x456',
        sourceToken: '0x86530a99784d188e8343e119140114d9e5fd0546',
        destToken: '0xfe4e746ca450c46fe6ede5eac184a7f2082b2312',
        sourceAmount: ethers.parseEther('0.0001'),
        minDestAmount: ethers.parseEther('0.0001'),
        maxSolverFee: ethers.parseEther('0.00001'),
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xabc',
      };

      const result = await evaluator.evaluate(intent);
      expect(result.shouldFulfill).toBe(false);
      expect(result.reason).toContain('too small');
    });

    it('should accept profitable intent', async () => {
      const intent: IntentEvent = {
        intentId: '0x123',
        user: '0x456',
        sourceToken: '0x86530a99784d188e8343e119140114d9e5fd0546',
        destToken: '0xfe4e746ca450c46fe6ede5eac184a7f2082b2312',
        sourceAmount: ethers.parseEther('100'),
        minDestAmount: ethers.parseEther('1'),
        maxSolverFee: ethers.parseEther('0.001'),
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xabc',
      };

      const result = await evaluator.evaluate(intent);
      expect(result.shouldFulfill).toBe(true);
      expect(result.reason).toBe('Profitable');
      expect(result.estimatedOutput).toBeGreaterThan(0n);
    });
  });

  describe('MockDEXAdapter', () => {
    const adapter = new MockDEXAdapter();

    it('should return quote for supported pair', async () => {
      const quote = await adapter.getQuote(
        '0xfe4e746ca450c46fe6ede5eac184a7f2082b2312',
        '0x86530a99784d188e8343e119140114d9e5fd0546',
        ethers.parseEther('1000')
      );
      expect(quote.inputAmount).toBe(ethers.parseEther('1000'));
      expect(quote.outputAmount).toBeGreaterThan(0n);
      expect(quote.exchangeRate).toBe(0.05);
    });

    it('should return 1:1 for stablecoin pair', async () => {
      const quote = await adapter.getQuote('USDC', 'USDT', ethers.parseEther('1000'));
      expect(quote.exchangeRate).toBe(1);
    });

    it('should return mock swap transaction', async () => {
      const quote = await adapter.getQuote('USDC', 'USDT', ethers.parseEther('100'));
      const mockSigner = {} as ethers.Signer;
      const tx = await adapter.executeSwap(quote, mockSigner);
      expect(tx.hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('StateManager', () => {
    let state: StateManager;

    beforeEach(() => {
      state = new StateManager(':memory:', { info: () => {}, error: () => {} });
    });

    it('should add and retrieve pending intents', () => {
      state.addPendingIntent({
        intentId: '0x123',
        user: '0x456',
        sourceToken: '0x789',
        sourceAmount: '1000',
        destToken: '0xabc',
        minDestAmount: '900',
        maxSolverFee: '10',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xdef',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      const pending = state.getPendingIntents();
      expect(pending).toHaveLength(1);
      expect(pending[0].intentId).toBe('0x123');
    });

    it('should mark intent as completed', () => {
      state.addPendingIntent({
        intentId: '0x123',
        user: '0x456',
        sourceToken: '0x789',
        sourceAmount: '1000',
        destToken: '0xabc',
        minDestAmount: '900',
        maxSolverFee: '10',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xdef',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      state.markCompleted('0x123');
      expect(state.getPendingIntents()).toHaveLength(0);
      expect(state.getCompletedIntents()).toHaveLength(1);
    });

    it('should track seen intents', () => {
      expect(state.hasSeenIntent('0xabc')).toBe(false);
      state.markIntentSeen('0xabc');
      expect(state.hasSeenIntent('0xabc')).toBe(true);
    });

    it('should log decisions', () => {
      state.logDecision({
        timestamp: Math.floor(Date.now() / 1000),
        intentId: '0x123',
        decision: 'detected',
        reason: 'Intent detected',
      });

      const logs = state.getDecisionLogs('0x123');
      expect(logs).toHaveLength(1);
      expect(logs[0].decision).toBe('detected');
    });

    it('should schedule retries with exponential backoff', () => {
      state.addPendingIntent({
        intentId: '0x123',
        user: '0x456',
        sourceToken: '0x789',
        sourceAmount: '1000',
        destToken: '0xabc',
        minDestAmount: '900',
        maxSolverFee: '10',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xdef',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      const scheduled = state.scheduleRetry('0x123', 'nonce error', 100, 3);
      expect(scheduled).toBe(true);
      const intent = state.getIntent('0x123')!;
      expect(intent.attempts).toBe(1);
      expect(intent.status).toBe('pending');
      expect(intent.nextRetryAt).toBeGreaterThan(Date.now());
    });

    it('should mark intent as failed after max retries', () => {
      state.addPendingIntent({
        intentId: '0x123',
        user: '0x456',
        sourceToken: '0x789',
        sourceAmount: '1000',
        destToken: '0xabc',
        minDestAmount: '900',
        maxSolverFee: '10',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xdef',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      state.scheduleRetry('0x123', 'error 1', 1, 2);
      const failed = state.scheduleRetry('0x123', 'error 2', 1, 2);
      expect(failed).toBe(false);
      expect(state.getFailedIntents()).toHaveLength(1);
    });
  });

  describe('CircuitBreaker', () => {
    it('should allow calls when closed', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 1000, halfOpenMaxCalls: 1 });
      const result = await breaker.execute(async () => 'ok');
      expect(result).toBe('ok');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should open after threshold failures', async () => {
      const breaker = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 1000, halfOpenMaxCalls: 1 });
      await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
      await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
      await expect(breaker.execute(async () => 'ok')).rejects.toThrow('OPEN');
      expect(breaker.getState()).toBe('OPEN');
    });
  });
});
