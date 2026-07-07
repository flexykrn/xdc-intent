import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';

export class TransactionSubmitter {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private contract: ethers.Contract;
  private pendingNonce: number | null = null;

  constructor(private config: SolverConfig, private logger: Logger) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);

    const abi = [
      'function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash, address solver) external returns (bool)',
      'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))',
    ];
    this.contract = new ethers.Contract(config.intentRegistryAddress, abi, this.signer);
  }

  async submitFulfillment(
    intentId: string,
    destAmount: bigint,
    paymentTxHash: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const feeData = await this.provider.getFeeData();
      const maxGasPrice = ethers.parseUnits(this.config.maxGasPriceGwei.toString(), 'gwei');
      if (feeData.gasPrice && feeData.gasPrice > maxGasPrice) {
        return { success: false, error: `Gas price too high` };
      }

      const nonce = await this.getNonce();
      const solverAddress = this.signer.address;
      const gasEstimate = await this.contract.fulfillIntent.estimateGas(intentId, destAmount, paymentTxHash, solverAddress);
      const gasLimit = (gasEstimate * 120n) / 100n;

      const tx = await this.contract.fulfillIntent(intentId, destAmount, paymentTxHash, solverAddress, {
        gasLimit,
        nonce,
      });
      this.logger.info(`Fulfillment submitted: ${tx.hash}`, { intentId });

      const receipt = await tx.wait();
      if (receipt?.status === 1) {
        return { success: true, txHash: tx.hash };
      }
      return { success: false, error: 'Transaction failed' };
    } catch (error: any) {
      if (error.message.includes('not open')) {
        return { success: false, error: 'Intent already fulfilled' };
      }
      if (error.message.includes('nonce')) {
        this.resetNonce();
        return { success: false, error: 'Nonce conflict' };
      }
      this.logger.error(`Fulfillment failed for ${intentId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  private async getNonce(): Promise<number> {
    if (this.pendingNonce !== null) return ++this.pendingNonce;
    this.pendingNonce = await this.signer.getNonce();
    return this.pendingNonce;
  }

  resetNonce(): void {
    this.pendingNonce = null;
  }

  getAddress(): string {
    return this.signer.address;
  }

  getSigner(): ethers.Signer {
    return this.signer;
  }
}
