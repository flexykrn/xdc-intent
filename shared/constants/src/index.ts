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
    escrow: '0xF5BDAA17e4cEA2bD6c19dea300Ff855db1E22288',
    paymentVerifier: '0x31dFf11EC285ef4167133218bDE2DE8CCAeb36D6',
    intentRegistry: '0x53d5bDe77bbeC1D0bE9dd0826b66deF2Af63dAA4',
  },
};

export const SUPPORTED_STABLECOINS: Record<number, string[]> = {
  [CHAIN_IDS.XDC_APOTHEM]: [
    '0x86530A99784D188e8343e119140114d9e5fD0546', // MockUSDC
  ],
  [CHAIN_IDS.XDC_MAINNET]: [
    // USDC bridged via Stargate (to be populated after deployment)
  ],
};

export const DEFAULT_SOLVER_FEE_BPS = 30; // 0.3%
export const MIN_SOLVER_FEE_USD = 1;
