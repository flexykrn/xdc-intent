import { ethers } from 'ethers';

export interface SwapQuote {
  inputToken: string;
  outputToken: string;
  inputAmount: bigint;
  outputAmount: bigint;
  exchangeRate: number;
  gasEstimate: bigint;
}

export interface DEXAdapter {
  getQuote(
    inputToken: string,
    outputToken: string,
    inputAmount: bigint
  ): Promise<SwapQuote>;
  
  executeSwap(
    quote: SwapQuote,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse>;
}

// Mock DEX adapter for testing
export class MockDEXAdapter implements DEXAdapter {
  private exchangeRates: Map<string, number> = new Map();
  
  constructor() {
    // Set default rates (1:1 for most pairs)
    this.exchangeRates.set('XDC-USDC', 0.05); // 1 XDC = 0.05 USDC
    this.exchangeRates.set('USDC-XDC', 20);   // 1 USDC = 20 XDC
    this.exchangeRates.set('XDC-USDT', 0.05);
    this.exchangeRates.set('USDT-XDC', 20);
    this.exchangeRates.set('USDC-USDT', 1);   // 1:1 stablecoin
    this.exchangeRates.set('USDT-USDC', 1);
  }
  
  async getQuote(
    inputToken: string,
    outputToken: string,
    inputAmount: bigint
  ): Promise<SwapQuote> {
    const pair = `${inputToken}-${outputToken}`;
    const rate = this.exchangeRates.get(pair) || 1;
    
    // Apply 0.1% fee
    const fee = inputAmount * BigInt(1) / BigInt(1000);
    const outputAmount = (inputAmount - fee) * BigInt(Math.floor(rate * 1000)) / BigInt(1000);
    
    return {
      inputToken,
      outputToken,
      inputAmount,
      outputAmount,
      exchangeRate: rate,
      gasEstimate: BigInt(150000), // Mock gas estimate
    };
  }
  
  async executeSwap(
    quote: SwapQuote,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    // Mock execution - just return a fake transaction
    const mockTx = {
      hash: '0x' + 'a'.repeat(64),
      wait: async () => ({ status: 1 }),
    } as unknown as ethers.TransactionResponse;
    
    return mockTx;
  }
  
  setRate(pair: string, rate: number): void {
    this.exchangeRates.set(pair, rate);
  }
}

// Real DEX adapter for deployed SimpleDEX on Apothem testnet
export class SimpleDEXAdapter implements DEXAdapter {
  private router: ethers.Contract;
  private factory: ethers.Contract;
  
  constructor(
    routerAddress: string,
    factoryAddress: string,
    private provider: ethers.Provider
  ) {
    const routerAbi = [
      'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    ];
    const factoryAbi = [
      'function getPair(address tokenA, address tokenB) external view returns (address pair)',
    ];
    
    this.router = new ethers.Contract(routerAddress, routerAbi, provider);
    this.factory = new ethers.Contract(factoryAddress, factoryAbi, provider);
  }
  
  async getQuote(
    inputToken: string,
    outputToken: string,
    inputAmount: bigint
  ): Promise<SwapQuote> {
    try {
      // Check if pair exists
      const pair = await this.factory.getPair(inputToken, outputToken);
      if (pair === ethers.ZeroAddress) {
        throw new Error('No liquidity pair found');
      }

      const path = [inputToken, outputToken];
      const amounts = await this.router.getAmountsOut(inputAmount, path);
      const outputAmount = amounts[amounts.length - 1];

      return {
        inputToken,
        outputToken,
        inputAmount,
        outputAmount,
        exchangeRate: Number(outputAmount) / Number(inputAmount),
        gasEstimate: BigInt(150000),
      };
    } catch (error) {
      throw new Error(`Failed to get quote: ${error}`);
    }
  }
  
  async executeSwap(
    quote: SwapQuote,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    const routerWithSigner = this.router.connect(signer);
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const minOutput = quote.outputAmount * BigInt(95) / BigInt(100); // 5% slippage

    return await (routerWithSigner as any).swapExactTokensForTokens(
      quote.inputAmount,
      minOutput,
      [quote.inputToken, quote.outputToken],
      await signer.getAddress(),
      deadline
    );
  }
}
