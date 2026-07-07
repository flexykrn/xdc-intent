import { ethers } from 'ethers';

export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

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
  quoteNativeToDest(nativeAmount: bigint, destToken: string): Promise<bigint>;
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

  async quoteNativeToDest(nativeAmount: bigint, destToken: string): Promise<bigint> {
    return 0n;
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

// SimpleDEX (Uniswap V2-style) adapter using the in-repo SimpleDEXRouter.
export class SimpleDEXAdapter implements DEXAdapter {
  private router: ethers.Contract;

  constructor(
    routerAddress: string,
    private provider: ethers.Provider,
    private wrappedNativeToken?: string
  ) {
    const routerAbi = [
      'function factory() external view returns (address)',
      'function WETH() external view returns (address)',
      'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    ];
    this.router = new ethers.Contract(routerAddress, routerAbi, provider);
  }

  private normalizeAddress(address: string): string {
    return ethers.getAddress(address.toLowerCase());
  }

  private normalizeToken(token: string): string {
    if (token.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      if (!this.wrappedNativeToken) {
        throw new Error('Native token not supported by this SimpleDEX deployment; no wrapped native token configured');
      }
      return this.normalizeAddress(this.wrappedNativeToken);
    }
    return this.normalizeAddress(token);
  }

  async getQuote(inputToken: string, outputToken: string, inputAmount: bigint): Promise<SwapQuote> {
    const normalizedIn = this.normalizeToken(inputToken);
    const normalizedOut = this.normalizeToken(outputToken);
    const amounts = await this.router.getAmountsOut(inputAmount, [normalizedIn, normalizedOut]);
    const amountOut = amounts[amounts.length - 1];
    const exchangeRate = Number(amountOut) / Number(inputAmount);
    return {
      inputToken,
      outputToken,
      inputAmount,
      outputAmount: amountOut,
      exchangeRate,
      gasEstimate: 180000n,
    };
  }

  async quoteNativeToDest(nativeAmount: bigint, destToken: string): Promise<bigint> {
    const normalizedDest = this.normalizeAddress(destToken);

    let nativeWrapper: string;
    try {
      const weth = await (this.router as any).WETH();
      if (weth && weth.toLowerCase() !== NATIVE_TOKEN_ADDRESS.toLowerCase()) {
        nativeWrapper = this.normalizeAddress(weth);
      } else if (this.wrappedNativeToken) {
        nativeWrapper = this.normalizeAddress(this.wrappedNativeToken);
      } else {
        return 0n;
      }
    } catch {
      return 0n;
    }

    if (nativeWrapper.toLowerCase() === normalizedDest.toLowerCase()) {
      return nativeAmount;
    }

    try {
      const amounts = await this.router.getAmountsOut(nativeAmount, [nativeWrapper, normalizedDest]);
      return amounts[amounts.length - 1];
    } catch {
      return 0n;
    }
  }

  async executeSwap(quote: SwapQuote, signer: ethers.Signer): Promise<ethers.TransactionResponse> {
    const routerWithSigner = this.router.connect(signer);
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const minOutput = (quote.outputAmount * 95n) / 100n;
    const path = [this.normalizeToken(quote.inputToken), this.normalizeToken(quote.outputToken)];
    return (routerWithSigner as any).swapExactTokensForTokens(
      quote.inputAmount,
      minOutput,
      path,
      await signer.getAddress(),
      deadline
    );
  }
}

// Mock adapter for local/testing use.
export class MockDEXAdapter implements DEXAdapter {
  private rates = new Map<string, number>([
    ['XDC-USDC', 0.05],
    ['XDC-MXDC', 1],
    ['USDC-XDC', 20],
    ['USDC-USDT', 1],
    ['USDC-MXDC', 20],
    ['MXDC-USDC', 0.05],
  ]);

  private tokenSymbols = new Map<string, string>([
    [NATIVE_TOKEN_ADDRESS.toLowerCase(), 'XDC'],
    ['0x86530a99784d188e8343e119140114d9e5fd0546', 'USDC'],
    ['0xfe4e746ca450c46fe6ede5eac184a7f2082b2312', 'MXDC'],
  ]);

  constructor() {
    const envRates = process.env.MOCK_DEX_RATES;
    if (envRates) {
      for (const entry of envRates.split(',')) {
        const [pair, rateStr] = entry.split(':');
        if (pair && rateStr) {
          this.rates.set(pair.trim().toUpperCase(), parseFloat(rateStr.trim()));
        }
      }
    }
  }

  async getQuote(inputToken: string, outputToken: string, inputAmount: bigint): Promise<SwapQuote> {
    const inSym = this.tokenSymbols.get(inputToken.toLowerCase()) || inputToken;
    const outSym = this.tokenSymbols.get(outputToken.toLowerCase()) || outputToken;
    const pair = `${inSym}-${outSym}`;
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

  async quoteNativeToDest(nativeAmount: bigint, destToken: string): Promise<bigint> {
    if (destToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      return nativeAmount;
    }
    const outSym = this.tokenSymbols.get(destToken.toLowerCase()) || destToken;
    const pair = `XDC-${outSym}`;
    const rate = this.rates.get(pair);
    if (!rate) return 0n;
    const fee = nativeAmount / 1000n;
    return ((nativeAmount - fee) * BigInt(Math.floor(rate * 1000))) / 1000n;
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
