import { ethers } from 'ethers';
import { z } from 'zod';

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
  Pending = 0,
  Fulfilled = 1,
  Cancelled = 2,
  Expired = 3,
}

// ========== Chain IDs ==========

export const CHAIN_IDS = {
  XDC_MAINNET: 50,
  XDC_APOTHEM: 51,
  HARDHAT: 31337,
} as const;

// ========== Contract Addresses ==========

export const CONTRACT_ADDRESSES: Record<number, { escrow: string; paymentVerifier: string; intentRegistry: string }> = {
  [CHAIN_IDS.XDC_APOTHEM]: {
    escrow: '0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288',
    paymentVerifier: '0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6',
    intentRegistry: '0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4',
  },
};

// ========== ABIs (Minimal for SDK) ==========

export const EscrowABI = [
  'function getBalance(address token, address user, bytes32 intentId) external view returns (uint256)',
  'function addSupportedToken(address token) external',
  'function removeSupportedToken(address token) external',
  'function calculateProtocolFee(uint256 amount) external view returns (uint256)',
  'function protocolFeeBps() external view returns (uint256)',
  'function treasury() external view returns (address)',
  'function paused() external view returns (bool)',
];

export const PaymentVerifierABI = [
  'function verifyPayment(tuple(bytes32 intentId, address solver, address token, uint256 amount, uint256 protocolFee, uint256 expiryTimestamp, uint256 chainId) proof, bytes signature) external view returns (bool)',
  'function addSigner(address signer) external',
  'function removeSigner(address signer) external',
  'function isAuthorizedSigner(address signer) external view returns (bool)',
];

export const IntentRegistryABI = [
  'function createIntent(bytes32 intentId, address token, uint256 amount, uint256 expiryTimestamp) external returns (bool)',
  'function fulfillIntent(bytes32 intentId, address solver, tuple(bytes32 intentId, address solver, address token, uint256 amount, uint256 protocolFee, uint256 expiryTimestamp, uint256 chainId) paymentProof, bytes signature) external',
  'function cancelIntent(bytes32 intentId) external',
  'function expireIntent(bytes32 intentId) external',
  'function getIntent(bytes32 intentId) external view returns (bytes32, address, address, uint256, uint256, uint8, address, uint256, uint256, uint256, uint256)',
  'function getUserIntents(address user) external view returns (bytes32[])',
  'function getSolverIntents(address solver) external view returns (bytes32[])',
  'function isIntentPending(bytes32 intentId) external view returns (bool)',
  'function totalIntents() external view returns (uint256)',
  'function totalIntentsFulfilled() external view returns (uint256)',
  'function setEscrow(address newEscrow) external',
  'function setPaymentVerifier(address newVerifier) external',
  'function pause() external',
  'function unpause() external',
  'event IntentCreated(bytes32 indexed intentId, address indexed user, address indexed token, uint256 amount, uint256 expiryTimestamp)',
  'event IntentFulfilled(bytes32 indexed intentId, address indexed solver, uint256 protocolFee, uint256 fulfilledAt)',
  'event IntentCancelled(bytes32 indexed intentId, address indexed user, uint256 refundedAmount, uint256 cancelledAt)',
  'event IntentExpired(bytes32 indexed intentId, address indexed user, uint256 refundedAmount, uint256 expiredAt)',
];

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
