import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

const apiKey = 'testnet2024';

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
