"use client";

import useSWR from "swr";
import type { IntentData, Quote } from "@/lib/hooks";
import { tokenByAddress } from "@/lib/tokens";

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL;

export interface SolverRegistryEntry {
  id: string;
  solverId: number;
  name: string;
  feeBps: number;
  supportedChains: number[];
  active: boolean;
  totalFulfilled: number;
  totalVolume: string;
}

export interface DashboardStats {
  total: number;
  fulfilled: number;
  activeSolvers: number;
  successRate: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const STATUS_TO_NUMBER: Record<string, number> = {
  Open: 0,
  Fulfilled: 1,
  Cancelled: 2,
};

// The IntentSubmitted event does not include chain IDs, so missing values are
// defaulted to Apothem (51). Update the subgraph mapping to call getIntent() if
// you need accurate cross-chain source/destination chain IDs.
function defaultChainId(tokenAddress: string, fallback = 51): number {
  return tokenByAddress(tokenAddress)?.chainId ?? fallback;
}

interface GraphIntent {
  id: string;
  user: { id: string };
  sourceChainId: string | null;
  sourceToken: { id: string };
  sourceAmount: string;
  destChainId: string | null;
  destToken: { id: string };
  minDestAmount: string;
  maxSolverFee: string | null;
  expiry: string;
  status: "Open" | "Fulfilled" | "Cancelled";
  solver: { id: string } | null;
  fulfilledAmount: string | null;
}

interface GraphSolver {
  id: string;
  solverId: string;
  name: string;
  feeBps: string;
  supportedChains: string[];
  active: boolean;
  totalFulfilled: string;
  totalVolume: string;
}

interface GraphDailyStats {
  totalIntents: string;
  totalFulfilled: string;
}

async function request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!SUBGRAPH_URL) throw new Error("NEXT_PUBLIC_SUBGRAPH_URL is not set");
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  if (!json.data) {
    throw new Error("Subgraph returned empty data");
  }
  return json.data;
}

function toIntentData(intent: GraphIntent): IntentData {
  return {
    intentId: intent.id,
    user: intent.user.id,
    sourceToken: intent.sourceToken.id,
    sourceAmount: intent.sourceAmount,
    destToken: intent.destToken.id,
    minDestAmount: intent.minDestAmount,
    maxSolverFee: intent.maxSolverFee ?? "0",
    expiry: Number(intent.expiry),
    status: STATUS_TO_NUMBER[intent.status] ?? 0,
    solver: intent.solver?.id ?? ZERO_ADDRESS,
    fulfilledAmount: intent.fulfilledAmount ?? "0",
    sourceChainId: Number(intent.sourceChainId ?? defaultChainId(intent.sourceToken.id)),
    destChainId: Number(intent.destChainId ?? defaultChainId(intent.destToken.id)),
  };
}

export async function fetchSubgraphIntents(options: {
  status?: "Open" | "Fulfilled" | "Cancelled";
  user?: string;
  limit?: number;
} = {}): Promise<IntentData[]> {
  const { status, user, limit = 50 } = options;
  const data = await request<{ intents: GraphIntent[] }>(
    `
    query RecentIntents($first: Int!, $status: IntentStatus, $user: String) {
      intents(first: $first, orderBy: createdAt, orderDirection: desc, where: { status: $status, user: $user }) {
        id
        user { id }
        sourceChainId
        sourceToken { id }
        sourceAmount
        destChainId
        destToken { id }
        minDestAmount
        maxSolverFee
        expiry
        status
        solver { id }
        fulfilledAmount
      }
    }
  `,
    { first: limit, status: status ?? null, user: user?.toLowerCase() ?? null }
  );
  return data.intents.map(toIntentData);
}

export async function fetchSubgraphQuotes(): Promise<Quote[]> {
  // Solver quotes are served by the middleware / API, not indexed by the subgraph.
  // This helper exists for API symmetry and always returns an empty array.
  return [];
}

export async function fetchSubgraphSolvers(): Promise<SolverRegistryEntry[]> {
  const data = await request<{ solvers: GraphSolver[] }>(
    `
    query SolverRegistry {
      solvers(orderBy: totalVolume, orderDirection: desc) {
        id
        solverId
        name
        feeBps
        supportedChains
        active
        totalFulfilled
        totalVolume
      }
    }
  `
  );
  return data.solvers.map((s) => ({
    id: s.id,
    solverId: Number(s.solverId),
    name: s.name,
    feeBps: Number(s.feeBps),
    supportedChains: s.supportedChains.map((c) => Number(c)),
    active: s.active,
    totalFulfilled: Number(s.totalFulfilled),
    totalVolume: s.totalVolume,
  }));
}

export async function fetchSubgraphStats(): Promise<DashboardStats> {
  const data = await request<{ dailyStats: GraphDailyStats[]; solvers: { id: string }[] }>(
    `
    query DashboardStats {
      dailyStats {
        totalIntents
        totalFulfilled
      }
      solvers(where: { active: true }) {
        id
      }
    }
  `
  );

  const total = data.dailyStats.reduce((sum, d) => sum + BigInt(d.totalIntents), 0n);
  const fulfilled = data.dailyStats.reduce((sum, d) => sum + BigInt(d.totalFulfilled), 0n);
  const successRate = total > 0n ? `${Number((fulfilled * 100n) / total)}%` : "0%";

  return {
    total: Number(total),
    fulfilled: Number(fulfilled),
    activeSolvers: data.solvers.length,
    successRate,
  };
}

export function useSubgraphDashboard(enabled = Boolean(SUBGRAPH_URL)) {
  const key = enabled ? ["subgraph-dashboard", SUBGRAPH_URL] : null;
  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      const [intents, stats, solvers] = await Promise.all([
        fetchSubgraphIntents({ limit: 100 }),
        fetchSubgraphStats(),
        fetchSubgraphSolvers(),
      ]);
      return { intents, stats, solvers };
    },
    {
      refreshInterval: 10000,
      revalidateOnFocus: true,
      shouldRetryOnError: true,
    }
  );

  return {
    intents: data?.intents ?? [],
    stats: data?.stats,
    solvers: data?.solvers ?? [],
    isLoading,
    error,
  };
}
