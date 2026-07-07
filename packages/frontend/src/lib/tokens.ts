export interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: number;
}

export interface ChainInfo {
  chainId: number;
  name: string;
  shortName: string;
  nativeSymbol: string;
}

export const CHAINS: ChainInfo[] = [
  { chainId: 51, name: "XDC Apothem", shortName: "Apothem", nativeSymbol: "XDC" },
  { chainId: 99999, name: "Mock L2 Alpha", shortName: "MockL2", nativeSymbol: "mXDC" },
  { chainId: 88888, name: "Mock L2 Beta", shortName: "MockL2-Beta", nativeSymbol: "mXDC" },
];

export const TOKENS: TokenInfo[] = [
  {
    symbol: "MUSDC",
    name: "Mock USDC",
    address: "0x86530A99784D188e8343e119140114d9e5fD0546",
    decimals: 18,
    chainId: 51,
  },
  {
    symbol: "MXDC",
    name: "Mock XDC",
    address: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
    decimals: 18,
    chainId: 51,
  },
  {
    symbol: "XDC",
    name: "XDC Network",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    chainId: 51,
  },
];

export const chainName = (chainId: number) => CHAINS.find((c) => c.chainId === chainId)?.shortName || `Chain ${chainId}`;

export const tokenByAddress = (address: string) =>
  TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());

export const tokenSymbol = (address: string) => tokenByAddress(address)?.symbol || address.slice(0, 6);

export const tokenDecimals = (address: string) => tokenByAddress(address)?.decimals || 18;

export function formatTokenAmount(amount: string | bigint, address: string): string {
  const decimals = tokenDecimals(address);
  try {
    const value = typeof amount === "string" ? BigInt(amount) : amount;
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: decimals > 6 ? 6 : decimals,
      minimumFractionDigits: 0,
    }).format(Number(value) / Math.pow(10, decimals));
  } catch {
    return amount.toString();
  }
}

export function parseTokenAmount(amount: string, address: string): bigint {
  const decimals = tokenDecimals(address);
  try {
    const [whole, frac = ""] = amount.split(".");
    const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
    return BigInt(whole) * BigInt(10 ** decimals) + BigInt(padded);
  } catch {
    return BigInt(0);
  }
}
