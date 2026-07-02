import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { CAIP2 } from '@xdc-intent/constants';
import { TxHashEvmScheme, TxHashFacilitatorClient } from './x402';

dotenv.config();

// ========== Configuration ==========

const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || 'https://erpc.apothem.network';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '51');
const SIGNER_KEY = process.env.MIDDLEWARE_SIGNER_PRIVATE_KEY || '';
const API_KEY = process.env.MIDDLEWARE_API_KEY || 'testnet2024';
const INTENT_REGISTRY_ADDRESS = process.env.INTENT_REGISTRY_ADDRESS || '';
const NETWORK = CAIP2[CHAIN_ID] || `eip155:${CHAIN_ID}`;

// ========== In-Memory Store ==========

interface StoredPayment {
  intentId: string;
  solverAddress: string;
  amount: string;
  txHash: string;
  createdAt: number;
}

const payments = new Map<string, StoredPayment>();
const webhooks = new Map<string, string>();

// ========== Metrics ==========

const metrics = {
  totalRequests: 0,
  proofsIssued: 0,
  totalErrors: 0,
  paymentsAccepted: 0,
  refundsIssued: 0,
};

// ========== Blockchain Setup ==========

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(SIGNER_KEY, provider);

const IntentRegistryABI = [
  'function getIntent(bytes32 intentId) external view returns (bytes32, address, uint256, address, uint256, uint256, address, uint256, uint256, uint256, uint256, address[], uint8, address, uint256, bytes32)',
  'function isIntentPending(bytes32 intentId) external view returns (bool)',
];

const intentRegistry = new ethers.Contract(INTENT_REGISTRY_ADDRESS, IntentRegistryABI, provider);

// ========== x402 Setup ==========

const facilitator = new TxHashFacilitatorClient(provider, signer.address);
const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK as `eip155:${string}`, new TxHashEvmScheme());

// ========== Express App ==========

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  metrics.totalRequests++;
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// ========== API Key Authentication ==========

const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    metrics.totalErrors++;
    return res.status(401).json({ error: 'Unauthorized. Invalid or missing API key.' });
  }
  next();
};

// ========== Rate Limiting ==========

const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API_KEY || '100'),
  message: { error: 'Too many requests. Limit: 100 per minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const addressLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_ADDRESS || '10'),
  message: { error: 'Too many requests. Limit: 10 per minute per address.' },
  keyGenerator: (req: Request) => req.body.solverAddress || req.query.payer || req.ip,
});

// ========== Helper: Fetch Intent Details ==========

async function getIntentDetails(intentId: string) {
  const result = await intentRegistry.getIntent(intentId);
  return {
    intentId: result[0],
    user: result[1],
    sourceChainId: Number(result[2]),
    sourceToken: result[3],
    sourceAmount: result[4],
    destChainId: Number(result[5]),
    destToken: result[6],
    minDestAmount: result[7],
    maxSolverFee: result[8],
    expiry: Number(result[9]),
    nonce: result[10],
    allowedSolvers: result[11],
    status: Number(result[12]),
    solver: result[13],
    fulfilledAmount: result[14],
    paymentTxHash: result[15],
  };
}

// ========== Routes ==========

app.get('/health', async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    dependencies: {
      rpc: 'connected',
      contract: 'reachable',
    },
  };

  try {
    await provider.getBlockNumber();
  } catch (error) {
    health.status = 'degraded';
    health.dependencies.rpc = 'disconnected';
  }

  try {
    await intentRegistry.getIntent(ethers.ZeroHash);
  } catch (error) {
    health.status = 'degraded';
    health.dependencies.contract = 'unreachable';
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// x402 payment-protected fulfillment route
app.post(
  '/v1/fulfill*',
  paymentMiddleware(
    {
      'POST /v1/fulfill*': {
        accepts: {
          scheme: 'exact',
          network: NETWORK as `eip155:${string}`,
          price: { asset: '0x0000000000000000000000000000000000000000', amount: '0' },
          payTo: signer.address,
          maxTimeoutSeconds: 600,
        },
        description: 'Permission to fulfill an XDC intent after on-chain ERC-20 payment',
      },
    },
    resourceServer,
    { appName: 'XDC Intent Facilitator', testnet: CHAIN_ID !== 50 }
  ),
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Payment verified. You may fulfill the intent.',
      middlewareAddress: signer.address,
    });
  }
);

