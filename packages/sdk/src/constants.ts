import { z } from 'zod';
import { CHAIN_IDS, CONTRACT_ADDRESSES } from '@xdc-intent/constants';

// ========== Zod Schemas ==========

export const CreateIntentSchema = z.object({
  intentId: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid intentId format'),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
  amount: z.union([z.string(), z.bigint()]),
  expiry: z.number().int().positive(),
});

export const FulfillIntentSchema = z.object({
  intentId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  solver: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  paymentProof: z.object({
    intentId: z.string(),
    solver: z.string(),
    token: z.string(),
    amount: z.bigint(),
    protocolFee: z.bigint(),
    expiryTimestamp: z.number(),
    chainId: z.number(),
  }),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid signature format'),
});

export const PaymentProofSchema = z.object({
  intentId: z.string(),
  solver: z.string(),
  token: z.string(),
  amount: z.bigint(),
  protocolFee: z.bigint(),
  expiryTimestamp: z.number(),
  chainId: z.number(),
});

export const IntentInputSchema = z.object({
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.union([z.string(), z.bigint()]),
  expiry: z.number().int().positive(),
});

// ========== Type Exports ==========

export type CreateIntentInput = z.infer<typeof CreateIntentSchema>;
export type FulfillIntentInput = z.infer<typeof FulfillIntentSchema>;
export type PaymentProof = z.infer<typeof PaymentProofSchema>;
export type IntentInput = z.infer<typeof IntentInputSchema>;

export enum IntentStatus {
  Open = 0,
  Fulfilled = 1,
  Cancelled = 2,
}

// ========== Re-exports from shared constants ==========

export { CHAIN_IDS, CONTRACT_ADDRESSES };

// ========== Error Messages ==========

export const ERROR_MESSAGES: Record<string, string> = {
  'IntentRegistry: intent not found': 'Intent not found. Please check the intent ID.',
  'IntentRegistry: not pending': 'Intent is not pending. It may have been fulfilled, cancelled, or expired.',
  'IntentRegistry: not intent owner': 'You are not the owner of this intent.',
  'IntentRegistry: not expired yet': 'Intent has not expired yet. Please wait until the expiry time.',
  'IntentRegistry: intent exists': 'An intent with this ID already exists. Please use a different ID.',
  'IntentRegistry: expiry in past': 'Expiry time must be in the future.',
  'IntentRegistry: amount too small': 'Amount is too small. Minimum amount required.',
  'Escrow: token not supported': 'This token is not supported. Please use a supported token.',
  'Escrow: insufficient balance': 'Insufficient token balance. Please deposit more tokens.',
  'PaymentVerifier: invalid signature': 'Invalid signature. Please check your wallet connection.',
  'PaymentVerifier: unauthorized signer': 'Unauthorized signer. Please contact support.',
  'SafeERC20: low-level call failed': 'Token transfer failed. Please check your token balance and allowance.',
};

export function getUserFriendlyError(errorMessage: string): string {
  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
    if (errorMessage.includes(key)) {
      return value;
    }
  }
  return errorMessage;
}
