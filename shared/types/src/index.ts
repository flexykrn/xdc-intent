export enum IntentStatus {
  Open = 0,
  Fulfilled = 1,
  Cancelled = 2,
}

export interface IntentParams {
  sourceChainId: number;
  sourceToken: string;
  sourceAmount: bigint;
  destChainId: number;
  destToken: string;
  minDestAmount: bigint;
  maxSolverFee: bigint;
  expiry: number;
  nonce: number;
  allowedSolvers?: string[];
}

export interface SignedIntent {
  params: IntentParams;
  intentId: string;
  signature: string;
}

export interface Intent extends IntentParams {
  intentId: string;
  user: string;
  status: IntentStatus;
  solver: string;
  fulfilledAmount: bigint;
  paymentTxHash: string;
}

export interface PaymentProofRequest {
  intentId: string;
  amount: string;
  asset: string;
  recipient: string;
  network: string;
  nonce: string;
  deadline: number;
}
