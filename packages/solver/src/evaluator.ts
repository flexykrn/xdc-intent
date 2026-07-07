import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';
import { IntentEvent } from './watcher';
import { DEXAdapter, NATIVE_TOKEN_ADDRESS, SwapQuote } from './adapters/dex';

import { BridgeAdapter } from './adapters/bridge';

export interface EvaluationResult {
  shouldFulfill: boolean;
  reason: string;
  estimatedProfit?: number;
  estimatedOutput?: bigint;
  quote?: SwapQuote;
  bridgeCost?: bigint;
}

export class IntentEvaluator {
  private decimalsCache = new Map<string, number>();

  constructor(
    private config: SolverConfig,
    private logger: Logger,
    private provider: ethers.Provider,
    private dexAdapter: DEXAdapter,
    private bridgeAdapter: BridgeAdapter,
    private gasPriceOverrideGwei?: number
  ) {}

  async evaluate(intent: IntentEvent): Promise<EvaluationResult> {
    const now = Math.floor(Date.now() / 1000);

    if (intent.expiry < now + 300) {
      return { shouldFulfill: false, reason: 'Expiry too soon' };
    }

    const sourceDecimals = await this.getDecimals(intent.sourceToken);
    const minSourceAmountRaw = ethers.parseUnits(this.config.minSourceAmount.toString(), sourceDecimals);
    if (intent.sourceAmount < minSourceAmountRaw) {
      return { shouldFulfill: false, reason: 'Amount too small' };
    }

    let quote: SwapQuote;
    try {
      quote = await this.dexAdapter.getQuote(intent.sourceToken, intent.destToken, intent.sourceAmount);
    } catch (error: any) {
      return { shouldFulfill: false, reason: `Quote failed: ${error.message}` };
    }

    let bridgeCost = 0n;
    const isCrossChain = intent.sourceChainId !== intent.destChainId;
    if (isCrossChain) {
      try {
        bridgeCost = await this.bridgeAdapter.getBridgeCost(intent.sourceChainId, intent.destChainId, quote.outputAmount);
      } catch (error: any) {
        return { shouldFulfill: false, reason: `Bridge quote failed: ${error.message}` };
      }
    }

    const outputAmount = quote.outputAmount - bridgeCost;

    if (outputAmount < intent.minDestAmount) {
      return {
        shouldFulfill: false,
        reason: `Quote ${outputAmount} < minDest ${intent.minDestAmount}`,
      };
    }

    const gasLimit = quote.gasEstimate + (isCrossChain ? 120000n : 100000n);
    const gasCostInDestToken = await this.estimateGasCostInDestToken(gasLimit, intent.destToken);

    const minProfitBps = BigInt(this.config.minProfitBps);
    const minProfitAmount = (intent.minDestAmount * minProfitBps) / 10000n;
    const minNetOutput = intent.minDestAmount + minProfitAmount + gasCostInDestToken;

    if (outputAmount < minNetOutput) {
      const netProfit = outputAmount - gasCostInDestToken - intent.minDestAmount;
      return {
        shouldFulfill: false,
        reason: `Not profitable after gas/min profit. Net: ${netProfit}`,
        estimatedOutput: outputAmount,
      };
    }

    const destDecimals = await this.getDecimals(intent.destToken);
    const netProfit = outputAmount - gasCostInDestToken - intent.minDestAmount;
    const netProfitHuman = parseFloat(ethers.formatUnits(netProfit, destDecimals));
    const minDestHuman = parseFloat(ethers.formatUnits(intent.minDestAmount, destDecimals));
    const profitPercent = minDestHuman > 0 ? (netProfitHuman / minDestHuman) * 100 : 0;

    if (profitPercent < this.config.minProfitMargin) {
      return {
        shouldFulfill: false,
        reason: `Profit ${profitPercent.toFixed(2)}% < min ${this.config.minProfitMargin}%`,
        estimatedOutput: outputAmount,
      };
    }

    return {
      shouldFulfill: true,
      reason: 'Profitable',
      estimatedProfit: profitPercent,
      estimatedOutput: outputAmount,
      quote,
      bridgeCost,
    };
  }

  private async getDecimals(token: string): Promise<number> {
    if (token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) return 18;

    const cached = this.decimalsCache.get(token.toLowerCase());
    if (cached !== undefined) return cached;

    try {
      const tokenContract = new ethers.Contract(token, ['function decimals() view returns (uint8)'], this.provider);
      const decimals = Number(await tokenContract.decimals());
      this.decimalsCache.set(token.toLowerCase(), decimals);
      return decimals;
    } catch (error: any) {
      this.logger.warn(`Failed to read decimals for ${token}, defaulting to 18: ${error.message}`);
      return 18;
    }
  }

  private async estimateGasCostInDestToken(gasLimit: bigint, destToken: string): Promise<bigint> {
    const gasPriceWei = await this.getGasPriceWei();
    const gasCostNative = gasLimit * gasPriceWei;

    if (destToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      return gasCostNative;
    }

    try {
      const gasCostInDest = await this.dexAdapter.quoteNativeToDest(gasCostNative, destToken);
      if (gasCostInDest > 0n) {
        return gasCostInDest;
      }
    } catch (error: any) {
      this.logger.warn(`Native→dest gas quote failed: ${error.message}`);
    }

    this.logger.debug(`No native→dest gas quote available; skipping gas cost conversion for ${destToken}`);
    return 0n;
  }

  private async getGasPriceWei(): Promise<bigint> {
    if (this.gasPriceOverrideGwei !== undefined && this.gasPriceOverrideGwei > 0) {
      return ethers.parseUnits(this.gasPriceOverrideGwei.toString(), 'gwei');
    }

    try {
      const feeData = await this.provider.getFeeData();
      if (feeData.gasPrice && feeData.gasPrice > 0n) {
        return feeData.gasPrice;
      }
    } catch (error: any) {
      this.logger.warn(`Failed to fetch gas price: ${error.message}`);
    }

    return ethers.parseUnits(this.config.gasPriceFallbackGwei.toString(), 'gwei');
  }
}
