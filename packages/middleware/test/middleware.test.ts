import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';

describe('Middleware API', () => {
  const apiKey = 'testnet-key';

  describe('Health Check', () => {
    it('should return 200 OK', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('Payment Request', () => {
    it('should return 402 with payment details', async () => {
      const res = await request(app)
        .get('/v1/payment-request?intentId=0x123&payer=0x456')
        .set('X-API-Key', apiKey);
      
      expect(res.status).toBe(402);
      expect(res.body).toHaveProperty('amount');
      expect(res.body).toHaveProperty('recipient');
      expect(res.body).toHaveProperty('nonce');
    });

    it('should return 401 without API key', async () => {
      const res = await request(app).get('/v1/payment-request?intentId=0x123&payer=0x456');
      expect(res.status).toBe(401);
    });

    it('should return 400 with missing params', async () => {
      const res = await request(app)
        .get('/v1/payment-request')
        .set('X-API-Key', apiKey);
      
      expect(res.status).toBe(400);
    });
  });

  describe('Payment Acceptance', () => {
    it('should accept valid payment and return proof', async () => {
      const res = await request(app)
        .post('/v1/pay')
        .set('X-API-Key', apiKey)
        .send({
          intentId: '0x123',
          solverAddress: '0x456',
          amount: '100',
          nonce: '123456',
          signature: '0xabc',
        });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('proof');
      expect(res.body).toHaveProperty('signature');
    });

    it('should reject replay nonce', async () => {
      // First request
      await request(app)
        .post('/v1/pay')
        .set('X-API-Key', apiKey)
        .send({
          intentId: '0x123',
          solverAddress: '0x456',
          amount: '100',
          nonce: 'same-nonce',
          signature: '0xabc',
        });

      // Second request with same nonce
      const res = await request(app)
        .post('/v1/pay')
        .set('X-API-Key', apiKey)
        .send({
          intentId: '0x123',
          solverAddress: '0x456',
          amount: '100',
          nonce: 'same-nonce',
          signature: '0xabc',
        });
      
      expect(res.status).toBe(409);
    });
  });

  describe('Metrics', () => {
    it('should return metrics', async () => {
      const res = await request(app).get('/v1/metrics');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalRequests');
      expect(res.body).toHaveProperty('proofsIssued');
    });
  });
});
