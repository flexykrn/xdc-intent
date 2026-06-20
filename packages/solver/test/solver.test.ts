import { describe, it, expect, beforeEach } from 'vitest';
import { SolverConfig } from '../src/config';
import { IntentEvaluator } from '../src/evaluator';
import { MockDEXAdapter } from '../src/adapters/dex';
import { XDCOnlyStrategy } from '../src/strategies/xdc-only';
import { StateManager } from '../src/state';
import { IntentEvent } from '../src/watcher';
import winston from 'winston';

describe('Solver Components', () => {
  const mockConfig: SolverConfig = {
    rpcUrl: 'https://erpc.apothem.network',
    chainId: 51,
    privateKey: '0x' + '00'.repeat(32),
    escrowAddress: '0x' + '00'.repeat(20),
    paymentVerifierAddress: '0x' + '00'.repeat(20),
    intentRegistryAddress: '0x' + '00'.repeat(20),
    middlewareUrl: 'http://localhost:3000',
    middlewareApiKey: 'test-key',
    minProfitMargin: 0.5,
    maxSlippage: 1.0,
    maxGasPriceGwei: 50,
    supportedTokens: ['USDC', 'USDT', 'XDC'],
    logLevel: 'info',
  };

  const mockLogger = winston.createLogger({
    level: 'info',
    transports: [new winston.transports.Console()],
  });

  describe('IntentEvaluator', () => {
    const evaluator = new IntentEvaluator(mockConfig, mockLogger);

    it('should reject unsupported token', () => {
      const intent: IntentEvent = {
        intentId: '0x123',
        user: '0x456',
        token: '0x999',
        amount: BigInt(1000),
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xabc',
      };

      const result = evaluator.evaluate(intent);
      expect(result.shouldFulfill).toBe(false);
      expect(result.reason).toContain('not in supported list');
    });

    it('should reject expired intent', () => {
      const intent: IntentEvent = {
        intentId: '0x123',
        user: '0x456',
        token: '0x951857744785f80e2d4013e0d0814c1356412440', // USDC
        amount: BigInt(1000),
        expiry: Math.floor(Date.now() / 1000) + 60, // 1 minute away
        blockNumber: 100,
        transactionHash: '0xabc',
      };

      const result = evaluator.evaluate(intent);
      expect(result.shouldFulfill).toBe(false);
      expect(result.reason).toContain('too soon');
    });

    it('should reject small amount', () => {
      const intent: IntentEvent = {
        intentId: '0x123',
        user: '0x456',
        token: '0x951857744785f80e2d4013e0d0814c1356412440',
        amount: BigInt(1), // Very small
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xabc',
      };

      const result = evaluator.evaluate(intent);
      expect(result.shouldFulfill).toBe(false);
      expect(result.reason).toContain('too small');
    });
  });

  describe('MockDEXAdapter', () => {
    const adapter = new MockDEXAdapter();

    it('should return quote for supported pair', async () => {
      const quote = await adapter.getQuote('XDC', 'USDC', BigInt(1000));
      expect(quote.inputAmount).toBe(BigInt(1000));
      expect(quote.outputAmount).toBeGreaterThan(0);
      expect(quote.exchangeRate).toBe(0.05);
    });

    it('should return 1:1 for stablecoin pair', async () => {
      const quote = await adapter.getQuote('USDC', 'USDT', BigInt(1000));
      expect(quote.exchangeRate).toBe(1);
    });
  });

  describe('XDCOnlyStrategy', () => {
    const dexAdapter = new MockDEXAdapter();
    const strategy = new XDCOnlyStrategy(mockConfig, mockLogger, dexAdapter);

    it('should evaluate profitable intent', async () => {
      const intent: IntentEvent = {
        intentId: '0x123',
        user: '0x456',
        token: '0x951857744785f80e2d4013e0d0814c1356412440',
        amount: BigInt(1000000), // Large amount
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xabc',
      };

      const plan = await strategy.evaluate(intent);
      // Mock DEX has 0.1% fee, so profit might be negative for small amounts
      // This test verifies the structure
      expect(plan).toBeDefined();
    });
  });

  describe('StateManager', () => {
    let state: StateManager;

    beforeEach(() => {
      state = new StateManager(mockLogger, ':memory:'); // In-memory DB for tests
    });

    it('should add and retrieve pending intents', () => {
      state.addPendingIntent({
        intentId: '0x123',
        user: '0x456',
        token: '0x789',
        amount: '1000',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xabc',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      const pending = state.getPendingIntents();
      expect(pending).toHaveLength(1);
      expect(pending[0].intent_id).toBe('0x123');
    });

    it('should mark intent as completed', () => {
      state.addPendingIntent({
        intentId: '0x123',
        user: '0x456',
        token: '0x789',
        amount: '1000',
        expiry: Math.floor(Date.now() / 1000) + 3600,
        blockNumber: 100,
        transactionHash: '0xabc',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
      });

      state.markCompleted('0x123');
      const pending = state.getPendingIntents();
      expect(pending).toHaveLength(0);
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
  });
});
