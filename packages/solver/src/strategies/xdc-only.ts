import { ethers } from 'ethers';
import { Logger } from '../logger';
import { SolverConfig } from '../config';
import { IntentEvent } from '../watcher';
import { DEXAdapter, SwapQuote } from '../adapters/dex';

export interface FulfillmentPlan {
  intentId: string;
  destinationAmount: bigint;
  swapRoute: SwapQuote;
  estimatedProfit: number;
  gasEstimate: bigint;
}

export class XDCOnlyStrategy {
  constructor(
    private config: SolverConfig,
    private logger: Logger,
    private dexAdapter: DEXAdapter
  ) {}

  async evaluate(intent: IntentEvent): Promise<FulfillmentPlan | null> {
    try {
      // Get quote from DEX
      const quote = await this.dexAdapter.getQuote(
        intent.token,
        intent.token, // Same token for XDC-only (no actual swap needed in v1)
        intent.amount
      );

      // Calculate estimated profit
      const estimatedProfit = this.calculateProfit(intent.amount, quote.outputAmount);
      
      // Check if profitable
      if (estimatedProfit < this.config.minProfitMargin) {
        this.logger.info(`Intent ${intent.intentId} not profitable: ${estimatedProfit.toFixed(2)}% < ${this.config.minProfitMargin}%`);
        return null;
      }

      // Check gas estimate
      const totalGas = quote.gasEstimate + BigInt(100000); // Add fulfillment gas
      const gasCost = await this.estimateGasCost(totalGas);
      
      // Check if gas cost is acceptable
      const gasCostPercentage = Number(gasCost) / Number(intent.amount) * 100;
      if (gasCostPercentage > this.config.maxSlippage) {
        this.logger.info(`Intent ${intent.intentId} gas too high: ${gasCostPercentage.toFixed(2)}%`);
        return null;
      }

      return {
        intentId: intent.intentId,
        destinationAmount: quote.outputAmount,
        swapRoute: quote,
        estimatedProfit,
        gasEstimate: totalGas,
      };
    } catch (error) {
      this.logger.error(`Error evaluating intent ${intent.intentId}:`, error);
      return null;
    }
  }

  private calculateProfit(input: bigint, output: bigint): number {
    // Profit = (output - input) / input * 100
    const profit = Number(output - input) / Number(input) * 100;
    return profit;
  }

  private async estimateGasCost(gasLimit: bigint): Promise<bigint> {
    // Mock gas cost estimation
    // In production, this would fetch current gas price from provider
    const gasPrice = ethers.parseUnits('0.05', 'gwei'); // XDC has low gas prices
    return gasLimit * gasPrice;
  }
}
