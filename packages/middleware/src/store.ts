import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { CAIP2 } from '@xdc-intent/constants';

dotenv.config();

const RPC_URL = process.env.RPC_URL || 'https://erpc.apothem.network';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '51');
const NETWORK = CAIP2[CHAIN_ID] || `eip155:${CHAIN_ID}`;

const provider = new ethers.JsonRpcProvider(RPC_URL);

const IntentRegistryABI = [
  'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))',
];

const intentRegistry = new ethers.Contract(process.env.INTENT_REGISTRY_ADDRESS || '', IntentRegistryABI, provider);

export interface PaymentRequirements {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  resource: {
    url: string;
    description?: string;
  };
  accepts: PaymentRequirements[];
}

export interface PaymentPayload {
  x402Version: number;
  accepted: PaymentRequirements;
  payload: {
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    signature: string;
  };
}

export interface Quote {
  intentId: string;
  solverAddress: string;
  outputAmount: string;
  feeBps: number;
  signature: string;
  createdAt: number;
}

const quotes = new Map<string, Quote[]>();

export function getIntentPaymentRequirements(intentId: string, destToken: string, maxSolverFee: string, payTo: string, url: string): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url,
      description: `Fulfill intent ${intentId}`,
    },
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        asset: destToken,
        amount: maxSolverFee,
        payTo,
        maxTimeoutSeconds: 600,
        extra: { intentId },
      },
    ],
  };
}

export async function getIntentDetails(intentId: string) {
  const result = await intentRegistry.getIntent(intentId);
  return {
    intentId: result.intentId,
    user: result.user,
    sourceChainId: Number(result.sourceChainId),
    sourceToken: result.sourceToken,
    sourceAmount: result.sourceAmount.toString(),
    destChainId: Number(result.destChainId),
    destToken: result.destToken,
    minDestAmount: result.minDestAmount.toString(),
    maxSolverFee: result.maxSolverFee.toString(),
    expiry: Number(result.expiry),
    nonce: result.nonce.toString(),
    allowedSolvers: result.allowedSolvers,
    status: Number(result.status),
    solver: result.solver,
    fulfilledAmount: result.fulfilledAmount.toString(),
    paymentTxHash: result.paymentTxHash,
  };
}

export function addQuote(quote: Quote): void {
  const list = quotes.get(quote.intentId) || [];
  list.push(quote);
  quotes.set(quote.intentId, list);
}

export function getQuotes(intentId: string): Quote[] {
  return quotes.get(intentId) || [];
}

export function clearQuotes(intentId: string): void {
  quotes.delete(intentId);
}

export function getBestQuote(intentId: string): Quote | null {
  const list = getQuotes(intentId);
  if (list.length === 0) return null;
  return list.reduce((best, current) =>
    BigInt(current.outputAmount) > BigInt(best.outputAmount) ? current : best
  );
}

export function validatePaymentPayload(payload: any): payload is PaymentPayload {
  return (
    payload &&
    payload.x402Version === 2 &&
    payload.accepted &&
    payload.payload &&
    payload.payload.authorization &&
    typeof payload.payload.signature === 'string'
  );
}

export function safeBase64Encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

export function safeBase64Decode(str: string): unknown {
  return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
}
