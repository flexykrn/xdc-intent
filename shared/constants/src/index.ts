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
    escrow: '0xE15BcFf9046D1c1aa446006839963576E882236f',
    paymentVerifier: '0x16Be0618263dD0C286E8A5ec2f62D5dFB0B9fA03',
    intentRegistry: '0xDc392f24c9F09E5FD7cAFfB61b1feeD17e7D652F',
  },
};

export const SUPPORTED_STABLECOINS: Record<number, string[]> = {
  [CHAIN_IDS.XDC_APOTHEM]: [
    '0xB2F1309AA1C141C3B989085D20922ffA6e83cB1b', // MockUSDC
  ],
  [CHAIN_IDS.XDC_MAINNET]: [
    // USDC bridged via Stargate (to be populated after deployment)
  ],
};

export const DEFAULT_SOLVER_FEE_BPS = 30; // 0.3%
export const MIN_SOLVER_FEE_USD = 1;
