import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { ethers } from 'ethers';
import * as store from '../src/store';
import * as eip3009 from '../src/eip3009';
import { app } from '../src/app';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return {
    ...actual,
    getIntentDetails: vi.fn(),
    isAllowedSolver: vi.fn(),
    isSolverRegisteredAndSupportsChain: vi.fn(),
    verifyQuoteSignature: vi.fn(),
    isFacilitator: vi.fn(),
    fulfillIntent: vi.fn(),
    getIntentPaymentRequirements: vi.fn(),
  };
});

vi.mock('../src/eip3009', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/eip3009')>();
  return {
    ...actual,
    verifyEIP3009: vi.fn(),
    settleEIP3009: vi.fn(),
  };
});

const apiKey = 'testnet2024';

function buildPaymentPayload(solverAddress: string, amount = '100'): { header: string; payload: any } {
  const payload = {
    x402Version: 2,
    accepted: {
      scheme: 'exact',
      network: 'eip155:51',
      asset: '0x86530A99784D188e8343e119140114d9e5fD0546',
      amount,
      payTo: '0xfacilitator000000000000000000000000000000',
      maxTimeoutSeconds: 600,
      extra: { intentId: '0x123', tokenName: 'Mock USDC', tokenVersion: '1' },
    },
    payload: {
      authorization: {
        from: solverAddress,
        to: '0xfacilitator000000000000000000000000000000',
        value: amount,
        validAfter: '0',
        validBefore: '9999999999',
        nonce: ethers.keccak256(ethers.toUtf8Bytes('test-nonce')),
      },
      signature: '0x' + '00'.repeat(65),
    },
  };
  const header = Buffer.from(JSON.stringify(payload)).toString('base64');
  return { header, payload };
}

