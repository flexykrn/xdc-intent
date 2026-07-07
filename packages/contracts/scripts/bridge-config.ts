import dotenv from "dotenv";

dotenv.config();

export interface MockDestChain {
  chainId: number;
  name: string;
  rpcUrl?: string;
  bridgeContract?: string;
}

export const DEFAULT_MOCK_DEST_CHAINS: MockDestChain[] = [
  { chainId: 99999, name: "Mock L2 Alpha" },
  { chainId: 88888, name: "Mock L2 Beta" },
];

export function getSupportedDestChains(): MockDestChain[] {
  const env = process.env.KEEPER_DEST_CHAIN_IDS;
  if (!env) return DEFAULT_MOCK_DEST_CHAINS;

  const chainIds = env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10))
    .filter((n) => !isNaN(n));

  if (chainIds.length === 0) return DEFAULT_MOCK_DEST_CHAINS;

  return chainIds.map((chainId) => ({
    chainId,
    name: `Mock L2 ${chainId}`,
  }));
}

export function isSupportedDestChain(chainId: number): boolean {
  return getSupportedDestChains().some((c) => c.chainId === chainId);
}
