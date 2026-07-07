import { z } from 'zod';
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '..', '.env') });

export const SolverConfigSchema = z.object({
  rpcUrl: z.string().url(),
  chainId: z.number().int().positive(),
  privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  escrowAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  paymentVerifierAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  intentRegistryAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  solverRegistryAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  facilitatorUrl: z.string().url(),
  facilitatorApiKey: z.string().min(1),
  quoterAddress: z.string().regex(/^$|^0x[a-fA-F0-9]{40}$/).transform((v) => v || undefined),
  routerAddress: z.string().regex(/^$|^0x[a-fA-F0-9]{40}$/).transform((v) => v || undefined),
  stateFilePath: z.string().min(1),
  httpPort: z.number().int().positive(),
  pollingInterval: z.number().int().positive(),
  minProfitMargin: z.number().min(0).max(100),
  minProfitBps: z.number().int().min(0).max(10000).default(10),
  gasPriceFallbackGwei: z.number().positive().default(12.5),
  maxSlippage: z.number().min(0).max(100),
  maxGasPriceGwei: z.number().positive(),
  supportedTokens: z.array(z.string()),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
  solverName: z.string().min(1),
  solverFeeBps: z.number().int().min(0).max(10000),
  supportedChains: z.array(z.number().int().positive()),
  // Per-chain RPC URLs. For mocked cross-chain setups (e.g. Apothem + MockL2 on the same RPC),
  // leaving this empty causes every supported chain to fall back to rpcUrl.
  chainRpcUrls: z.record(z.string(), z.string().url()).default({}),
  bridgeAddress: z.string().regex(/^$|^0x[a-fA-F0-9]{40}$/).transform((v) => v || undefined),
  minDestAmount: z.number().min(0).max(1),
  minSourceAmount: z.number().min(0).default(0.001),
  maxRetries: z.number().int().min(0).default(3),
  retryBaseDelayMs: z.number().int().min(100).default(2000),
  retryMaxDelayMs: z.number().int().min(100).default(30000),
});

export type SolverConfig = z.infer<typeof SolverConfigSchema>;

export function loadConfig(): SolverConfig {
  const raw = {
    rpcUrl: process.env.RPC_URL || 'https://erpc.apothem.network',
    chainId: parseInt(process.env.CHAIN_ID || '51'),
    privateKey: process.env.SOLVER_PRIVATE_KEY || '',
    escrowAddress: process.env.ESCROW_ADDRESS || '',
    paymentVerifierAddress: process.env.PAYMENT_VERIFIER_ADDRESS || '',
    intentRegistryAddress: process.env.INTENT_REGISTRY_ADDRESS || '',
    solverRegistryAddress: process.env.SOLVER_REGISTRY_ADDRESS || '',
    facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:3000',
    facilitatorApiKey: process.env.FACILITATOR_API_KEY || '',
    quoterAddress: process.env.QUOTER_ADDRESS,
    routerAddress: process.env.ROUTER_ADDRESS,
    stateFilePath: process.env.STATE_FILE_PATH || './data/solver-state.json',
    httpPort: parseInt(process.env.HTTP_PORT || '3001'),
    pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
    minProfitMargin: parseFloat(process.env.MIN_PROFIT_MARGIN || '0.5'),
    minProfitBps: parseInt(process.env.MIN_PROFIT_BPS || '10', 10),
    gasPriceFallbackGwei: parseFloat(process.env.GAS_PRICE_FALLBACK_GWEI || '12.5'),
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '1.0'),
    maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '50'),
    supportedTokens: (process.env.SUPPORTED_TOKENS || 'USDC,USDT,XDC').split(',').map((t) => t.trim()),
    logLevel: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
    solverName: process.env.SOLVER_NAME || 'XDC-Solver',
    solverFeeBps: parseInt(process.env.SOLVER_FEE_BPS || '30'),
    supportedChains: (process.env.SUPPORTED_CHAINS || '51').split(',').map((c) => parseInt(c.trim(), 10)).filter(Boolean),
    chainRpcUrls: (() => {
      try {
        return process.env.CHAIN_RPC_URLS ? JSON.parse(process.env.CHAIN_RPC_URLS) : {};
      } catch {
        return {};
      }
    })(),
    bridgeAddress: process.env.BRIDGE_ADDRESS,
    minDestAmount: parseFloat(process.env.MIN_DEST_AMOUNT || '0.95'),
    minSourceAmount: parseFloat(process.env.MIN_SOURCE_AMOUNT || '0.001'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryBaseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || '2000', 10),
    retryMaxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '30000', 10),
  };

  const result = SolverConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid solver config:\n${result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n')}`);
  }
  return result.data;
}
