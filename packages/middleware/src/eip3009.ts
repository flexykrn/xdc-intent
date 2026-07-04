import { ethers } from 'ethers';
import type { PaymentRequirements, PaymentPayload } from './store';

const TRANSFER_WITH_AUTHORIZATION_TYPE = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' },
  { name: 'nonce', type: 'bytes32' },
];

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  invalidMessage?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  transaction?: string;
  errorReason?: string;
  errorMessage?: string;
}

export async function verifyEIP3009(
  provider: ethers.Provider,
  requirements: PaymentRequirements,
  payload: PaymentPayload
): Promise<VerifyResponse> {
  const auth = payload.payload.authorization;
  const signature = payload.payload.signature;
  const now = Math.floor(Date.now() / 1000);

  try {
    if (payload.accepted.scheme !== 'exact') {
      return { isValid: false, invalidReason: 'unsupported_scheme' };
    }
    if (payload.accepted.network !== requirements.network) {
      return { isValid: false, invalidReason: 'network_mismatch' };
    }
    if (ethers.getAddress(auth.to) !== ethers.getAddress(requirements.payTo)) {
      return { isValid: false, invalidReason: 'wrong_payee' };
    }
    if (BigInt(auth.value) !== BigInt(requirements.amount)) {
      return { isValid: false, invalidReason: 'amount_mismatch' };
    }
    if (BigInt(auth.validBefore) < BigInt(now + 6)) {
      return { isValid: false, invalidReason: 'authorization_expired' };
    }
    if (BigInt(auth.validAfter) > BigInt(now)) {
      return { isValid: false, invalidReason: 'authorization_not_yet_valid' };
    }

    const tokenName = typeof requirements.extra?.tokenName === 'string' ? requirements.extra.tokenName : 'Mock USDC';
    const tokenVersion = typeof requirements.extra?.tokenVersion === 'string' ? requirements.extra.tokenVersion : '1';
    const chainId = parseInt(requirements.network.split(':')[1], 10);

    const domain = {
      name: tokenName,
      version: tokenVersion,
      chainId,
      verifyingContract: ethers.getAddress(requirements.asset),
    };

    const message = {
      from: ethers.getAddress(auth.from),
      to: ethers.getAddress(auth.to),
      value: BigInt(auth.value),
      validAfter: BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    };

    const recovered = ethers.verifyTypedData(domain, { TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION_TYPE }, message, signature);
    if (ethers.getAddress(recovered) !== ethers.getAddress(auth.from)) {
      return { isValid: false, invalidReason: 'invalid_signature' };
    }

    const token = new ethers.Contract(
      requirements.asset,
      ['function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)'],
      provider
    );
    const used = await token.authorizationState(auth.from, auth.nonce);
    if (used) {
      return { isValid: false, invalidReason: 'authorization_already_used' };
    }

    return { isValid: true, payer: auth.from };
  } catch (error: any) {
    return { isValid: false, invalidReason: 'verification_error', invalidMessage: error.message };
  }
}

export async function settleEIP3009(
  signer: ethers.Signer,
  requirements: PaymentRequirements,
  payload: PaymentPayload
): Promise<SettleResponse> {
  const auth = payload.payload.authorization;
  const signature = payload.payload.signature;

  try {
    const token = new ethers.Contract(
      requirements.asset,
      ['function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external'],
      signer
    );

    const sig = ethers.Signature.from(signature);
    const tx = await token.transferWithAuthorization(
      auth.from,
      auth.to,
      auth.value,
      auth.validAfter,
      auth.validBefore,
      auth.nonce,
      sig.v,
      sig.r,
      sig.s
    );
    const receipt = await tx.wait();
    return { success: receipt?.status === 1, transaction: tx.hash };
  } catch (error: any) {
    return { success: false, errorReason: 'settlement_failed', errorMessage: error.message };
  }
}