describe('Middleware API', () => {
  describe('Health Check', () => {
    it('should return 200 OK', async () => {
      const res = await request(app).get('/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('Quote endpoints', () => {
    it('GET /v1/intents/:intentId/quotes returns empty quotes list', async () => {
      const res = await request(app).get('/v1/intents/0x123/quotes');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ intentId: '0x123', quotes: [] });
    });

    it('POST /v1/quotes rejects missing API key', async () => {
      const res = await request(app).post('/v1/quotes').send({});
      expect(res.status).toBe(401);
    });

    it('POST /v1/quotes with API key validates body', async () => {
      const res = await request(app)
        .post('/v1/quotes')
        .set('X-API-Key', apiKey)
        .send({ intentId: '0x123', solverAddress: '0x0000000000000000000000000000000000000001', outputAmount: '1000' });
      expect([400, 404, 500]).toContain(res.status);
    });
  });

  describe('x402 Payment endpoints', () => {
    beforeEach(() => {
      store.clearQuotes('0x123');
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      store.clearQuotes('0x123');
    });

    it('GET /v1/intents/:intentId/payment-required returns 402, 404, or 500', async () => {
      const res = await request(app).get('/v1/intents/0x123/payment-required');
      expect([402, 404, 500]).toContain(res.status);
    });

    it('POST /v1/intents/:intentId/settle rejects missing PAYMENT-SIGNATURE header', async () => {
      const res = await request(app)
        .post('/v1/intents/0x123/settle')
        .set('X-API-Key', apiKey)
        .send({});
      expect(res.status).toBe(402);
      expect(res.body.error).toBe('Missing PAYMENT-SIGNATURE header');
    });

    it('POST /v1/intents/:intentId/settle rejects solver not in allowedSolvers', async () => {
      const solver = '0x0000000000000000000000000000000000000001';
      const { header } = buildPaymentPayload(solver);

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: '0x123',
        status: 0,
        user: '0xuser000000000000000000000000000000000000',
        sourceChainId: 50,
        sourceToken: '0xsourceToken000000000000000000000000000000',
        sourceAmount: '1000',
        destChainId: 51,
        destToken: '0xdestToken0000000000000000000000000000000',
        minDestAmount: '900',
        maxSolverFee: '100',
        expiry: 9999999999,
        nonce: '1',
        allowedSolvers: ['0x0000000000000000000000000000000000000002'],
        solver: ethers.ZeroAddress,
        fulfilledAmount: '0',
        paymentTxHash: ethers.ZeroHash,
      } as any);

      const res = await request(app)
        .post('/v1/intents/0x123/settle')
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Solver not in allowedSolvers');
    });

    it('POST /v1/intents/:intentId/settle rejects unregistered solver', async () => {
      const solver = '0x0000000000000000000000000000000000000001';
      const { header } = buildPaymentPayload(solver);

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: '0x123',
        status: 0,
        user: '0xuser000000000000000000000000000000000000',
        sourceChainId: 50,
        sourceToken: '0xsourceToken000000000000000000000000000000',
        sourceAmount: '1000',
        destChainId: 51,
        destToken: '0xdestToken0000000000000000000000000000000',
        minDestAmount: '900',
        maxSolverFee: '100',
        expiry: 9999999999,
        nonce: '1',
        allowedSolvers: [],
        solver: ethers.ZeroAddress,
        fulfilledAmount: '0',
        paymentTxHash: ethers.ZeroHash,
      } as any);
      vi.mocked(store.isAllowedSolver).mockReturnValue(true);
      vi.mocked(store.isSolverRegisteredAndSupportsChain).mockResolvedValue(false);

      const res = await request(app)
        .post('/v1/intents/0x123/settle')
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Solver not registered or does not support destination chain');
    });

    it('POST /v1/intents/:intentId/settle rejects solver without winning quote', async () => {
      const solver = '0x0000000000000000000000000000000000000001';
      const { header } = buildPaymentPayload(solver);

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: '0x123',
        status: 0,
        user: '0xuser000000000000000000000000000000000000',
        sourceChainId: 50,
        sourceToken: '0xsourceToken000000000000000000000000000000',
        sourceAmount: '1000',
        destChainId: 51,
        destToken: '0xdestToken0000000000000000000000000000000',
        minDestAmount: '900',
        maxSolverFee: '100',
        expiry: 9999999999,
        nonce: '1',
        allowedSolvers: [],
        solver: ethers.ZeroAddress,
        fulfilledAmount: '0',
        paymentTxHash: ethers.ZeroHash,
      } as any);
      vi.mocked(store.isAllowedSolver).mockReturnValue(true);
      vi.mocked(store.isSolverRegisteredAndSupportsChain).mockResolvedValue(true);

      const res = await request(app)
        .post('/v1/intents/0x123/settle')
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Solver does not have the winning quote for this intent');
    });

    it('POST /v1/intents/:intentId/settle rejects invalid quote signature', async () => {
      const solver = '0x0000000000000000000000000000000000000001';
      const { header } = buildPaymentPayload(solver);

      store.addQuote({
        intentId: '0x123',
        solverAddress: solver,
        outputAmount: '950',
        feeBps: 30,
        signature: '0xbad',
        createdAt: Date.now(),
      });

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: '0x123',
        status: 0,
        user: '0xuser000000000000000000000000000000000000',
        sourceChainId: 50,
        sourceToken: '0xsourceToken000000000000000000000000000000',
        sourceAmount: '1000',
        destChainId: 51,
        destToken: '0xdestToken0000000000000000000000000000000',
        minDestAmount: '900',
        maxSolverFee: '100',
        expiry: 9999999999,
        nonce: '1',
        allowedSolvers: [],
        solver: ethers.ZeroAddress,
        fulfilledAmount: '0',
        paymentTxHash: ethers.ZeroHash,
      } as any);
      vi.mocked(store.isAllowedSolver).mockReturnValue(true);
      vi.mocked(store.isSolverRegisteredAndSupportsChain).mockResolvedValue(true);
      vi.mocked(store.verifyQuoteSignature).mockReturnValue(false);

      const res = await request(app)
        .post('/v1/intents/0x123/settle')
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid quote signature');
    });

    it('POST /v1/intents/:intentId/settle rejects non-facilitator signer', async () => {
      const solver = '0x0000000000000000000000000000000000000001';
      const { header } = buildPaymentPayload(solver);

      store.addQuote({
        intentId: '0x123',
        solverAddress: solver,
        outputAmount: '950',
        feeBps: 30,
        signature: '0xgood',
        createdAt: Date.now(),
      });

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: '0x123',
        status: 0,
        user: '0xuser000000000000000000000000000000000000',
        sourceChainId: 50,
        sourceToken: '0xsourceToken000000000000000000000000000000',
        sourceAmount: '1000',
        destChainId: 51,
        destToken: '0xdestToken0000000000000000000000000000000',
        minDestAmount: '900',
        maxSolverFee: '100',
        expiry: 9999999999,
        nonce: '1',
        allowedSolvers: [],
        solver: ethers.ZeroAddress,
        fulfilledAmount: '0',
        paymentTxHash: ethers.ZeroHash,
      } as any);
      vi.mocked(store.isAllowedSolver).mockReturnValue(true);
      vi.mocked(store.isSolverRegisteredAndSupportsChain).mockResolvedValue(true);
      vi.mocked(store.verifyQuoteSignature).mockReturnValue(true);
      vi.mocked(store.isFacilitator).mockResolvedValue(false);

      const res = await request(app)
        .post('/v1/intents/0x123/settle')
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Middleware signer is not a registered facilitator');
    });

    it('POST /v1/intents/:intentId/settle fulfills intent after successful EIP-3009 settlement', async () => {
      const solver = '0x0000000000000000000000000000000000000001';
      const { header } = buildPaymentPayload(solver);
      const paymentTxHash = '0xpaymenttxhash0000000000000000000000000000000000000000000000000000';
      const fulfillTxHash = '0xfulfilltxhash0000000000000000000000000000000000000000000000000000';

      store.addQuote({
        intentId: '0x123',
        solverAddress: solver,
        outputAmount: '950',
        feeBps: 30,
        signature: '0xgood',
        createdAt: Date.now(),
      });

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: '0x123',
        status: 0,
        user: '0xuser000000000000000000000000000000000000',
        sourceChainId: 50,
        sourceToken: '0xsourceToken000000000000000000000000000000',
        sourceAmount: '1000',
        destChainId: 51,
        destToken: '0xdestToken0000000000000000000000000000000',
        minDestAmount: '900',
        maxSolverFee: '100',
        expiry: 9999999999,
        nonce: '1',
        allowedSolvers: [],
        solver: ethers.ZeroAddress,
        fulfilledAmount: '0',
        paymentTxHash: ethers.ZeroHash,
      } as any);
      vi.mocked(store.isAllowedSolver).mockReturnValue(true);
      vi.mocked(store.isSolverRegisteredAndSupportsChain).mockResolvedValue(true);
      vi.mocked(store.verifyQuoteSignature).mockReturnValue(true);
      vi.mocked(store.isFacilitator).mockResolvedValue(true);
      vi.mocked(store.getIntentPaymentRequirements).mockResolvedValue({
        x402Version: 2,
        resource: { url: 'http://test' },
        accepts: [{
          scheme: 'exact',
          network: 'eip155:51',
          asset: '0x86530A99784D188e8343e119140114d9e5fD0546',
          amount: '100',
          payTo: '0xfacilitator000000000000000000000000000000',
          maxTimeoutSeconds: 600,
          extra: { intentId: '0x123', tokenName: 'Mock USDC', tokenVersion: '1' },
        }],
      });
      vi.mocked(eip3009.verifyEIP3009).mockResolvedValue({ isValid: true, payer: solver });
      vi.mocked(eip3009.settleEIP3009).mockResolvedValue({ success: true, transaction: paymentTxHash });
      vi.mocked(store.fulfillIntent).mockResolvedValue({ hash: fulfillTxHash } as any);

      const res = await request(app)
        .post('/v1/intents/0x123/settle')
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transaction).toBe(paymentTxHash);
      expect(res.body.fulfillTransaction).toBe(fulfillTxHash);
      expect(res.body.destAmount).toBe('950');
      expect(store.fulfillIntent).toHaveBeenCalledWith('0x123', '950', paymentTxHash, solver, expect.any(Object));
    });
  });

  describe('Metrics', () => {
    it('should return metrics', async () => {
      const res = await request(app).get('/v1/metrics');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalRequests');
      expect(res.body).toHaveProperty('proofsIssued');
      expect(res.body).toHaveProperty('quotesReceived');
    });
  });
});
