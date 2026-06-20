import { ethers } from 'ethers';
import { Logger } from './logger';
import { SolverConfig } from './config';
import { DEXAdapter, SwapQuote } from './adapters/dex';

export interface RouteHop {
  fromToken: string;
  toToken: string;
  dexAdapter: DEXAdapter;
  quote: SwapQuote;
}

export interface MultiHopRoute {
  hops: RouteHop[];
  totalInput: bigint;
  totalOutput: bigint;
  totalGasEstimate: bigint;
  totalExchangeRate: number;
  path: string[]; // Token addresses in order
}

export class MultiHopRouter {
  constructor(
    private config: SolverConfig,
    private logger: Logger,
    private dexAdapters: Map<string, DEXAdapter> // token pair -> adapter
  ) {}

  async findBestRoute(
    sourceToken: string,
    destinationToken: string,
    amount: bigint,
    maxHops: number = 3
  ): Promise<MultiHopRoute | null> {
    // Direct route (1 hop)
    const directRoute = await this.evaluateDirectRoute(sourceToken, destinationToken, amount);
    
    if (maxHops === 1) {
      return directRoute;
    }

    // Try 2-hop routes via intermediate tokens
    const twoHopRoutes: MultiHopRoute[] = [];
    const intermediateTokens = this.getIntermediateTokens(sourceToken, destinationToken);
    
    for (const intermediate of intermediateTokens) {
      const route = await this.evaluateTwoHopRoute(sourceToken, intermediate, destinationToken, amount);
      if (route) {
        twoHopRoutes.push(route);
      }
    }

    // Try 3-hop routes
    const threeHopRoutes: MultiHopRoute[] = [];
    if (maxHops >= 3) {
      for (const mid1 of intermediateTokens) {
        for (const mid2 of intermediateTokens) {
          if (mid1 === mid2) continue;
          const route = await this.evaluateThreeHopRoute(sourceToken, mid1, mid2, destinationToken, amount);
          if (route) {
            threeHopRoutes.push(route);
          }
        }
      }
    }

    // Combine all routes and find best
    const allRoutes = [
      ...(directRoute ? [directRoute] : []),
      ...twoHopRoutes,
      ...threeHopRoutes,
    ];

    if (allRoutes.length === 0) {
      return null;
    }

    // Sort by total output (best rate)
    allRoutes.sort((a, b) => Number(b.totalOutput - a.totalOutput));
    
    const bestRoute = allRoutes[0];
    this.logger.info(`Best route found: ${bestRoute.path.join(' -> ')}`, {
      output: bestRoute.totalOutput.toString(),
      hops: bestRoute.hops.length,
    });

    return bestRoute;
  }

  private async evaluateDirectRoute(
    sourceToken: string,
    destinationToken: string,
    amount: bigint
  ): Promise<MultiHopRoute | null> {
    const adapter = this.getAdapter(sourceToken, destinationToken);
    if (!adapter) return null;

    try {
      const quote = await adapter.getQuote(sourceToken, destinationToken, amount);
      
      return {
        hops: [{
          fromToken: sourceToken,
          toToken: destinationToken,
          dexAdapter: adapter,
          quote,
        }],
        totalInput: amount,
        totalOutput: quote.outputAmount,
        totalGasEstimate: quote.gasEstimate,
        totalExchangeRate: quote.exchangeRate,
        path: [sourceToken, destinationToken],
      };
    } catch (error) {
      this.logger.debug(`Direct route failed: ${sourceToken} -> ${destinationToken}`);
      return null;
    }
  }

