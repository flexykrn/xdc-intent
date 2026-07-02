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
    escrow: '0x8cD60D4235ee2966B89eCa41B7Fe31392512b3a6',
    paymentVerifier: '0x46CD0bb7Ba59275b58A865439df1D5F11aA1E288',
    intentRegistry: '0xC3C09573e4E4D6da363cf32f7923760ec80ec904',
  },
};

export const SUPPORTED_STABLECOINS: Record<number, string[]> = {
  [CHAIN_IDS.XDC_APOTHEM]: [
    '0x38bBd638AbCB44BDa788eBe382ee224b4f1F2f52', // MockUSDC
  ],
  [CHAIN_IDS.XDC_MAINNET]: [
    // USDC bridged via Stargate (to be populated after deployment)
  ],
};

export const DEFAULT_SOLVER_FEE_BPS = 30; // 0.3%
export const MIN_SOLVER_FEE_USD = 1;
