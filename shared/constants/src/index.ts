export const CHAIN_IDS = {
  XDC_MAINNET: 50,
  XDC_APOTHEM: 51,
  HARDHAT: 31337,
  SEPOLIA: 11155111,
  ARBITRUM_SEPOLIA: 421614,
} as const;

export const CAIP2: Record<number, string> = {
  [CHAIN_IDS.XDC_MAINNET]: 'eip155:50',
  [CHAIN_IDS.XDC_APOTHEM]: 'eip155:51',
  [CHAIN_IDS.HARDHAT]: 'eip155:31337',
  [CHAIN_IDS.SEPOLIA]: 'eip155:11155111',
  [CHAIN_IDS.ARBITRUM_SEPOLIA]: 'eip155:421614',
};

export const CONTRACT_ADDRESSES: Record<
  number,
  {
    escrow: string;
    paymentVerifier: string;
    intentRegistry: string;
    solverRegistry: string;
    mockBridge: string;
    mockUSDC: string;
    mockXDC: string;
  }
> = {
  [CHAIN_IDS.XDC_APOTHEM]: {
    escrow: '0x5c6fb5D7E81e11C303e5cE00fBE7AE748a47690d',
    paymentVerifier: '0x6Ce223bD961217917aa16654E77A6A440f35A70A',
    intentRegistry: '0xfe1887C1686cF54d83107DAf7Ad7F5A5Ea95419b',
    solverRegistry: '0x4F87a92E3950ec53AFC1776F14Af33c6E9aab360',
    mockBridge: '0xB494122Fb840D928d0f0F98E69985a85E9EBC139',
    mockUSDC: '0x86530A99784D188e8343e119140114d9e5fD0546',
    mockXDC: '0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312',
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
