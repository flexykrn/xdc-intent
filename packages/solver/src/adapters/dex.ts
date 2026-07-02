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
  getQuote(inputToken: string, outputToken: string, inputAmount: bigint): Promise<SwapQuote>;
  executeSwap(quote: SwapQuote, signer: ethers.Signer): Promise<ethers.TransactionResponse>;
}

// Minimal XSwap V3-style adapter using a Uniswap V3 Quoter + Router.
export class XSwapV3Adapter implements DEXAdapter {
  private quoter: ethers.Contract;
  private router: ethers.Contract;

  constructor(
    quoterAddress: string,
    routerAddress: string,
    private provider: ethers.Provider,
    private fee: number = 3000
  ) {
    const quoterAbi = [
      'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
    ];
    const routerAbi = [
      'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
    ];
    this.quoter = new ethers.Contract(quoterAddress, quoterAbi, provider);
    this.router = new ethers.Contract(routerAddress, routerAbi, provider);
  }

  async getQuote(inputToken: string, outputToken: string, inputAmount: bigint): Promise<SwapQuote> {
    const amountOut = await this.quoter.quoteExactInputSingle(
      inputToken,
      outputToken,
      this.fee,
      inputAmount,
      0
    );
    return {
      inputToken,
      outputToken,
      inputAmount,
      outputAmount: amountOut,
      exchangeRate: Number(amountOut) / Number(inputAmount),
      gasEstimate: 200000n,
    };
  }

  async executeSwap(quote: SwapQuote, signer: ethers.Signer): Promise<ethers.TransactionResponse> {
    const routerWithSigner = this.router.connect(signer);
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const minOutput = (quote.outputAmount * 95n) / 100n;
    return (routerWithSigner as any).exactInputSingle({
      tokenIn: quote.inputToken,
      tokenOut: quote.outputToken,
      fee: this.fee,
      recipient: await signer.getAddress(),
      deadline,
      amountIn: quote.inputAmount,
      amountOutMinimum: minOutput,
      sqrtPriceLimitX96: 0,
    });
  }
}

// Mock adapter for local testing.
export class MockDEXAdapter implements DEXAdapter {
  private rates = new Map<string, number>([
    ['XDC-USDC', 0.05],
    ['USDC-XDC', 20],
    ['USDC-USDT', 1],
  ]);

  async getQuote(inputToken: string, outputToken: string, inputAmount: bigint): Promise<SwapQuote> {
    const pair = `${inputToken}-${outputToken}`;
    const rate = this.rates.get(pair) || 1;
    const fee = inputAmount / 1000n;
    const outputAmount = ((inputAmount - fee) * BigInt(Math.floor(rate * 1000))) / 1000n;
    return {
      inputToken,
      outputToken,
      inputAmount,
      outputAmount,
      exchangeRate: rate,
      gasEstimate: 150000n,
    };
  }

  async executeSwap(quote: SwapQuote, signer: ethers.Signer): Promise<ethers.TransactionResponse> {
    const mockTx = {
      hash: '0x' + 'a'.repeat(64),
      wait: async () => ({ status: 1 } as any),
    } as unknown as ethers.TransactionResponse;
    return mockTx;
  }

  setRate(pair: string, rate: number): void {
    this.rates.set(pair, rate);
  }
}
