import { Intent, Token, StatsData } from './types';

export const mockTokens: Token[] = [
  { symbol: 'XDC', name: 'XDC Network', balance: 15420.5, decimals: 18, icon: '💎' },
  { symbol: 'WXDC', name: 'Wrapped XDC', balance: 3200.0, decimals: 18, icon: '🔷' },
  { symbol: 'USDT', name: 'Tether', balance: 8750.25, decimals: 6, icon: '💵' },
  { symbol: 'USDC', name: 'USD Coin', balance: 5100.0, decimals: 6, icon: '🪙' },
  { symbol: 'ETH', name: 'Ethereum', balance: 2.45, decimals: 18, icon: '⟠' },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', balance: 0.15, decimals: 8, icon: '₿' },
];

export const mockIntents: Intent[] = [
  {
    id: '0x7a3f...e8b2',
    tokenFrom: 'XDC',
    tokenTo: 'USDT',
    amountFrom: 5000,
    minAmountTo: 248.5,
    status: 'pending',
    createdAt: '2025-01-15 14:32',
    expiry: '24h',
  },
  {
    id: '0x2c1d...a4f7',
    tokenFrom: 'USDC',
    tokenTo: 'XDC',
    amountFrom: 1000,
    minAmountTo: 19800,
    status: 'filled',
    createdAt: '2025-01-15 10:15',
    expiry: '6h',
    solver: 'SolverAlpha',
  },
  {
    id: '0x9e4b...c1d3',
    tokenFrom: 'ETH',
    tokenTo: 'XDC',
    amountFrom: 0.5,
    minAmountTo: 48500,
    status: 'filled',
    createdAt: '2025-01-14 22:08',
    expiry: '24h',
    solver: 'FastFill',
  },
  {
    id: '0x5f8a...b9e1',
    tokenFrom: 'XDC',
    tokenTo: 'USDC',
    amountFrom: 10000,
    minAmountTo: 495,
    status: 'expired',
    createdAt: '2025-01-13 08:45',
    expiry: '1h',
  },
  {
    id: '0x3d2c...f7a8',
    tokenFrom: 'WBTC',
    tokenTo: 'XDC',
    amountFrom: 0.05,
    minAmountTo: 85000,
    status: 'pending',
    createdAt: '2025-01-15 16:20',
    expiry: '3d',
  },
];

export const mockStats: StatsData = {
  totalIntents: 184729,
  activeSolvers: 47,
  successRate: 99.2,
  avgFillTime: '4.2s',
};
