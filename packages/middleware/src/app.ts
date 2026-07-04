import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import {
  getIntentDetails,
  getIntentPaymentRequirements,
  addQuote,
  getQuotes,
  validatePaymentPayload,
  safeBase64Encode,
  safeBase64Decode,
  type Quote,
} from './store';
import { verifyEIP3009, settleEIP3009 } from './eip3009';

dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://erpc.apothem.network';
const SIGNER_KEY = process.env.MIDDLEWARE_SIGNER_PRIVATE_KEY || '';
const API_KEY = process.env.MIDDLEWARE_API_KEY || 'testnet2024';
const INTENT_REGISTRY_ADDRESS = process.env.INTENT_REGISTRY_ADDRESS || '';

export const provider = new ethers.JsonRpcProvider(RPC_URL);
export const signer = new ethers.Wallet(SIGNER_KEY, provider);

export const metrics = {
  totalRequests: 0,
  proofsIssued: 0,
  totalErrors: 0,
  paymentsAccepted: 0,
  quotesReceived: 0,
};

export const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  metrics.totalRequests++;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    metrics.totalErrors++;
    return res.status(401).json({ error: 'Unauthorized. Invalid or missing API key.' });
  }
  next();
};

export const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API_KEY || '100'),
  message: { error: 'Too many requests. Limit: 100 per minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const addressLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_ADDRESS || '10'),
  message: { error: 'Too many requests. Limit: 10 per minute per address.' },
  keyGenerator: (req: Request) => req.body.solverAddress || req.query.payer || req.ip,
});

app.get('/health', async (req: Request, res: Response) => {
  const health = { status: 'ok', timestamp: new Date().toISOString(), dependencies: { rpc: 'connected', contract: 'reachable' } };
  try {
    await provider.getBlockNumber();
  } catch {
    health.status = 'degraded';
    health.dependencies.rpc = 'disconnected';
  }
  try {
    await (new ethers.Contract(INTENT_REGISTRY_ADDRESS, ['function getIntent(bytes32) view returns (bool)'], provider)).getIntent(ethers.ZeroHash);
  } catch {
    health.status = 'degraded';
    health.dependencies.contract = 'unreachable';
  }
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.get('/v1/intents/:intentId/quotes', async (req: Request, res: Response) => {
  try {
    const quotes = getQuotes(req.params.intentId);
    res.json({ intentId: req.params.intentId, quotes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/v1/quotes', apiKeyAuth, apiKeyLimiter, async (req: Request, res: Response) => {
  const { intentId, solverAddress, outputAmount, feeBps, signature } = req.body;
  if (!intentId || !solverAddress || !outputAmount || signature === undefined) {
    metrics.totalErrors++;
    return res.status(400).json({ error: 'Missing intentId, solverAddress, outputAmount, or signature' });
  }

  try {
    const intent = await getIntentDetails(intentId);
    if (intent.status !== 0) {
      return res.status(404).json({ error: 'Intent is not open' });
    }
    if (BigInt(outputAmount) < BigInt(intent.minDestAmount)) {
      return res.status(400).json({ error: 'Quote below minDestAmount' });
    }

    const quote: Quote = {
      intentId,
      solverAddress: ethers.getAddress(solverAddress),
      outputAmount: outputAmount.toString(),
      feeBps: Number(feeBps) || 0,
      signature,
      createdAt: Date.now(),
    };
    addQuote(quote);
    metrics.quotesReceived++;
    res.json({ success: true, quote });
  } catch (error: any) {
    metrics.totalErrors++;
    res.status(500).json({ error: error.message });
  }
});

app.get('/v1/intents/:intentId/payment-required', async (req: Request, res: Response) => {
  try {
    const intent = await getIntentDetails(req.params.intentId);
    if (intent.status !== 0) {
      return res.status(404).json({ error: 'Intent is not open' });
    }
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const paymentRequired = await getIntentPaymentRequirements(req.params.intentId, intent.destToken, intent.maxSolverFee, signer.address, url);
    res.setHeader('PAYMENT-REQUIRED', safeBase64Encode(paymentRequired));
    res.status(402).json({ ...paymentRequired, error: 'PAYMENT-SIGNATURE header required' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/v1/intents/:intentId/settle', apiKeyAuth, addressLimiter, async (req: Request, res: Response) => {
  const paymentHeader = req.headers['payment-signature'] as string | undefined;
  if (!paymentHeader) {
    return res.status(402).json({ error: 'Missing PAYMENT-SIGNATURE header' });
  }

  try {
    const intent = await getIntentDetails(req.params.intentId);
    if (intent.status !== 0) {
      return res.status(404).json({ error: 'Intent is not open' });
    }

    const decoded = safeBase64Decode(paymentHeader);
    if (!validatePaymentPayload(decoded)) {
      return res.status(400).json({ error: 'Invalid payment signature payload' });
    }
    const paymentPayload = decoded;

    const requirements = (await getIntentPaymentRequirements(req.params.intentId, intent.destToken, intent.maxSolverFee, signer.address, `${req.protocol}://${req.get('host')}${req.originalUrl}`)).accepts[0];

    const verifyResult = await verifyEIP3009(provider, requirements, paymentPayload);
    if (!verifyResult.isValid) {
      metrics.totalErrors++;
      return res.status(402).json({ error: verifyResult.invalidReason, message: verifyResult.invalidMessage });
    }

    const settleResult = await settleEIP3009(signer, requirements, paymentPayload);
    if (!settleResult.success) {
      metrics.totalErrors++;
      return res.status(402).json({ error: settleResult.errorReason, message: settleResult.errorMessage });
    }

    metrics.paymentsAccepted++;
    metrics.proofsIssued++;

    const response = { success: true, transaction: settleResult.transaction, intentId: req.params.intentId };
    res.setHeader('PAYMENT-RESPONSE', safeBase64Encode(response));
    res.json(response);
  } catch (error: any) {
    metrics.totalErrors++;
    res.status(500).json({ error: error.message });
  }
});

app.get('/v1/metrics', (req: Request, res: Response) => {
  res.json(metrics);
});

app.get('/v1/intents/:intentId', async (req: Request, res: Response) => {
  try {
    const intent = await getIntentDetails(req.params.intentId);
    res.json(intent);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
