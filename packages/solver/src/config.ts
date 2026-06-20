import { z } from 'zod';
import dotenv from 'dotenv';
import { join } from 'path';

// Load .env from solver package directory
dotenv.config({ path: join(__dirname, '..', '.env') });

// Configuration schema with validation
export const SolverConfigSchema = z.object({
  // Network
  rpcUrl: z.string().url('RPC_URL must be a valid URL'),
  chainId: z.number().int().positive(),
  
  // Wallet
  privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Private key must be 64 hex characters with 0x prefix'),
  
  // Contracts
  escrowAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  paymentVerifierAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  intentRegistryAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  
  // Middleware
  middlewareUrl: z.string().url(),
  middlewareApiKey: z.string().min(1),
  
  // Solver settings
  minProfitMargin: z.number().min(0).max(100), // Percentage
  maxSlippage: z.number().min(0).max(100), // Percentage
  maxGasPriceGwei: z.number().positive(),
  supportedTokens: z.array(z.string()),
  
  // Logging
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
});

export type SolverConfig = z.infer<typeof SolverConfigSchema>;

// Parse and validate configuration
export function loadConfig(): SolverConfig {
  const rawConfig = {
    rpcUrl: process.env.RPC_URL || 'https://erpc.apothem.network',
    chainId: parseInt(process.env.CHAIN_ID || '51'),
    privateKey: process.env.SOLVER_PRIVATE_KEY || '',
    escrowAddress: process.env.ESCROW_ADDRESS || '',
    paymentVerifierAddress: process.env.PAYMENT_VERIFIER_ADDRESS || '',
    intentRegistryAddress: process.env.INTENT_REGISTRY_ADDRESS || '',
    middlewareUrl: process.env.MIDDLEWARE_URL || 'http://localhost:3000',
    middlewareApiKey: process.env.MIDDLEWARE_API_KEY || '',
    minProfitMargin: parseFloat(process.env.MIN_PROFIT_MARGIN || '0.5'),
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '1.0'),
    maxGasPriceGwei: parseFloat(process.env.MAX_GAS_PRICE_GWEI || '50'),
    supportedTokens: (process.env.SUPPORTED_TOKENS || 'USDC,USDT,XDC').split(',').map(t => t.trim()),
    logLevel: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
  };

  const result = SolverConfigSchema.safeParse(rawConfig);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid solver configuration:\n${errors}`);
  }

  return result.data;
}
