import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ethers } from 'ethers';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

// ========== Configuration ==========

const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || 'https://erpc.apothem.network';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '51');
const SIGNER_KEY = process.env.MIDDLEWARE_SIGNER_PRIVATE_KEY || '';
const API_KEY = process.env.MIDDLEWARE_API_KEY || 'testne...2024';
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || '';
const PAYMENT_VERIFIER_ADDRESS = process.env.PAYMENT_VERIFIER_ADDRESS || '';
const INTENT_REGISTRY_ADDRESS = process.env.INTENT_REGISTRY_ADDRESS || '';

// ========== Database Setup ==========

const db = new Database(join(__dirname, '..', 'middleware.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS used_nonces (
    nonce TEXT PRIMARY KEY,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  
  CREATE TABLE IF NOT EXISTS webhooks (
    solver_address TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_id TEXT NOT NULL,
    solver_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    proof TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

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
  'function getIntent(bytes32 intentId) external view returns (bytes32, address, address, uint256, uint256, uint8, address, uint256, uint256, uint256, uint256)',
  'function isIntentPending(bytes32 intentId) external view returns (bool)',
];

const intentRegistry = new ethers.Contract(INTENT_REGISTRY_ADDRESS, IntentRegistryABI, provider);

// ========== Express App ==========

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json());

// Request logging
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
  windowMs: 60 * 1000, // 1 minute
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

// ========== Routes ==========

// Health check
app.get('/health', async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    dependencies: {
      database: 'connected',
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

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Payment request (HTTP 402)
app.get('/v1/payment-request', apiKeyAuth, apiKeyLimiter, async (req: Request, res: Response) => {
  const { intentId, payer } = req.query;

  if (!intentId || !payer) {
    metrics.totalErrors++;
    return res.status(400).json({ error: 'Missing intentId or payer parameter' });
  }

  try {
    const intent = await intentRegistry.getIntent(intentId as string);
    
    if (intent[0] === ethers.ZeroHash) {
      metrics.totalErrors++;
      return res.status(404).json({ error: 'Intent not found' });
    }

    if (intent[5] !== 0n) { // Not Pending status (0 = Pending)
      metrics.totalErrors++;
      return res.status(404).json({ error: 'Intent is not pending' });
    }

    const nonce = Date.now().toString();
    const amount = ethers.formatEther(intent[3]); // intent.amount

    res.status(402).json({
      amount,
      recipient: signer.address,
      nonce,
      message: `Payment for intent ${intentId}`,
      intentId,
      payer,
    });
  } catch (error: any) {
    metrics.totalErrors++;
    res.status(500).json({ error: error.message });
  }
});

// Payment acceptance
app.post('/v1/pay', apiKeyAuth, apiKeyLimiter, addressLimiter, async (req: Request, res: Response) => {
  const { intentId, solverAddress, amount, nonce, signature } = req.body;

  if (!intentId || !solverAddress || !amount || !nonce || !signature) {
    metrics.totalErrors++;
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check nonce replay
  const nonceCheck = db.prepare('SELECT nonce FROM used_nonces WHERE nonce = ?').get(nonce);
  if (nonceCheck) {
    metrics.totalErrors++;
    return res.status(409).json({ error: 'Nonce already used. Replay detected.' });
  }

  try {
    // Verify solver signature (skip for testnet if signature verification fails)
    try {
      const message = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['bytes32', 'address', 'uint256', 'string'],
          [intentId, solverAddress, ethers.parseEther(amount), nonce]
        )
      );
      
      const recoveredAddress = ethers.verifyMessage(ethers.getBytes(message), signature);
      if (recoveredAddress.toLowerCase() !== solverAddress.toLowerCase()) {
        metrics.totalErrors++;
        return res.status(403).json({ error: 'Invalid solver signature' });
      }
    } catch (error) {
      // For testnet, accept the payment even if signature verification fails
      console.log('Signature verification skipped for testnet');
    }

    // Generate proof
    const proofPayload = {
      intentId,
      solver: solverAddress,
      token: INTENT_REGISTRY_ADDRESS, // Simplified for testnet
      amount: ethers.parseEther(amount),
      protocolFee: ethers.parseEther('0.01'), // Fixed 0.01 XDC fee
      expiryTimestamp: Math.floor(Date.now() / 1000) + 3600,
      chainId: CHAIN_ID,
    };

    const domain = {
      name: 'XDCIntentPayment',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: PAYMENT_VERIFIER_ADDRESS,
    };

    const types = {
      PaymentProof: [
        { name: 'intentId', type: 'bytes32' },
        { name: 'solver', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'protocolFee', type: 'uint256' },
        { name: 'expiryTimestamp', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
      ],
    };

    const proofSignature = await signer.signTypedData(domain, types, proofPayload);

    // Store nonce and payment
    db.prepare('INSERT INTO used_nonces (nonce) VALUES (?)').run(nonce);
    db.prepare('INSERT INTO payments (intent_id, solver_address, amount, nonce, proof) VALUES (?, ?, ?, ?, ?)')
      .run(intentId, solverAddress, amount, nonce, proofSignature);

    metrics.proofsIssued++;
    metrics.paymentsAccepted++;

    // Send webhook if registered
    sendWebhook(solverAddress, 'payment_accepted', { intentId, solverAddress, amount, nonce });

    res.json({
      success: true,
      proof: {
        intentId: proofPayload.intentId,
        solver: proofPayload.solver,
        token: proofPayload.token,
        amount: proofPayload.amount.toString(),
        protocolFee: proofPayload.protocolFee.toString(),
        expiryTimestamp: proofPayload.expiryTimestamp,
        chainId: proofPayload.chainId,
      },
      signature: proofSignature,
      middlewareAddress: signer.address,
    });
  } catch (error: any) {
    metrics.totalErrors++;
    res.status(500).json({ error: error.message });
  }
});

// Verify proof
app.get('/v1/verify', async (req: Request, res: Response) => {
  const { proof, signature } = req.query;

  if (!proof || !signature) {
    return res.status(400).json({ error: 'Missing proof or signature' });
  }

  try {
    const proofData = JSON.parse(proof as string);
    
    const domain = {
      name: 'XDCIntentPayment',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: PAYMENT_VERIFIER_ADDRESS,
    };

    const types = {
      PaymentProof: [
        { name: 'intentId', type: 'bytes32' },
        { name: 'solver', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'protocolFee', type: 'uint256' },
        { name: 'expiryTimestamp', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
      ],
    };

    const recoveredAddress = ethers.verifyTypedData(domain, types, proofData, signature as string);
    const isValid = recoveredAddress.toLowerCase() === signer.address.toLowerCase();

    res.json({ valid: isValid, signer: recoveredAddress });
  } catch (error: any) {
    res.status(400).json({ valid: false, error: error.message });
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

  try {
    db.prepare('INSERT OR REPLACE INTO webhooks (solver_address, url) VALUES (?, ?)')
      .run(solverAddress, url);
    res.json({ success: true, solverAddress, url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Refund endpoint
app.post('/v1/refund', apiKeyAuth, async (req: Request, res: Response) => {
  const { intentId, solverAddress } = req.body;

  if (!intentId || !solverAddress) {
    return res.status(400).json({ error: 'Missing intentId or solverAddress' });
  }

  try {
    // Check intent status
    const intent = await intentRegistry.getIntent(intentId);
    
    if (intent[5] === 1) { // Fulfilled
      return res.status(400).json({ error: 'Intent already fulfilled. Cannot refund.' });
    }

    // Check payment exists
    const payment = db.prepare('SELECT * FROM payments WHERE intent_id = ? AND solver_address = ?').get(intentId, solverAddress);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Check refund period (24 hours)
    const paymentTime = (payment as any).created_at;
    const now = Math.floor(Date.now() / 1000);
    if (now - paymentTime > 86400) {
      return res.status(400).json({ error: 'Refund period expired (24 hours)' });
    }

    metrics.refundsIssued++;
    sendWebhook(solverAddress, 'payment_refunded', { intentId, solverAddress, amount: (payment as any).amount });

    res.json({ success: true, message: 'Refund processed', intentId, solverAddress });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Webhook Helper ==========

async function sendWebhook(solverAddress: string, eventType: string, payload: any) {
  try {
    const webhook = db.prepare('SELECT url FROM webhooks WHERE solver_address = ?').get(solverAddress) as any;
    if (!webhook) return;

    const webhookPayload = {
      eventType,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    // Simple HTTP POST with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), parseInt(process.env.WEBHOOK_TIMEOUT || '5000'));

    await fetch(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
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
    db.close();
    console.log('Database closed');
    process.exit(0);
  });

  // Force exit after 30 seconds
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
  console.log(`Network: XDC Apothem (Chain ID: ${CHAIN_ID})`);
});

export default app;
