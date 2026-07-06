import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';
import { IntentEvent } from './watcher';
import { DEXAdapter, SwapQuote } from './adapters/dex';

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
  constructor(
    private config: SolverConfig,
    private logger: Logger,
    private dexAdapter: DEXAdapter,
    private bridgeAdapter: BridgeAdapter,
    private gasPriceGwei: number = 0.05
  ) {}

  async evaluate(intent: IntentEvent): Promise<EvaluationResult> {
    const now = Math.floor(Date.now() / 1000);

    if (intent.expiry < now + 300) {
      return { shouldFulfill: false, reason: 'Expiry too soon' };
    }

    if (intent.sourceAmount < this.config.minSourceAmount) {
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

    const gasCost = this.estimateGasCost(quote.gasEstimate + (isCrossChain ? 120000n : 100000n));
    const grossProfit = outputAmount - intent.minDestAmount;
    const netProfit = grossProfit - gasCost - intent.maxSolverFee;

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
      bridgeCost,
    };
  }

  private estimateGasCost(gasLimit: bigint): bigint {
    const gasPrice = ethers.parseUnits(this.gasPriceGwei.toString(), 'gwei');
    return gasLimit * gasPrice;
  }
}
