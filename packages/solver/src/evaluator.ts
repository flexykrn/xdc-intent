import { Logger } from './logger';
import { SolverConfig } from './config';
import { IntentEvent } from './watcher';

export interface EvaluationResult {
  shouldFulfill: boolean;
  reason: string;
  estimatedProfit?: number;
  estimatedOutput?: bigint;
  slippage?: number;
}

export class IntentEvaluator {
  constructor(
    private config: SolverConfig,
    private logger: Logger
  ) {}

  evaluate(intent: IntentEvent): EvaluationResult {
    const now = Math.floor(Date.now() / 1000);
    
    // Check 1: Token pair supported
    const tokenSymbol = this.getTokenSymbol(intent.token);
    if (!this.config.supportedTokens.includes(tokenSymbol)) {
      return {
        shouldFulfill: false,
        reason: `Token ${tokenSymbol} not in supported list: ${this.config.supportedTokens.join(', ')}`,
      };
    }

    // Check 2: Expiry reasonable (at least 5 minutes away)
    const minExpiry = now + 300; // 5 minutes
    if (intent.expiry < minExpiry) {
      return {
        shouldFulfill: false,
        reason: `Expiry too soon: ${intent.expiry - now}s remaining, need 300s minimum`,
      };
    }

    // Check 3: Amount above minimum (0.001 tokens)
    const minAmount = ethers.parseEther('0.001');
    if (intent.amount < minAmount) {
      return {
        shouldFulfill: false,
        reason: `Amount too small: ${ethers.formatEther(intent.amount)}, minimum: 0.001`,
      };
    }

    // Check 4: Estimated profit positive
    // For mock DEX, assume 1:1 rate with 0.1% fee
    const estimatedOutput = this.estimateOutput(intent.amount);
    const estimatedProfit = this.calculateProfit(intent.amount, estimatedOutput);
    
    if (estimatedProfit < this.config.minProfitMargin) {
      return {
        shouldFulfill: false,
        reason: `Profit too low: ${estimatedProfit.toFixed(2)}%, minimum: ${this.config.minProfitMargin}%`,
      };
    }

    // Check 5: Slippage within tolerance
    const slippage = this.estimateSlippage(intent.amount);
    if (slippage > this.config.maxSlippage) {
      return {
        shouldFulfill: false,
        reason: `Slippage too high: ${slippage.toFixed(2)}%, maximum: ${this.config.maxSlippage}%`,
      };
    }

    return {
      shouldFulfill: true,
      reason: 'Intent is profitable and within parameters',
      estimatedProfit,
      estimatedOutput,
      slippage,
    };
  }

  private getTokenSymbol(tokenAddress: string): string {
    // Mock mapping - in production, this would come from a token registry
    const knownTokens: Record<string, string> = {
      '0x0000000000000000000000000000000000000000': 'XDC',
      '0x951857744785f80e2d4013e0d0814c1356412440': 'USDC',
      '0xc974be716f52b1e6f501b1e1e4eda543216a2c93': 'USDT',
    };
    return knownTokens[tokenAddress.toLowerCase()] || 'UNKNOWN';
  }

  private estimateOutput(amount: bigint): bigint {
    // Mock: 1:1 rate with 0.1% protocol fee
    const fee = amount * BigInt(1) / BigInt(1000); // 0.1%
    return amount - fee;
  }

  private calculateProfit(input: bigint, output: bigint): number {
    const profit = Number(output - input) / Number(input) * 100;
    return profit;
  }

  private estimateSlippage(amount: bigint): number {
    // Mock: slippage increases with amount
    // 0.1% base + 0.01% per 1000 tokens
    const amountInTokens = Number(amount) / 1e18;
    return 0.1 + (amountInTokens / 1000) * 0.01;
  }
}

import { ethers } from 'ethers';
