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
  partialFill?: {
    originalAmount: bigint;
    fillAmount: bigint;
    fillPercentage: number;
  };
}

export class XDCOnlyStrategy {
  constructor(
    private config: SolverConfig,
    private logger: Logger,
    private dexAdapter: DEXAdapter
  ) {}

  async evaluate(intent: IntentEvent, partialFillAmount?: bigint): Promise<FulfillmentPlan | null> {
    try {
      const amountToFill = partialFillAmount || intent.amount;
      
      // Get quote from DEX
      const quote = await this.dexAdapter.getQuote(
        intent.token,
        intent.token, // Same token for XDC-only (no actual swap needed in v1)
        amountToFill
      );

      // Calculate estimated profit
      const estimatedProfit = this.calculateProfit(amountToFill, quote.outputAmount);
      
      // Check if profitable
      if (estimatedProfit < this.config.minProfitMargin) {
        this.logger.info(`Intent ${intent.intentId} not profitable: ${estimatedProfit.toFixed(2)}% < ${this.config.minProfitMargin}%`);
        return null;
      }

      // Check gas estimate
      const totalGas = quote.gasEstimate + BigInt(100000); // Add fulfillment gas
      const gasCost = await this.estimateGasCost(totalGas);
      
      // Check if gas cost is acceptable
      const gasCostPercentage = Number(gasCost) / Number(amountToFill) * 100;
      if (gasCostPercentage > this.config.maxSlippage) {
        this.logger.info(`Intent ${intent.intentId} gas too high: ${gasCostPercentage.toFixed(2)}%`);
        return null;
      }

      const plan: FulfillmentPlan = {
        intentId: intent.intentId,
        destinationAmount: quote.outputAmount,
        swapRoute: quote,
        estimatedProfit,
        gasEstimate: totalGas,
      };

      // Add partial fill info if applicable
      if (partialFillAmount && partialFillAmount < intent.amount) {
        const fillPercentage = Number(partialFillAmount * BigInt(100) / intent.amount);
        plan.partialFill = {
          originalAmount: intent.amount,
          fillAmount: partialFillAmount,
          fillPercentage,
        };
      }

      return plan;
    } catch (error) {
      this.logger.error(`Error evaluating intent ${intent.intentId}:`, error);
      return null;
    }
  }

  async evaluatePartialFill(intent: IntentEvent, maxFillPercentage: number = 100): Promise<FulfillmentPlan | null> {
    // Try full fill first
    const fullPlan = await this.evaluate(intent);
    if (fullPlan) return fullPlan;

    // If full fill not profitable, try partial fills
    const fillPercentages = [75, 50, 25, 10];
    
    for (const percentage of fillPercentages) {
      if (percentage > maxFillPercentage) continue;
      
      const partialAmount = intent.amount * BigInt(percentage) / BigInt(100);
      const partialPlan = await this.evaluate(intent, partialAmount);
      
      if (partialPlan) {
        this.logger.info(`Partial fill ${percentage}% profitable for intent ${intent.intentId}`);
        return partialPlan;
      }
    }

    this.logger.info(`No profitable fill level found for intent ${intent.intentId}`);
    return null;
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
