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
  { chainId: 11155111, name: "Sepolia", shortName: "Sepolia", nativeSymbol: "ETH" },
  { chainId: 421614, name: "Arbitrum Sepolia", shortName: "Arb Sepolia", nativeSymbol: "ETH" },
];

export const SOURCE_CHAINS = [51, 11155111];
export const DEST_CHAINS = [51, 11155111, 421614];

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
  {
    symbol: "MUSDC",
    name: "Mock USDC",
    address: "0xc4444878b39A45D7B7D397b089B479f44D2f1796",
    decimals: 18,
    chainId: 11155111,
  },
  {
    symbol: "MXDC",
    name: "Mock XDC",
    address: "0x1FD2e5d44b91D76A5f622c54C45Bde42965B8c7A",
    decimals: 18,
    chainId: 11155111,
  },
  {
    symbol: "ETH",
    name: "Sepolia ETH",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    chainId: 11155111,
  },
  {
    symbol: "MUSDC",
    name: "Mock USDC",
    address: "0xcC4A7fF0512Ee5bEEF25C2b61784FbDfA9ff5A45",
    decimals: 18,
    chainId: 421614,
  },
  {
    symbol: "ETH",
    name: "Arbitrum Sepolia ETH",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    chainId: 421614,
  },
];

export const chainName = (chainId: number) => CHAINS.find((c) => c.chainId === chainId)?.shortName || `Chain ${chainId}`;

export const tokensForChain = (chainId: number) => TOKENS.filter((t) => t.chainId === chainId);

export const tokenByAddress = (address: string, chainId?: number) =>
  TOKENS.find((t) =>
    t.address.toLowerCase() === address.toLowerCase() &&
    (chainId === undefined || t.chainId === chainId)
  );

export const tokenSymbol = (address: string, chainId?: number) =>
  tokenByAddress(address, chainId)?.symbol || address.slice(0, 6);

export const tokenDecimals = (address: string, chainId?: number) =>
  tokenByAddress(address, chainId)?.decimals || 18;

export function formatTokenAmount(amount: string | bigint, address: string, chainId?: number): string {
  const decimals = tokenDecimals(address, chainId);
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

export function parseTokenAmount(amount: string, address: string, chainId?: number): bigint {
  const decimals = tokenDecimals(address, chainId);
  try {
    const [whole, frac = ""] = amount.split(".");
    const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
    return BigInt(whole) * BigInt(10 ** decimals) + BigInt(padded);
  } catch {
    return BigInt(0);
  }
}

export function explorerUrl(chainId: number, type: "tx" | "address", value: string): string {
  switch (chainId) {
    case 11155111:
      return `https://sepolia.etherscan.io/${type}/${value}`;
    case 421614:
      return `https://sepolia.arbiscan.io/${type}/${value}`;
    case 51:
    case 99999:
    case 88888:
    default:
      return `https://testnet.xdcscan.com/${type}/${value}`;
  }
}
