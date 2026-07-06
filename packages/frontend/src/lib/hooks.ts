"use client";

import useSWR from "swr";

export interface IntentData {
  intentId: string;
  user: string;
  sourceToken: string;
  sourceAmount: string;
  destToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  expiry: number;
  status: number;
  solver: string;
  fulfilledAmount: string;
  sourceChainId: number;
  destChainId: number;
}

export interface Quote {
  intentId: string;
  solverAddress: string;
  outputAmount: string;
  feeBps: number;
  signature: string;
  createdAt: number;
}

export interface BridgeStatus {
  intentId: string;
  sourceChainId: number;
  destChainId: number;
  locked: boolean;
  lockedAmount: string;
  lockedToken: string;
  minted: boolean;
  mintedAmount: string;
  bridgeOutTxHash?: string;
  bridgeInTxHash?: string;
  processed: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useIntents(user?: string | null) {
  const url = user ? `/api/intents?user=${user}` : "/api/intents";
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });
  return {
    intents: (data?.intents || []) as IntentData[],
    error,
    isLoading,
    mutate,
  };
}

export function useQuotes(intentId?: string | null) {
  const url = intentId ? `/api/quotes?intentId=${intentId}` : null;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
  });
  return {
    quotes: (data?.quotes || []) as Quote[],
    error,
    isLoading,
    mutate,
  };
}

export function useBridgeStatus(intentId?: string | null) {
  const url = intentId ? `/api/bridge-status?intentId=${intentId}` : null;
  const { data, error, isLoading } = useSWR(url, fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });
  return {
    status: data as BridgeStatus | undefined,
    error,
    isLoading,
  };
}

export function useStats() {
  const { data, error, isLoading } = useSWR("/api/stats", fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });
  const stats = data
    ? ({
        total: Number(data.total) || 0,
        fulfilled: Number(data.fulfilled) || 0,
        activeSolvers: Number(data.activeSolvers) || 0,
        successRate: data.successRate,
      } as { total: number; fulfilled: number; activeSolvers: number; successRate: string })
    : undefined;
  return {
    stats,
    error,
    isLoading,
  };
}