// Direct JSON payment endpoint (solver-friendly)
app.post('/v1/pay', apiKeyAuth, apiKeyLimiter, addressLimiter, async (req: Request, res: Response) => {
  const { intentId, solverAddress, paymentTxHash } = req.body;

  if (!intentId || !solverAddress || !paymentTxHash) {
    metrics.totalErrors++;
    return res.status(400).json({ error: 'Missing intentId, solverAddress, or paymentTxHash' });
  }

  try {
    const intent = await getIntentDetails(intentId);

    if (intent.status !== 0) {
      metrics.totalErrors++;
      return res.status(404).json({ error: 'Intent is not open' });
    }

    const requirements = {
      scheme: 'exact',
      network: NETWORK as `eip155:${string}`,
      asset: String(intent.sourceToken),
      amount: String(intent.maxSolverFee),
      payTo: signer.address,
      maxTimeoutSeconds: 600,
      extra: { intentId },
    };

    const paymentPayload = {
      x402Version: 2,
      accepted: requirements,
      payload: {
        transactionHash: paymentTxHash,
        payer: solverAddress,
        intentId,
      },
    };

    const settleResult = await facilitator.settle(paymentPayload, requirements);

    if (!settleResult.success) {
      metrics.totalErrors++;
      return res.status(402).json({
        error: settleResult.errorMessage || settleResult.errorReason || 'Payment verification failed',
      });
    }

    payments.set(`${intentId}-${solverAddress}`, {
      intentId,
      solverAddress,
      amount: String(intent.maxSolverFee),
      txHash: paymentTxHash,
      createdAt: Math.floor(Date.now() / 1000),
    });

    metrics.proofsIssued++;
    metrics.paymentsAccepted++;
    sendWebhook(solverAddress, 'payment_accepted', { intentId, solverAddress, txHash: paymentTxHash });

    res.json({
      success: true,
      intentId,
      solverAddress,
      txHash: paymentTxHash,
      middlewareAddress: signer.address,
    });
  } catch (error: any) {
    metrics.totalErrors++;
    res.status(500).json({ error: error.message });
  }
});

// Payment request details for a specific intent
app.get('/v1/payment-request/:intentId', async (req: Request, res: Response) => {
  const { intentId } = req.params;

  try {
    const intent = await getIntentDetails(intentId);

    if (intent.status !== 0) {
      return res.status(404).json({ error: 'Intent is not open' });
    }

    res.status(200).json({
      intentId,
      network: NETWORK,
      scheme: 'exact',
      asset: intent.sourceToken,
      amount: String(intent.maxSolverFee),
      payTo: signer.address,
      maxTimeoutSeconds: 600,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Verify a payment tx hash directly
app.get('/v1/verify', async (req: Request, res: Response) => {
  const { intentId, solverAddress, txHash } = req.query;

  if (!intentId || !solverAddress || !txHash) {
    return res.status(400).json({ error: 'Missing intentId, solverAddress, or txHash' });
  }

  try {
    const intent = await getIntentDetails(intentId as string);
    const requirements = {
      scheme: 'exact',
      network: NETWORK as `eip155:${string}`,
      asset: String(intent.sourceToken),
      amount: String(intent.maxSolverFee),
      payTo: signer.address,
      maxTimeoutSeconds: 600,
      extra: { intentId },
    };

    const paymentPayload = {
      x402Version: 2,
      accepted: requirements,
      payload: {
        transactionHash: txHash as string,
        payer: solverAddress as string,
        intentId,
      },
    };

    const verifyResult = await facilitator.verify(paymentPayload, requirements);
    res.json({ valid: verifyResult.isValid, reason: verifyResult.invalidReason, payer: verifyResult.payer });
  } catch (error: any) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

// Metrics
app.get('/v1/metrics', (req: Request, res: Response) => {
  res.json(metrics);
});

// Webhook registration
app.post('/v1/webhooks', apiKeyAuth, (req: Request, res: Response) => {
  const { solverAddress, url } = req.body;

  if (!solverAddress || !url) {
    return res.status(400).json({ error: 'Missing solverAddress or url' });
  }

  webhooks.set(solverAddress.toLowerCase(), url);
  res.json({ success: true, solverAddress, url });
});

// Refund endpoint
app.post('/v1/refund', apiKeyAuth, async (req: Request, res: Response) => {
  const { intentId, solverAddress } = req.body;

  if (!intentId || !solverAddress) {
    return res.status(400).json({ error: 'Missing intentId or solverAddress' });
  }

  try {
    const intent = await getIntentDetails(intentId);

    if (intent.status === 1) {
      return res.status(400).json({ error: 'Intent already fulfilled. Cannot refund.' });
    }

    const payment = payments.get(`${intentId}-${solverAddress}`);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const paymentTime = payment.createdAt;
    const now = Math.floor(Date.now() / 1000);
    if (now - paymentTime > 86400) {
      return res.status(400).json({ error: 'Refund period expired (24 hours)' });
    }

    metrics.refundsIssued++;
    sendWebhook(solverAddress, 'payment_refunded', { intentId, solverAddress, amount: payment.amount });

    res.json({ success: true, message: 'Refund processed', intentId, solverAddress });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Webhook Helper ==========

async function sendWebhook(solverAddress: string, eventType: string, payload: any) {
  try {
    const url = webhooks.get(solverAddress.toLowerCase());
    if (!url) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), parseInt(process.env.WEBHOOK_TIMEOUT || '5000'));

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, timestamp: new Date().toISOString(), ...payload }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (error) {
    console.error('Webhook failed:', error);
  }
}

// ========== Graceful Shutdown ==========

let isShuttingDown = false;

const gracefulShutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ========== Start Server ==========

const server = app.listen(PORT, () => {
  console.log(`Middleware running on port ${PORT}`);
  console.log(`Signer address: ${signer.address}`);
  console.log(`Network: ${NETWORK} (Chain ID: ${CHAIN_ID})`);
});

export default app;
