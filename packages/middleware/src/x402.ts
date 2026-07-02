import { ethers } from 'ethers';
import type { FacilitatorClient } from '@x402/core/server';
import type {
  SchemeNetworkServer,
  SchemeNetworkFacilitator,
  Network,
  Price,
  AssetAmount,
  PaymentRequirements,
  SupportedKind,
  PaymentPayload,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
} from '@x402/core/types';

const TRANSFER_EVENT_TOPIC = ethers.id('Transfer(address,address,uint256)');

function toAtomicAmount(decimalAmount: number, decimals: number): bigint {
  return ethers.parseUnits(decimalAmount.toFixed(decimals), decimals);
}

export class TxHashEvmScheme implements SchemeNetworkServer {
  readonly scheme = 'exact';

  async parsePrice(price: Price, _network: Network): Promise<AssetAmount> {
    if (typeof price === 'object' && price !== null && 'asset' in price && 'amount' in price) {
      return price as AssetAmount;
    }

    const raw = String(price).replace(/[^0-9.]/g, '');
    const decimal = parseFloat(raw || '0');
    if (!isFinite(decimal) || decimal < 0) {
      throw new Error(`Invalid price: ${price}`);
    }

    return {
      asset: '',
      amount: toAtomicAmount(decimal, 18).toString(),
    };
  }

  getAssetDecimals(_asset: string, _network: Network): number {
    return 18;
  }

  async enhancePaymentRequirements(
    requirements: PaymentRequirements,
    _supportedKind: SupportedKind,
    _facilitatorExtensions: string[]
  ): Promise<PaymentRequirements> {
    return requirements;
  }
}

export class TxHashFacilitatorClient implements FacilitatorClient {
  private provider: ethers.Provider;
  private signerAddress: string;
  private usedTxHashes = new Set<string>();

  constructor(provider: ethers.Provider, signerAddress: string) {
    this.provider = provider;
    this.signerAddress = signerAddress;
  }

  getSupported(): Promise<SupportedResponse> {
    return Promise.resolve({
      kinds: [
        { x402Version: 2, scheme: 'exact', network: 'eip155:*' },
      ],
      extensions: [],
      signers: { 'eip155:*': [this.signerAddress] },
    });
  }

  async verify(paymentPayload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.verifyTx(paymentPayload, requirements);
  }

  async settle(paymentPayload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const verifyResult = await this.verifyTx(paymentPayload, requirements);
    if (!verifyResult.isValid) {
      return {
        success: false,
        transaction: String(paymentPayload.payload.transactionHash ?? ''),
        network: requirements.network,
        errorReason: verifyResult.invalidReason ?? 'verification_failed',
        errorMessage: verifyResult.invalidMessage,
      };
    }

    return {
      success: true,
      transaction: String(paymentPayload.payload.transactionHash ?? ''),
      network: requirements.network,
      payer: verifyResult.payer,
      amount: requirements.amount,
    };
  }

  private async verifyTx(paymentPayload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    const txHash = paymentPayload.payload.transactionHash;
    if (!txHash || typeof txHash !== 'string' || !ethers.isHexString(txHash)) {
      return { isValid: false, invalidReason: 'missing_transaction_hash' };
    }

    if (this.usedTxHashes.has(txHash.toLowerCase())) {
      return { isValid: false, invalidReason: 'transaction_already_used' };
    }

    const receipt = await this.provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { isValid: false, invalidReason: 'receipt_not_found' };
    }
    if (!receipt.status) {
      return { isValid: false, invalidReason: 'transaction_failed' };
    }
    if (!receipt.to || receipt.to.toLowerCase() !== requirements.asset.toLowerCase()) {
      return { isValid: false, invalidReason: 'wrong_token_contract' };
    }

    const payer = paymentPayload.payload.payer as string | undefined;
    const payee = requirements.payTo;
    const amount = BigInt(requirements.amount);

    const transferLog = receipt.logs.find((log) => {
      if (log.topics[0] !== TRANSFER_EVENT_TOPIC) return false;
      if (log.address.toLowerCase() !== requirements.asset.toLowerCase()) return false;
      const from = ethers.getAddress(ethers.zeroPadValue(log.topics[1], 20));
      const to = ethers.getAddress(ethers.zeroPadValue(log.topics[2], 20));
      const value = BigInt(log.data);
      return (
        (!payer || from.toLowerCase() === payer.toLowerCase()) &&
        to.toLowerCase() === payee.toLowerCase() &&
        value === amount
      );
    });

    if (!transferLog) {
      return { isValid: false, invalidReason: 'transfer_not_found' };
    }

    this.usedTxHashes.add(txHash.toLowerCase());

    return {
      isValid: true,
      payer: payer ?? ethers.getAddress(ethers.zeroPadValue(transferLog.topics[1], 20)),
    };
  }
}

export function createTxHashScheme(): TxHashEvmScheme {
  return new TxHashEvmScheme();
}

export function createTxHashFacilitator(provider: ethers.Provider, signerAddress: string): TxHashFacilitatorClient {
  return new TxHashFacilitatorClient(provider, signerAddress);
}
