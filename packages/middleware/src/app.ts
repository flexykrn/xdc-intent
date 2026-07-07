import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import {
  getIntentDetails,
  getIntentPaymentRequirements,
  addQuote,
  getQuotes,
  getBestQuote,
  validatePaymentPayload,
  getBridgeStatus,
  safeBase64Encode,
  safeBase64Decode,
  verifyQuoteSignature,
  isAllowedSolver,
  isSolverRegisteredAndSupportsChain,
  isFacilitator,
  fulfillIntent,
  type Quote,
} from './store';
import { verifyEIP3009, settleEIP3009 } from './eip3009';

dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://erpc.apothem.network';
const SIGNER_KEY = process.env.FACILITATOR_PRIVATE_KEY || process.env.MIDDLEWARE_SIGNER_PRIVATE_KEY || '';
const API_KEY = process.env.MIDDLEWARE_API_KEY || 'testnet2024';
const INTENT_REGISTRY_ADDRESS = process.env.INTENT_REGISTRY_ADDRESS || '';
const PAYMENT_VERIFIER_ADDRESS = process.env.PAYMENT_VERIFIER_ADDRESS || '';
const SOLVER_REGISTRY_ADDRESS = process.env.SOLVER_REGISTRY_ADDRESS || '';

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
  const requestId = req.headers['x-request-id'] as string | undefined;
  (req as any).requestId = requestId || randomUUID();
  res.setHeader('X-Request-ID', (req as any).requestId);
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  metrics.totalRequests++;
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const error = (req as any).errorMessage;
    console.log(
      `[${new Date().toISOString()}] requestId=${(req as any).requestId} ${req.method} ${req.path} status=${res.statusCode} duration=${duration}ms${error ? ` error="${error}"` : ''}`
    );
  });
  next();
});

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    metrics.totalErrors++;
    (req as any).errorMessage = 'Unauthorized. Invalid or missing API key.';
    return res.status(401).json({ error: (req as any).errorMessage });
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

const BYTES32_REGEX = /^0x[0-9a-fA-F]{64}$/;

export function isValidBytes32(value: unknown): value is string {
  return typeof value === 'string' && BYTES32_REGEX.test(value);
}

export function isChecksummedAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return ethers.isAddress(value) && ethers.getAddress(value) === value;
}

export function isPositiveNumericString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[1-9]\d*$/.test(value);
}

function badRequest(req: Request, res: Response, message: string): Response {
  metrics.totalErrors++;
  (req as any).errorMessage = message;
  return res.status(400).json({ error: message });
}

export async function checkRpcProvider(): Promise<{ name: string; status: 'ok' | 'degraded'; detail?: string }> {
  try {
    const blockNumber = await provider.getBlockNumber();
    return { name: 'rpc', status: 'ok', detail: `block ${blockNumber}` };
  } catch (error: any) {
    return { name: 'rpc', status: 'degraded', detail: error.message };
  }
}

export async function checkContractDependency(
  name: string,
  address: string,
  abi: string[],
  method: string,
  args: any[]
): Promise<{ name: string; status: 'ok' | 'degraded'; detail?: string }> {
  if (!address) {
    return { name, status: 'degraded', detail: 'address not configured' };
  }
  try {
    const contract = new ethers.Contract(address, abi, provider);
    await (contract as any)[method](...args);
    return { name, status: 'ok' };
  } catch (error: any) {
    return { name, status: 'degraded', detail: error.message };
  }
}

export const healthChecks = {
  checkRpcProvider,
  checkContractDependency,
};

app.get('/health', async (req: Request, res: Response) => {
  const dependencies = await Promise.all([
    healthChecks.checkRpcProvider(),
    healthChecks.checkContractDependency(
      'intentRegistry',
      INTENT_REGISTRY_ADDRESS,
      ['function getIntent(bytes32) view returns (bool)'],
      'getIntent',
      [ethers.ZeroHash]
    ),
    healthChecks.checkContractDependency(
      'paymentVerifier',
      PAYMENT_VERIFIER_ADDRESS,
      ['function facilitators(address) view returns (bool)'],
      'facilitators',
      [signer.address]
    ),
    ...(SOLVER_REGISTRY_ADDRESS
      ? [
          healthChecks.checkContractDependency(
            'solverRegistry',
            SOLVER_REGISTRY_ADDRESS,
            ['function isRegistered(address) view returns (bool)'],
            'isRegistered',
            [ethers.ZeroAddress]
          ),
        ]
      : []),
  ]);

  const degraded = dependencies.filter((d) => d.status === 'degraded');
  const status = degraded.length === 0 ? 'ok' : 'degraded';

  const response = {
    status,
    timestamp: new Date().toISOString(),
    dependencies: dependencies.reduce((acc, dep) => {
      acc[dep.name] = dep.status === 'ok' ? 'ok' : { status: dep.status, detail: dep.detail };
      return acc;
    }, {} as Record<string, unknown>),
  };

  res.status(status === 'ok' ? 200 : 503).json(response);
});

app.get('/v1/intents/:intentId/quotes', async (req: Request, res: Response) => {
  try {
    const quotes = getQuotes(req.params.intentId);
    res.json({ intentId: req.params.intentId, quotes });
  } catch (error: any) {
    (req as any).errorMessage = error.message;
    res.status(500).json({ error: error.message });
  }
});

