export interface Intent {
  id: string;
  tokenFrom: string;
  tokenTo: string;
  amountFrom: number;
  minAmountTo: number;
  status: 'pending' | 'filled' | 'expired' | 'cancelled';
  createdAt: string;
  expiry: string;
  solver?: string;
}

export interface Token {
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  icon: string;
}

export interface StatsData {
  totalIntents: number;
  activeSolvers: number;
  successRate: number;
  avgFillTime: string;
}
