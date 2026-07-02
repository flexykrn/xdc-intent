export const CHAIN_IDS = {
  XDC_MAINNET: 50,
  XDC_APOTHEM: 51,
  HARDHAT: 31337,
  SEPOLIA: 11155111,
} as const;

export const CAIP2: Record<number, string> = {
  [CHAIN_IDS.XDC_MAINNET]: 'eip155:50',
  [CHAIN_IDS.XDC_APOTHEM]: 'eip155:51',
  [CHAIN_IDS.HARDHAT]: 'eip155:31337',
  [CHAIN_IDS.SEPOLIA]: 'eip155:11155111',
};

export const CONTRACT_ADDRESSES: Record<number, { escrow: string; paymentVerifier: string; intentRegistry: string }> = {
  [CHAIN_IDS.XDC_APOTHEM]: {
    escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
    paymentVerifier: '0x14699d436E3c5d870A7C6aC3825C500C8f86d270',
    intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
  },
};

export const SUPPORTED_STABLECOINS: Record<number, string[]> = {
  [CHAIN_IDS.XDC_APOTHEM]: [
    '0x951857744785f80e2d4013e0d0814c1356412440', // MockUSDC placeholder
  ],
  [CHAIN_IDS.XDC_MAINNET]: [
    // USDC bridged via Stargate (to be populated after deployment)
  ],
};

export const DEFAULT_SOLVER_FEE_BPS = 30; // 0.3%
export const MIN_SOLVER_FEE_USD = 1;