app.post('/v1/quotes', apiKeyAuth, apiKeyLimiter, async (req: Request, res: Response) => {
  const { intentId, solverAddress, outputAmount, feeBps, signature } = req.body;

  if (!isValidBytes32(intentId)) {
    return badRequest(req, res, 'Invalid intentId: must be a valid bytes32 hex string');
  }
  if (!isChecksummedAddress(solverAddress)) {
    return badRequest(req, res, 'Invalid solverAddress: must be a checksummed Ethereum address');
  }
  if (!isPositiveNumericString(outputAmount)) {
    return badRequest(req, res, 'Invalid outputAmount: must be a positive numeric string');
  }
  if (signature === undefined) {
    return badRequest(req, res, 'Missing signature');
  }

  try {
    const intent = await getIntentDetails(intentId);
    if (intent.status !== 0) {
      (req as any).errorMessage = 'Intent is not open';
      return res.status(404).json({ error: (req as any).errorMessage });
    }
    if (BigInt(outputAmount) < BigInt(intent.minDestAmount)) {
      return badRequest(req, res, 'Quote below minDestAmount');
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
    (req as any).errorMessage = error.message;
    res.status(500).json({ error: error.message });
  }
});

app.get('/v1/intents/:intentId/payment-required', async (req: Request, res: Response) => {
  try {
    const intent = await getIntentDetails(req.params.intentId);
    if (intent.status !== 0) {
      (req as any).errorMessage = 'Intent is not open';
      return res.status(404).json({ error: (req as any).errorMessage });
    }
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const paymentRequired = await getIntentPaymentRequirements(req.params.intentId, intent.destToken, intent.maxSolverFee, signer.address, url);
    res.setHeader('PAYMENT-REQUIRED', safeBase64Encode(paymentRequired));
    res.status(402).json({ ...paymentRequired, error: 'PAYMENT-SIGNATURE header required' });
  } catch (error: any) {
    (req as any).errorMessage = error.message;
    res.status(500).json({ error: error.message });
  }
});

app.post('/v1/intents/:intentId/settle', apiKeyAuth, addressLimiter, async (req: Request, res: Response) => {
  const { intentId } = req.params;
  if (!isValidBytes32(intentId)) {
    return badRequest(req, res, 'Invalid intentId: must be a valid bytes32 hex string');
  }

  const paymentHeader = req.headers['payment-signature'] as string | undefined;
  if (!paymentHeader) {
    (req as any).errorMessage = 'Missing PAYMENT-SIGNATURE header';
    return res.status(402).json({ error: (req as any).errorMessage });
  }

  try {
    const intent = await getIntentDetails(intentId);
    if (intent.status !== 0) {
      (req as any).errorMessage = 'Intent is not open';
      return res.status(404).json({ error: (req as any).errorMessage });
    }

    const decoded = safeBase64Decode(paymentHeader);
    if (!validatePaymentPayload(decoded)) {
      return badRequest(req, res, 'Invalid payment signature payload');
    }
    const paymentPayload = decoded;

    const solverAddress = ethers.getAddress(paymentPayload.payload.authorization.from);

    if (!isAllowedSolver(solverAddress, intent.allowedSolvers)) {
      (req as any).errorMessage = 'Solver not in allowedSolvers';
      return res.status(403).json({ error: (req as any).errorMessage });
    }

    const solverOk = await isSolverRegisteredAndSupportsChain(solverAddress, intent.destChainId);
    if (!solverOk) {
      (req as any).errorMessage = 'Solver not registered or does not support destination chain';
      return res.status(403).json({ error: (req as any).errorMessage });
    }

    const bestQuote = getBestQuote(intentId);
    if (!bestQuote || ethers.getAddress(bestQuote.solverAddress) !== solverAddress) {
      return badRequest(req, res, 'Solver does not have the winning quote for this intent');
    }

    if (!verifyQuoteSignature(bestQuote)) {
      return badRequest(req, res, 'Invalid quote signature');
    }

    const facilitatorOk = await isFacilitator(signer.address);
    if (!facilitatorOk) {
      (req as any).errorMessage = 'Middleware signer is not a registered facilitator';
      return res.status(403).json({ error: (req as any).errorMessage });
    }

    const requirements = (await getIntentPaymentRequirements(intentId, intent.destToken, intent.maxSolverFee, signer.address, `${req.protocol}://${req.get('host')}${req.originalUrl}`)).accepts[0];

    const verifyResult = await verifyEIP3009(provider, requirements, paymentPayload);
    if (!verifyResult.isValid) {
      metrics.totalErrors++;
      (req as any).errorMessage = verifyResult.invalidReason;
      return res.status(402).json({ error: verifyResult.invalidReason, message: verifyResult.invalidMessage });
    }

    const settleResult = await settleEIP3009(signer, requirements, paymentPayload);
    if (!settleResult.success || !settleResult.transaction) {
      metrics.totalErrors++;
      (req as any).errorMessage = settleResult.errorReason;
      return res.status(402).json({ error: settleResult.errorReason, message: settleResult.errorMessage });
    }

    const paymentTxHash = settleResult.transaction;
    const fulfillTx = await fulfillIntent(intentId, bestQuote.outputAmount, paymentTxHash, bestQuote.solverAddress, signer);

    metrics.paymentsAccepted++;
    metrics.proofsIssued++;

    const response = {
      success: true,
      transaction: paymentTxHash,
      fulfillTransaction: fulfillTx.hash,
      intentId,
      solver: solverAddress,
      destAmount: bestQuote.outputAmount,
    };
    res.setHeader('PAYMENT-RESPONSE', safeBase64Encode(response));
    res.json(response);
  } catch (error: any) {
    metrics.totalErrors++;
    (req as any).errorMessage = error.message;
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
    (req as any).errorMessage = error.message;
    res.status(500).json({ error: error.message });
  }
});

app.get('/v1/intents/:intentId/bridge-status', async (req: Request, res: Response) => {
  try {
    const status = await getBridgeStatus(req.params.intentId);
    res.json(status);
  } catch (error: any) {
    (req as any).errorMessage = error.message;
    res.status(500).json({ error: error.message });
  }
});
