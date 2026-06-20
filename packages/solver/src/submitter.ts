import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';
import { FulfillmentPlan } from './strategies/xdc-only';
import { PaymentProof } from './middleware-client';

export class TransactionSubmitter {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private contract: ethers.Contract;
  private pendingNonce: number | null = null;

  constructor(
    private config: SolverConfig,
    private logger: Logger
  ) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);

    const abi = [
      'function fulfillIntent(bytes32 intentId, tuple(bytes32 intentId, address solver, address token, uint256 amount, uint256 protocolFee, uint256 expiryTimestamp, uint256 chainId) calldata proof, bytes calldata signature) external',
      'function getIntent(bytes32 intentId) external view returns (bytes32, address, address, uint256, uint256, uint8, address, uint256, uint256, uint256, uint256)',
    ];

    this.contract = new ethers.Contract(config.intentRegistryAddress, abi, this.signer);
  }

  async submitFulfillment(
    plan: FulfillmentPlan,
    proof: PaymentProof
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      // Check gas price
      const gasPrice = await this.provider.getFeeData();
      const maxGasPrice = ethers.parseUnits(this.config.maxGasPriceGwei.toString(), 'gwei');
      
      if (gasPrice.gasPrice && gasPrice.gasPrice > maxGasPrice) {
        return {
          success: false,
          error: `Gas price too high: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei > ${this.config.maxGasPriceGwei} gwei`,
        };
      }

      // Get nonce
      const nonce = await this.getNonce();

      // Estimate gas
      const gasEstimate = await this.contract.fulfillIntent.estimateGas(
        plan.intentId,
        proof.proof,
        proof.signature
      );

      // Add 20% buffer
      const gasLimit = gasEstimate * BigInt(120) / BigInt(100);

      // Submit transaction
      const tx = await this.contract.fulfillIntent(
        plan.intentId,
        proof.proof,
        proof.signature,
        {
          gasLimit,
          nonce,
        }
      );

      this.logger.info(`Fulfillment submitted: ${tx.hash}`, {
        intentId: plan.intentId,
        gasLimit: gasLimit.toString(),
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt?.status === 1) {
        this.logger.info(`Fulfillment confirmed: ${tx.hash}`);
        return { success: true, txHash: tx.hash };
      } else {
        return { success: false, error: 'Transaction failed' };
      }
    } catch (error: any) {
      // Handle specific errors
      if (error.message.includes('not open')) {
        return { success: false, error: 'Intent already fulfilled by another solver' };
      }
      if (error.message.includes('nonce')) {
        return { success: false, error: 'Nonce conflict - retrying' };
      }
      if (error.message.includes('gas')) {
        return { success: false, error: `Gas estimation failed: ${error.message}` };
      }

      this.logger.error(`Fulfillment failed for intent ${plan.intentId}:`, error);
      return { success: false, error: error.message };
    }
  }

  private async getNonce(): Promise<number> {
    if (this.pendingNonce !== null) {
      this.pendingNonce++;
      return this.pendingNonce;
    }

    const nonce = await this.signer.getNonce();
    this.pendingNonce = nonce;
    return nonce;
  }

  resetNonce(): void {
    this.pendingNonce = null;
  }
}
