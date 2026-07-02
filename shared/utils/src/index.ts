import { ethers } from 'ethers';

export function normalizeAddress(address: string): string {
  if (address.toLowerCase().startsWith('xdc')) {
    return '0x' + address.slice(3);
  }
  return address.toLowerCase();
}

export function isXDCAddress(address: string): boolean {
  return address.toLowerCase().startsWith('xdc') || address.toLowerCase().startsWith('0x');
}

export function deriveIntentId(
  user: string,
  params: {
    sourceChainId: number;
    sourceToken: string;
    sourceAmount: bigint;
    destChainId: number;
    destToken: string;
    minDestAmount: bigint;
    maxSolverFee: bigint;
    expiry: number;
    nonce: number;
  }
): string {
  return ethers.solidityPackedKeccak256(
    ['address', 'uint256', 'address', 'uint256', 'uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
    [
      user,
      params.sourceChainId,
      params.sourceToken,
      params.sourceAmount,
      params.destChainId,
      params.destToken,
      params.minDestAmount,
      params.maxSolverFee,
      params.expiry,
      params.nonce,
    ]
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getUserFriendlyError(errorMessage: string): string | undefined {
  const messages: Record<string, string> = {
    'IntentRegistry: not open': 'Intent is not open. It may have been fulfilled, cancelled, or expired.',
    'IntentRegistry: not owner or expired': 'You are not the owner or the intent has not expired.',
    'IntentRegistry: invalid signature': 'Invalid signature. Check your wallet connection.',
    'Escrow: token not allowed': 'This token is not supported.',
    'Escrow: insufficient balance': 'Insufficient escrow balance.',
    'PaymentVerifier: not facilitator': 'Payment verifier rejected the facilitator.',
    'PaymentVerifier: already verified': 'This payment has already been used.',
  };
  for (const [key, value] of Object.entries(messages)) {
    if (errorMessage.includes(key)) return value;
  }
  return undefined;
}