  private async evaluateTwoHopRoute(
    sourceToken: string,
    intermediateToken: string,
    destinationToken: string,
    amount: bigint
  ): Promise<MultiHopRoute | null> {
    const adapter1 = this.getAdapter(sourceToken, intermediateToken);
    const adapter2 = this.getAdapter(intermediateToken, destinationToken);
    
    if (!adapter1 || !adapter2) return null;

    try {
      const quote1 = await adapter1.getQuote(sourceToken, intermediateToken, amount);
      const quote2 = await adapter2.getQuote(intermediateToken, destinationToken, quote1.outputAmount);

      const totalGas = quote1.gasEstimate + quote2.gasEstimate;

      return {
        hops: [
          { fromToken: sourceToken, toToken: intermediateToken, dexAdapter: adapter1, quote: quote1 },
          { fromToken: intermediateToken, toToken: destinationToken, dexAdapter: adapter2, quote: quote2 },
        ],
        totalInput: amount,
        totalOutput: quote2.outputAmount,
        totalGasEstimate: totalGas,
        totalExchangeRate: Number(quote2.outputAmount) / Number(amount),
        path: [sourceToken, intermediateToken, destinationToken],
      };
    } catch (error) {
      this.logger.debug(`Two-hop route failed: ${sourceToken} -> ${intermediateToken} -> ${destinationToken}`);
      return null;
    }
  }

  private async evaluateThreeHopRoute(
    sourceToken: string,
    mid1: string,
    mid2: string,
    destinationToken: string,
    amount: bigint
  ): Promise<MultiHopRoute | null> {
    const adapter1 = this.getAdapter(sourceToken, mid1);
    const adapter2 = this.getAdapter(mid1, mid2);
    const adapter3 = this.getAdapter(mid2, destinationToken);
    
    if (!adapter1 || !adapter2 || !adapter3) return null;

    try {
      const quote1 = await adapter1.getQuote(sourceToken, mid1, amount);
      const quote2 = await adapter2.getQuote(mid1, mid2, quote1.outputAmount);
      const quote3 = await adapter3.getQuote(mid2, destinationToken, quote2.outputAmount);

      const totalGas = quote1.gasEstimate + quote2.gasEstimate + quote3.gasEstimate;

      return {
        hops: [
          { fromToken: sourceToken, toToken: mid1, dexAdapter: adapter1, quote: quote1 },
          { fromToken: mid1, toToken: mid2, dexAdapter: adapter2, quote: quote2 },
          { fromToken: mid2, toToken: destinationToken, dexAdapter: adapter3, quote: quote3 },
        ],
        totalInput: amount,
        totalOutput: quote3.outputAmount,
        totalGasEstimate: totalGas,
        totalExchangeRate: Number(quote3.outputAmount) / Number(amount),
        path: [sourceToken, mid1, mid2, destinationToken],
      };
    } catch (error) {
      this.logger.debug(`Three-hop route failed: ${sourceToken} -> ${mid1} -> ${mid2} -> ${destinationToken}`);
      return null;
    }
  }

  private getAdapter(tokenA: string, tokenB: string): DEXAdapter | undefined {
    const pair = `${tokenA}-${tokenB}`;
    return this.dexAdapters.get(pair);
  }

  private getIntermediateTokens(source: string, destination: string): string[] {
    // Common intermediate tokens on XDC
    const commonIntermediates = [
      '0x0000000000000000000000000000000000000000', // XDC
      '0x951857744785f80e2d4013e0d0814c1356412440', // USDC
      '0xc974be716f52b1e6f501b1e1e4eda543216a2c93', // USDT
    ];
    
    return commonIntermediates.filter(t => t !== source && t !== destination);
  }

  async executeRoute(route: MultiHopRoute, signer: ethers.Signer): Promise<ethers.TransactionResponse[]> {
    const transactions: ethers.TransactionResponse[] = [];
    
    // Execute each hop atomically
    // Note: In production, this would use a multicall or flash loan for atomicity
    for (const hop of route.hops) {
      this.logger.info(`Executing hop: ${hop.fromToken} -> ${hop.toToken}`);
      
      const tx = await hop.dexAdapter.executeSwap(hop.quote, signer);
      transactions.push(tx);
      
      // Wait for confirmation before next hop
      await tx.wait();
    }

    return transactions;
  }
}
