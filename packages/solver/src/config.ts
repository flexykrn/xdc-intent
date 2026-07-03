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
  facilitatorUrl: z.string().url(),
  facilitatorApiKey: z.string().min(1),
  quoterAddress: z.string().regex(/^$|^0x[a-fA-F0-9]{40}$/).transform((v) => v || undefined),
  routerAddress: z.string().regex(/^$|^0x[a-fA-F0-9]{40}$/).transform((v) => v || undefined),
  stateFilePath: z.string().min(1),
  httpPort: z.number().int().positive(),
  pollingInterval: z.number().int().positive(),
  minProfitMargin: z.number().min(0).max(100),
  maxSlippage: z.number().min(0).max(100),
  maxGasPriceGwei: z.number().positive(),
  supportedTokens: z.array(z.string()),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
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
    facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:3000',
    facilitatorApiKey: process.env.FACILITATOR_API_KEY || '',
    quoterAddress: process.env.QUOTER_ADDRESS,
    routerAddress: process.env.ROUTER_ADDRESS,
    stateFilePath: process.env.STATE_FILE_PATH || './data/solver-state.json',
    httpPort: parseInt(process.env.HTTP_PORT || '3001'),
    pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
    minProfitMargin: parseFloat(process.env.MIN_PROFIT_MARGIN || '0.5'),
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '1.0'),
    maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '50'),
    supportedTokens: (process.env.SUPPORTED_TOKENS || 'USDC,USDT,XDC').split(',').map((t) => t.trim()),
    logLevel: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
  };

  const result = SolverConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid solver config:\n${result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n')}`);
  }
  return result.data;
}
