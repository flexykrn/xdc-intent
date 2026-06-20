import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';
import { IntentEvent } from './watcher';
import { DEXAdapter } from './adapters/dex';
import { XDCOnlyStrategy, FulfillmentPlan } from './strategies/xdc-only';
import { MultiHopRouter, MultiHopRoute } from './routes';

export interface StrategyResult {
  strategy: string;
  plan: FulfillmentPlan | null;
  route?: MultiHopRoute;
  executionTime: number;
}

export class FallbackStrategyManager {
  private primaryStrategy: XDCOnlyStrategy;
  private multiHopRouter: MultiHopRouter;

  constructor(
    private config: SolverConfig,
    private logger: Logger,
    dexAdapter: DEXAdapter,
    dexAdapters: Map<string, DEXAdapter>
  ) {
    this.primaryStrategy = new XDCOnlyStrategy(config, logger, dexAdapter);
    this.multiHopRouter = new MultiHopRouter(config, logger, dexAdapters);
  }

  async evaluateWithFallback(intent: IntentEvent): Promise<StrategyResult | null> {
    const startTime = Date.now();

    // Strategy 1: Direct XDC swap (primary)
    this.logger.info(`Evaluating primary strategy for intent ${intent.intentId}`);
    const primaryPlan = await this.primaryStrategy.evaluate(intent);
    
    if (primaryPlan) {
      return {
        strategy: 'primary',
        plan: primaryPlan,
        executionTime: Date.now() - startTime,
      };
    }

    this.logger.info(`Primary strategy failed, trying fallback strategies`);

    // Strategy 2: Partial fill
    this.logger.info(`Trying partial fill strategy`);
    const partialPlan = await this.primaryStrategy.evaluatePartialFill(intent, 50);
    
    if (partialPlan) {
      return {
        strategy: 'partial-fill',
        plan: partialPlan,
        executionTime: Date.now() - startTime,
      };
    }

    // Strategy 3: Multi-hop route
    this.logger.info(`Trying multi-hop route strategy`);
    const route = await this.multiHopRouter.findBestRoute(
      intent.token,
      intent.token, // Same token for now (would be different in cross-chain)
      intent.amount,
      3
    );

    if (route) {
      // Create a fulfillment plan from the multi-hop route
      const plan: FulfillmentPlan = {
        intentId: intent.intentId,
        destinationAmount: route.totalOutput,
        swapRoute: route.hops[0].quote, // Use first hop quote as primary
        estimatedProfit: this.calculateRouteProfit(intent.amount, route.totalOutput),
        gasEstimate: route.totalGasEstimate,
      };

      return {
        strategy: 'multi-hop',
        plan,
        route,
        executionTime: Date.now() - startTime,
      };
    }

    // Strategy 4: Wait and retry (if market conditions might improve)
    this.logger.info(`All strategies failed, marking for retry`);
    
    return {
      strategy: 'retry-later',
      plan: null,
      executionTime: Date.now() - startTime,
    };
  }

  private calculateRouteProfit(input: bigint, output: bigint): number {
    return Number(output - input) / Number(input) * 100;
  }

  async executeStrategy(
    result: StrategyResult,
    signer: ethers.Signer
  ): Promise<{ success: boolean; txHashes?: string[]; error?: string }> {
    try {
      if (!result.plan) {
        return { success: false, error: 'No fulfillment plan available' };
      }

      switch (result.strategy) {
        case 'primary':
        case 'partial-fill':
          // Execute single swap via DEX adapter
          if (result.plan.swapRoute) {
            // Find the adapter for this swap
            const adapter = this.getAdapterForTokens(
              result.plan.swapRoute.inputToken,
              result.plan.swapRoute.outputToken
            );
            if (adapter) {
              const tx = await adapter.executeSwap(result.plan.swapRoute, signer);
              await tx.wait();
              return { success: true, txHashes: [tx.hash] };
            }
          }
          break;

        case 'multi-hop':
          // Execute multi-hop route
          if (result.route) {
            const txs = await this.multiHopRouter.executeRoute(result.route, signer);
            const hashes = txs.map(tx => tx.hash);
            return { success: true, txHashes: hashes };
          }
          break;

        default:
          return { success: false, error: `Unknown strategy: ${result.strategy}` };
      }

      return { success: false, error: 'Execution failed' };
    } catch (error: any) {
      this.logger.error(`Strategy execution failed:`, error);
      return { success: false, error: error.message };
    }
  }

  getStrategyName(strategy: string): string {
    const names: Record<string, string> = {
      'primary': 'Direct XDC Swap',
      'partial-fill': 'Partial Fill',
      'multi-hop': 'Multi-Hop Route',
      'retry-later': 'Retry Later',
    };
    return names[strategy] || strategy;
  }

  private getAdapterForTokens(fromToken: string, toToken: string): DEXAdapter | undefined {
    const pair = `${fromToken}-${toToken}`;
    // This would need to be populated from the constructor in production
    return undefined;
  }
}
