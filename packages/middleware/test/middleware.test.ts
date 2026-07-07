import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { ethers } from 'ethers';
import * as store from '../src/store';
import * as eip3009 from '../src/eip3009';
import * as appModule from '../src/app';

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
    getBridgeStatus: vi.fn(),
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
const validIntentId = '0x' + '12'.repeat(32);
const invalidIntentId = '0x123';
const validSolver = ethers.getAddress('0x0000000000000000000000000000000000000001');
const validSolver2 = ethers.getAddress('0x0000000000000000000000000000000000000002');

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
      extra: { intentId: validIntentId, tokenName: 'Mock USDC', tokenVersion: '1' },
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
  describe('Request ID tracing', () => {
    it('propagates X-Request-ID header', async () => {
      const res = await request(appModule.app).get('/health').set('X-Request-ID', 'test-req-123');
      expect(res.headers['x-request-id']).toBe('test-req-123');
    });

    it('generates X-Request-ID when not provided', async () => {
      const res = await request(appModule.app).get('/health');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.headers['x-request-id']).not.toBe('');
    });
  });

  describe('Health Check', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return 200 OK when all dependencies are healthy', async () => {
      vi.spyOn(appModule.healthChecks, 'checkRpcProvider').mockResolvedValue({ name: 'rpc', status: 'ok', detail: 'block 12345' });
      vi.spyOn(appModule.healthChecks, 'checkContractDependency')
        .mockResolvedValueOnce({ name: 'intentRegistry', status: 'ok' })
        .mockResolvedValueOnce({ name: 'paymentVerifier', status: 'ok' });

      const res = await request(appModule.app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body.dependencies).toHaveProperty('rpc');
      expect(res.body.dependencies).toHaveProperty('intentRegistry');
      expect(res.body.dependencies).toHaveProperty('paymentVerifier');
      expect(res.body.dependencies.rpc).toBe('ok');
    });

    it('should return 503 with details when dependencies are degraded', async () => {
      vi.spyOn(appModule.healthChecks, 'checkRpcProvider').mockResolvedValue({ name: 'rpc', status: 'degraded', detail: 'network disconnected' });
      vi.spyOn(appModule.healthChecks, 'checkContractDependency')
        .mockResolvedValueOnce({ name: 'intentRegistry', status: 'degraded', detail: 'call failed' })
        .mockResolvedValueOnce({ name: 'paymentVerifier', status: 'degraded', detail: 'call failed' });

      const res = await request(appModule.app).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.dependencies.rpc).toMatchObject({ status: 'degraded', detail: 'network disconnected' });
      expect(res.body.dependencies.intentRegistry).toMatchObject({ status: 'degraded' });
      expect(res.body.dependencies.paymentVerifier).toMatchObject({ status: 'degraded' });
    });
  });

  describe('Quote endpoints', () => {
    it('GET /v1/intents/:intentId/quotes returns empty quotes list', async () => {
      const res = await request(appModule.app).get(`/v1/intents/${validIntentId}/quotes`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ intentId: validIntentId, quotes: [] });
    });

    it('POST /v1/quotes rejects missing API key', async () => {
      const res = await request(appModule.app).post('/v1/quotes').send({});
      expect(res.status).toBe(401);
    });

    it('POST /v1/quotes rejects invalid intentId', async () => {
      const res = await request(appModule.app)
        .post('/v1/quotes')
        .set('X-API-Key', apiKey)
        .send({ intentId: invalidIntentId, solverAddress: validSolver, outputAmount: '1000', signature: '0x00' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('intentId');
    });

    it('POST /v1/quotes rejects non-checksummed solverAddress', async () => {
      const res = await request(appModule.app)
        .post('/v1/quotes')
        .set('X-API-Key', apiKey)
        .send({ intentId: validIntentId, solverAddress: '0x000000000000000000000000000000000000000a', outputAmount: '1000', signature: '0x00' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('solverAddress');
    });

    it('POST /v1/quotes rejects non-positive outputAmount', async () => {
      const res = await request(appModule.app)
        .post('/v1/quotes')
        .set('X-API-Key', apiKey)
        .send({ intentId: validIntentId, solverAddress: validSolver, outputAmount: '0', signature: '0x00' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('outputAmount');
    });

    it('POST /v1/quotes with API key validates body', async () => {
      vi.mocked(store.getIntentDetails).mockRejectedValue(new Error('not found'));
      const res = await request(appModule.app)
        .post('/v1/quotes')
        .set('X-API-Key', apiKey)
        .send({ intentId: validIntentId, solverAddress: validSolver, outputAmount: '1000', signature: '0x00' });
      expect([404, 500]).toContain(res.status);
    });
  });

  describe('x402 Payment endpoints', () => {
    beforeEach(() => {
      store.clearQuotes(validIntentId);
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      store.clearQuotes(validIntentId);
    });

    it('GET /v1/intents/:intentId/payment-required returns 402, 404, or 500', async () => {
      const res = await request(appModule.app).get(`/v1/intents/${validIntentId}/payment-required`);
      expect([402, 404, 500]).toContain(res.status);
    });

    it('POST /v1/intents/:intentId/settle rejects invalid intentId', async () => {
      const res = await request(appModule.app)
        .post(`/v1/intents/${invalidIntentId}/settle`)
        .set('X-API-Key', apiKey)
        .set('payment-signature', 'header')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('intentId');
    });

    it('POST /v1/intents/:intentId/settle rejects missing PAYMENT-SIGNATURE header', async () => {
      const res = await request(appModule.app)
        .post(`/v1/intents/${validIntentId}/settle`)
        .set('X-API-Key', apiKey)
        .send({});
      expect(res.status).toBe(402);
      expect(res.body.error).toBe('Missing PAYMENT-SIGNATURE header');
    });

    it('POST /v1/intents/:intentId/settle rejects solver not in allowedSolvers', async () => {
      const { header } = buildPaymentPayload(validSolver);

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: validIntentId,
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
        allowedSolvers: [validSolver2],
        solver: ethers.ZeroAddress,
        fulfilledAmount: '0',
        paymentTxHash: ethers.ZeroHash,
      } as any);

      const res = await request(appModule.app)
        .post(`/v1/intents/${validIntentId}/settle`)
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Solver not in allowedSolvers');
    });

    it('POST /v1/intents/:intentId/settle rejects unregistered solver', async () => {
      const { header } = buildPaymentPayload(validSolver);

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: validIntentId,
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

      const res = await request(appModule.app)
        .post(`/v1/intents/${validIntentId}/settle`)
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Solver not registered or does not support destination chain');
    });

    it('POST /v1/intents/:intentId/settle rejects solver without winning quote', async () => {
      const { header } = buildPaymentPayload(validSolver);

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: validIntentId,
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

      const res = await request(appModule.app)
        .post(`/v1/intents/${validIntentId}/settle`)
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Solver does not have the winning quote for this intent');
    });

    it('POST /v1/intents/:intentId/settle rejects invalid quote signature', async () => {
      const { header } = buildPaymentPayload(validSolver);

      store.addQuote({
        intentId: validIntentId,
        solverAddress: validSolver,
        outputAmount: '950',
        feeBps: 30,
        signature: '0xbad',
        createdAt: Date.now(),
      });

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: validIntentId,
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

      const res = await request(appModule.app)
        .post(`/v1/intents/${validIntentId}/settle`)
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid quote signature');
    });

    it('POST /v1/intents/:intentId/settle rejects non-facilitator signer', async () => {
      const { header } = buildPaymentPayload(validSolver);

      store.addQuote({
        intentId: validIntentId,
        solverAddress: validSolver,
        outputAmount: '950',
        feeBps: 30,
        signature: '0xgood',
        createdAt: Date.now(),
      });

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: validIntentId,
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

      const res = await request(appModule.app)
        .post(`/v1/intents/${validIntentId}/settle`)
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Middleware signer is not a registered facilitator');
    });

    it('POST /v1/intents/:intentId/settle fulfills intent after successful EIP-3009 settlement', async () => {
      const { header } = buildPaymentPayload(validSolver);
      const paymentTxHash = '0xpaymenttxhash0000000000000000000000000000000000000000000000000000';
      const fulfillTxHash = '0xfulfilltxhash0000000000000000000000000000000000000000000000000000';

      store.addQuote({
        intentId: validIntentId,
        solverAddress: validSolver,
        outputAmount: '950',
        feeBps: 30,
        signature: '0xgood',
        createdAt: Date.now(),
      });

      vi.mocked(store.getIntentDetails).mockResolvedValue({
        intentId: validIntentId,
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
          extra: { intentId: validIntentId, tokenName: 'Mock USDC', tokenVersion: '1' },
        }],
      });
      vi.mocked(eip3009.verifyEIP3009).mockResolvedValue({ isValid: true, payer: validSolver });
      vi.mocked(eip3009.settleEIP3009).mockResolvedValue({ success: true, transaction: paymentTxHash });
      vi.mocked(store.fulfillIntent).mockResolvedValue({ hash: fulfillTxHash } as any);

      const res = await request(appModule.app)
        .post(`/v1/intents/${validIntentId}/settle`)
        .set('X-API-Key', apiKey)
        .set('payment-signature', header)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transaction).toBe(paymentTxHash);
      expect(res.body.fulfillTransaction).toBe(fulfillTxHash);
      expect(res.body.destAmount).toBe('950');
      expect(store.fulfillIntent).toHaveBeenCalledWith(validIntentId, '950', paymentTxHash, validSolver, expect.any(Object));
    });
  });

  describe('Metrics', () => {
    it('should return metrics', async () => {
      const res = await request(appModule.app).get('/v1/metrics');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalRequests');
      expect(res.body).toHaveProperty('proofsIssued');
      expect(res.body).toHaveProperty('quotesReceived');
    });
  });

  describe('Bridge status', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('GET /v1/intents/:intentId/bridge-status returns richer status', async () => {
      vi.mocked(store.getBridgeStatus).mockResolvedValue({
        intentId: validIntentId,
        sourceChainId: 51,
        destChainId: 88888,
        state: 'locked',
        locked: true,
        lockedAmount: '1000',
        lockedToken: '0x86530A99784D188e8343e119140114d9e5fD0546',
        minted: false,
        mintedAmount: '0',
        processed: false,
        bridgeOutTxHash: '0xout',
        updatedAt: Date.now(),
      });

      const res = await request(appModule.app).get(`/v1/intents/${validIntentId}/bridge-status`);
      expect(res.status).toBe(200);
      expect(res.body.state).toBe('locked');
      expect(res.body.locked).toBe(true);
      expect(res.body.destChainId).toBe(88888);
      expect(res.body.bridgeOutTxHash).toBe('0xout');
    });
  });
});
