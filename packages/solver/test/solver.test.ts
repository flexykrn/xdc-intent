import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { SolverConfig } from '../src/config';
import { IntentEvaluator } from '../src/evaluator';
import { MockDEXAdapter } from '../src/adapters/dex';
import { StateManager } from '../src/state';
import { IntentEvent } from '../src/watcher';
import { CircuitBreaker } from '../src/circuit-breaker';
import { Solver } from '../src/index';
import winston from 'winston';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('Solver Components', () => {
  const mockConfig: SolverConfig = {
    rpcUrl: 'https://erpc.apothem.network',
    chainId: 51,
    privateKey: '0x' + '00'.repeat(31) + '01',
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
    minSourceAmount: 0.001,
    maxRetries: 3,
    retryBaseDelayMs: 100,
    retryMaxDelayMs: 1000,
  };

  const mockLogger = winston.createLogger({
    level: 'info',
    transports: [new winston.transports.Console({ silent: true })],
  });

  describe('IntentEvaluator', () => {
    const provider = new ethers.JsonRpcProvider('https://erpc.apothem.network');
    const dexAdapter = new MockDEXAdapter();
    const evaluator = new IntentEvaluator(mockConfig, mockLogger, provider, dexAdapter, 0.05);

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

  describe('Solver duplicate quote prevention', () => {
    let solver: Solver;
    const stateFilePath = path.join(os.tmpdir(), 'opencode', 'solver-state-test.json');

    const intent: IntentEvent = {
      intentId: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      user: '0x' + '11'.repeat(20),
      sourceChainId: 51,
      sourceToken: '0x' + '22'.repeat(20),
      sourceAmount: ethers.parseEther('100'),
      destChainId: 51,
      destToken: '0x' + '33'.repeat(20),
      minDestAmount: ethers.parseEther('1'),
      maxSolverFee: ethers.parseEther('0.001'),
      expiry: Math.floor(Date.now() / 1000) + 3600,
      blockNumber: 100,
      transactionHash: '0x' + '44'.repeat(32),
    };

    beforeEach(() => {
      process.env.RPC_URL = mockConfig.rpcUrl;
      process.env.CHAIN_ID = String(mockConfig.chainId);
      process.env.SOLVER_PRIVATE_KEY = mockConfig.privateKey;
      process.env.ESCROW_ADDRESS = mockConfig.escrowAddress;
      process.env.PAYMENT_VERIFIER_ADDRESS = mockConfig.paymentVerifierAddress;
      process.env.INTENT_REGISTRY_ADDRESS = mockConfig.intentRegistryAddress;
      process.env.SOLVER_REGISTRY_ADDRESS = mockConfig.solverRegistryAddress;
      process.env.FACILITATOR_URL = mockConfig.facilitatorUrl;
      process.env.FACILITATOR_API_KEY = mockConfig.facilitatorApiKey;
      process.env.STATE_FILE_PATH = stateFilePath;
      process.env.HTTP_PORT = String(mockConfig.httpPort);
      process.env.POLLING_INTERVAL_MS = String(mockConfig.pollingInterval);
      process.env.MIN_PROFIT_MARGIN = String(mockConfig.minProfitMargin);
      process.env.MAX_SLIPPAGE = String(mockConfig.maxSlippage);
      process.env.MAX_GAS_PRICE_GWEI = String(mockConfig.maxGasPriceGwei);
      process.env.SUPPORTED_TOKENS = mockConfig.supportedTokens.join(',');
      process.env.LOG_LEVEL = mockConfig.logLevel;
      process.env.SOLVER_NAME = mockConfig.solverName;
      process.env.SOLVER_FEE_BPS = String(mockConfig.solverFeeBps);
      process.env.SUPPORTED_CHAINS = '51';
      process.env.MIN_DEST_AMOUNT = String(mockConfig.minDestAmount);
      process.env.MIN_SOURCE_AMOUNT = String(mockConfig.minSourceAmount);
      process.env.MAX_RETRIES = String(mockConfig.maxRetries);
      process.env.RETRY_BASE_DELAY_MS = String(mockConfig.retryBaseDelayMs);
      process.env.RETRY_MAX_DELAY_MS = String(mockConfig.retryMaxDelayMs);

      solver = new Solver();
      (solver as any).isRunning = true;

      vi.spyOn((solver as any).evaluator, 'evaluate').mockResolvedValue({
        shouldFulfill: true,
        reason: 'Profitable',
        estimatedOutput: 1000n,
      });
      vi.spyOn((solver as any).inventory, 'hasSufficientBalance').mockResolvedValue(true);
      vi.spyOn((solver as any).facilitator, 'submitQuote').mockResolvedValue({ success: true });
      vi.spyOn(solver as any, 'waitForQuoteWin').mockResolvedValue(undefined);
      vi.spyOn((solver as any).fulfillmentBreaker, 'execute').mockResolvedValue({
        success: true,
        txHash: '0x' + '55'.repeat(32),
      });
    });

    afterEach(() => {
      solver.stop();
      try {
        fs.unlinkSync(stateFilePath);
      } catch {}
    });

    it('should submit only one quote when handleIntent is called concurrently', async () => {
      const handle = (solver as any).handleIntent.bind(solver);
      await Promise.all([handle(intent), handle(intent)]);
      expect((solver as any).facilitator.submitQuote).toHaveBeenCalledTimes(1);
    });

    it('should not treat losing the quote competition as retriable', () => {
      expect((solver as any).isRetriableError('Did not win quote competition')).toBe(false);
      expect((solver as any).isRetriableError('nonce conflict')).toBe(true);
    });
  });
});
