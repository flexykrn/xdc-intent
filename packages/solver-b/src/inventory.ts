import { ethers } from 'ethers';

export interface TokenBalance {
  token: string;
  chainId: number;
  balance: bigint;
  decimals: number;
  updatedAt: number;
}

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export class InventoryTracker {
  private cache = new Map<string, TokenBalance>();
  private ttlMs: number;

  constructor(
    private provider: ethers.Provider,
    private ownerAddress: string,
    ttlMs = 10000
  ) {
    this.ttlMs = ttlMs;
  }

  private cacheKey(chainId: number, token: string): string {
    return `${chainId}:${token.toLowerCase()}`;
  }

  async getBalance(chainId: number, token: string): Promise<TokenBalance> {
    const key = this.cacheKey(chainId, token);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.updatedAt < this.ttlMs) {
      return cached;
    }

    try {
      const tokenContract = new ethers.Contract(token, ERC20_ABI, this.provider);
      const [balance, decimals] = await Promise.all([
        tokenContract.balanceOf(this.ownerAddress),
        tokenContract.decimals(),
      ]);
      const entry: TokenBalance = {
        token,
        chainId,
        balance,
        decimals: Number(decimals),
        updatedAt: Date.now(),
      };
      this.cache.set(key, entry);
      return entry;
    } catch (error: any) {
      const fallback: TokenBalance = {
        token,
        chainId,
        balance: 0n,
        decimals: 18,
        updatedAt: Date.now(),
      };
      this.cache.set(key, fallback);
      return fallback;
    }
  }

  async hasSufficientBalance(chainId: number, token: string, required: bigint): Promise<boolean> {
    const entry = await this.getBalance(chainId, token);
    return entry.balance >= required;
  }

  getCachedBalances(): TokenBalance[] {
    return Array.from(this.cache.values());
  }
}
