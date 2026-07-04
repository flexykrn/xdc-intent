import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';
import { IntentEvent } from './watcher';
import { DEXAdapter, SwapQuote } from './adapters/dex';

export interface EvaluationResult {
  shouldFulfill: boolean;
  reason: string;
  estimatedProfit?: number;
  estimatedOutput?: bigint;
  quote?: SwapQuote;
}

export class IntentEvaluator {
  constructor(
    private config: SolverConfig,
    private logger: Logger,
    private dexAdapter: DEXAdapter,
    private gasPriceGwei: number = 0.05
  ) {}

  async evaluate(intent: IntentEvent): Promise<EvaluationResult> {
    const now = Math.floor(Date.now() / 1000);

    if (intent.expiry < now + 300) {
      return { shouldFulfill: false, reason: 'Expiry too soon' };
    }

    if (intent.sourceAmount < ethers.parseEther('0.001')) {
      return { shouldFulfill: false, reason: 'Amount too small' };
    }

    let quote: SwapQuote;
    try {
      quote = await this.dexAdapter.getQuote(intent.sourceToken, intent.destToken, intent.sourceAmount);
    } catch (error: any) {
      return { shouldFulfill: false, reason: `Quote failed: ${error.message}` };
    }

    if (quote.outputAmount < intent.minDestAmount) {
      return {
        shouldFulfill: false,
        reason: `Quote ${quote.outputAmount} < minDest ${intent.minDestAmount}`,
      };
    }

    const gasCost = this.estimateGasCost(quote.gasEstimate + 100000n);
    const outputAmount = (quote.outputAmount * BigInt(Math.floor(this.config.minDestAmount * 1000))) / 1000n;
    const grossProfit = outputAmount - intent.minDestAmount;
    const netProfit = grossProfit - gasCost - intent.maxSolverFee;

    if (outputAmount < intent.minDestAmount) {
      return {
        shouldFulfill: false,
        reason: `Quoted output ${outputAmount} below minDest ${intent.minDestAmount}`,
        estimatedOutput: outputAmount,
      };
    }

    if (netProfit <= 0n) {
      return {
        shouldFulfill: false,
        reason: `Not profitable after gas/fees. Net: ${netProfit}`,
        estimatedOutput: outputAmount,
      };
    }

    const profitPercent = (Number(netProfit) / Number(intent.minDestAmount)) * 100;

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
    };
  }

  private estimateGasCost(gasLimit: bigint): bigint {
    const gasPrice = ethers.parseUnits(this.gasPriceGwei.toString(), 'gwei');
    return gasLimit * gasPrice;
  }
}
