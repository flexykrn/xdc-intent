"use client";

import { useCallback, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { ethers } from "ethers";
import { Activity, AlertCircle, Loader2, RefreshCw, Server, Wallet, Award, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import PageContainer from "@/components/PageContainer";
import { SectionHeader, Badge, LoadingState } from "@/components/ui";
import { SolverHealthCard, HealthSummary } from "@/components/SolverHealthCard";
import { CONTRACTS, SOLVER_REGISTRY_ABI, INTENT_REGISTRY_ABI, ERC20_ABI, provider } from "@/lib/contracts";
import { formatTokenAmount, tokenSymbol, chainName } from "@/lib/tokens";
import { truncateAddress } from "@/lib/utils";

const SERVICES = [
  { key: "middleware", title: "Middleware", url: "http://localhost:3002/health" },
  { key: "solverA", title: "Solver-A", url: "http://localhost:3001/health" },
  { key: "solverB", title: "Solver-B", url: "http://localhost:3003/health" },
];

const SOLVERS = [
  { key: "solverA", name: "Solver-A", address: "0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe" },
  { key: "solverB", name: "Solver-B", address: "0xd83A98ad44896E841C16Be58b663f70a827c93Ff" },
];

const MOCK_USDC = "0x86530A99784D188e8343e119140114d9e5fD0546";
const REPUTATION_WINDOW = 50;
const HEALTH_TIMEOUT_MS = 5000;

interface HealthData {
  status: "up" | "down" | "unknown";
  lastSeen: string | null;
  responseTime: number | null;
  error: string | null;
}

interface SolverRegistryInfo {
  id: number;
  address: string;
  name: string;
  feeBps: number;
  active: boolean;
  registeredAt: number;
  supportedChains: number[];
}

interface SolverBalance {
  xdc: string;
  mockUsdc: string;
}

interface SolverReputation {
  address: string;
  totalInWindow: number;
  solverCount: number;
  score: number;
  recentFulfilled: number;
}

async function fetchHealth(url: string): Promise<HealthData> {
  const start = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    const responseTime = Math.round(performance.now() - start);

    if (!res.ok) {
      return {
        status: "down",
        lastSeen: new Date().toLocaleTimeString(),
        responseTime,
        error: `HTTP ${res.status}`,
      };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    const ts = body && typeof body === "object" && "timestamp" in body && typeof body.timestamp === "string"
      ? new Date(body.timestamp).toLocaleTimeString()
      : new Date().toLocaleTimeString();

    return {
      status: "up",
      lastSeen: ts,
      responseTime,
      error: null,
    };
  } catch (e) {
    const responseTime = Math.round(performance.now() - start);
    const message = e instanceof Error ? e.message : "Unreachable";
    return {
      status: "down",
      lastSeen: new Date().toLocaleTimeString(),
      responseTime,
      error: message.includes("abort") ? "Request timed out" : message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function useServiceHealth(url: string) {
  return useSWR(
    ["solver-admin", "health", url],
    () => fetchHealth(url),
    {
      refreshInterval: 10000,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  );
}

async function fetchRegistryInfo(solverAddresses: string[]): Promise<SolverRegistryInfo[]> {
  const registry = new ethers.Contract(CONTRACTS.solverRegistry, SOLVER_REGISTRY_ABI, provider);
  const count = Number(await registry.getSolverCount());
  const results: SolverRegistryInfo[] = [];

  for (let i = 1; i <= count; i++) {
    try {
      const s = await registry.getSolver(i);
      const addr = s.solverAddress.toLowerCase();
      if (solverAddresses.some((a) => a.toLowerCase() === addr)) {
        results.push({
          id: i,
          address: s.solverAddress,
          name: s.name,
          feeBps: Number(s.feeBps),
          active: s.active,
          registeredAt: Number(s.registeredAt) * 1000,
          supportedChains: s.supportedChains.map((c: bigint) => Number(c)),
        });
      }
    } catch {
      // skip stale entries
    }
  }

  return results;
}

function useSolverRegistryInfo() {
  const addresses = useMemo(() => SOLVERS.map((s) => s.address), []);
  return useSWR(
    ["solver-admin", "registry", ...addresses],
    () => fetchRegistryInfo(addresses),
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    }
  );
}

async function fetchBalances(solverAddresses: string[]): Promise<Record<string, SolverBalance>> {
  const usdc = new ethers.Contract(MOCK_USDC, ERC20_ABI, provider);
  const entries = await Promise.all(
    solverAddresses.map(async (address) => {
      try {
        const [xdcRaw, usdcRaw] = await Promise.all([
          provider.getBalance(address),
          usdc.balanceOf(address).catch(() => 0n),
        ]);
        return [
          address,
          {
            xdc: formatTokenAmount(xdcRaw.toString(), ethers.ZeroAddress),
            mockUsdc: formatTokenAmount(usdcRaw.toString(), MOCK_USDC),
          },
        ] as const;
      } catch {
        return [
          address,
          { xdc: "—", mockUsdc: "—" },
        ] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

function useSolverBalances() {
  const addresses = useMemo(() => SOLVERS.map((s) => s.address), []);
  return useSWR(
    ["solver-admin", "balances", ...addresses],
    () => fetchBalances(addresses),
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    }
  );
}

async function fetchReputations(
  solverAddresses: string[],
  windowSize: number
): Promise<Record<string, SolverReputation>> {
  const intentRegistry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
  const latest = await provider.getBlockNumber();
  const chunkSize = 10000;
  const collected: { solver: string; blockNumber: number }[] = [];

  let fromBlock = Math.max(0, latest - chunkSize + 1);
  let toBlock = latest;

  while (toBlock >= 0 && collected.length < windowSize) {
    try {
      const filter = intentRegistry.filters.IntentFulfilled();
      const events = await intentRegistry.queryFilter(filter, fromBlock, toBlock);
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i] as ethers.EventLog;
        const solver = (event.args?.solver as string | undefined) ?? "";
        if (solver) {
          collected.unshift({ solver: solver.toLowerCase(), blockNumber: event.blockNumber });
          if (collected.length >= windowSize) break;
        }
      }
      if (fromBlock === 0) break;
      toBlock = fromBlock - 1;
      fromBlock = Math.max(0, toBlock - chunkSize + 1);
    } catch {
      break;
    }
  }

  const windowEvents = collected.slice(-windowSize);
  const totalInWindow = windowEvents.length;

  return Object.fromEntries(
    solverAddresses.map((address) => {
      const normalized = address.toLowerCase();
      const solverCount = windowEvents.filter((e) => e.solver === normalized).length;
      return [
        address,
        {
          address,
          totalInWindow,
          solverCount,
          score: totalInWindow > 0 ? solverCount / totalInWindow : 0,
          recentFulfilled: solverCount,
        },
      ];
    })
  );
}

function useSolverReputations(windowSize: number) {
  const addresses = useMemo(() => SOLVERS.map((s) => s.address), []);
  return useSWR(
    ["solver-admin", "reputation", windowSize, ...addresses],
    () => fetchReputations(addresses, windowSize),
    {
      refreshInterval: 60000,
      revalidateOnFocus: false,
    }
  );
}

export default function SolverAdminPage() {
  const middlewareHealth = useServiceHealth(SERVICES[0].url);
  const solverAHealth = useServiceHealth(SERVICES[1].url);
  const solverBHealth = useServiceHealth(SERVICES[2].url);
  const { data: registryInfo, error: registryError, isLoading: registryLoading } = useSolverRegistryInfo();
  const { data: balances, error: balancesError, isLoading: balancesLoading } = useSolverBalances();
  const { data: reputations, error: reputationError, isLoading: reputationLoading } = useSolverReputations(REPUTATION_WINDOW);

  const healthMap = useMemo(
    () => ({
      middleware: middlewareHealth.data ?? { status: "unknown", lastSeen: null, responseTime: null, error: null },
      solverA: solverAHealth.data ?? { status: "unknown", lastSeen: null, responseTime: null, error: null },
      solverB: solverBHealth.data ?? { status: "unknown", lastSeen: null, responseTime: null, error: null },
    }),
    [middlewareHealth.data, solverAHealth.data, solverBHealth.data]
  );

  const healthEntries = useMemo(
    () =>
      SERVICES.map((s) => ({
        ...s,
        health: healthMap[s.key as keyof typeof healthMap],
        loading:
          s.key === "middleware"
            ? middlewareHealth.isLoading
            : s.key === "solverA"
              ? solverAHealth.isLoading
              : solverBHealth.isLoading,
      })),
    [healthMap, middlewareHealth.isLoading, solverAHealth.isLoading, solverBHealth.isLoading]
  );

  const healthyCount = healthEntries.filter((h) => h.health.status === "up").length;

  const registryByAddress = useMemo(() => {
    const map = new Map<string, SolverRegistryInfo>();
    registryInfo?.forEach((info) => map.set(info.address.toLowerCase(), info));
    return map;
  }, [registryInfo]);

  const anyLoading =
    middlewareHealth.isLoading ||
    solverAHealth.isLoading ||
    solverBHealth.isLoading ||
    registryLoading ||
    balancesLoading ||
    reputationLoading;

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      mutate(["solver-admin", "health", SERVICES[0].url]),
      mutate(["solver-admin", "health", SERVICES[1].url]),
      mutate(["solver-admin", "health", SERVICES[2].url]),
      mutate(["solver-admin", "registry", ...SOLVERS.map((s) => s.address)]),
      mutate(["solver-admin", "balances", ...SOLVERS.map((s) => s.address)]),
      mutate(["solver-admin", "reputation", REPUTATION_WINDOW, ...SOLVERS.map((s) => s.address)]),
    ]);
  }, []);

  return (
    <PageContainer>
      <SectionHeader
        eyebrow="Operations"
        title="Solver Admin"
        description="Monitor solver health, registry state, balances, and on-chain reputation."
        action={
          <motion.button
            onClick={handleRefresh}
            disabled={anyLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold btn-primary disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {anyLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </motion.button>
        }
      />

      <div className="mb-8">
        <HealthSummary up={healthyCount} total={SERVICES.length} />
      </div>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-[var(--accent)]" />
          <span className="font-semibold text-[var(--ink)]">Service Health</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {healthEntries.map((entry) => (
            <SolverHealthCard
              key={entry.key}
              title={entry.title}
              url={entry.url}
              status={entry.health.status}
              lastSeen={entry.health.lastSeen}
              responseTime={entry.health.responseTime}
              error={entry.health.error}
              loading={entry.loading}
            />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Server size={18} className="text-[var(--accent)]" />
          <span className="font-semibold text-[var(--ink)]">Solver Registry & Reputation</span>
        </div>

        {registryLoading || reputationLoading ? (
          <LoadingState message="Loading solver registry data..." />
        ) : registryError || reputationError ? (
          <div className="rounded-2xl p-6 surface flex items-start gap-3 text-[var(--error)]">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="text-sm">
              {registryError?.message || reputationError?.message || "Failed to load registry or reputation data."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {SOLVERS.map((solver, index) => {
              const info = registryByAddress.get(solver.address.toLowerCase());
              const rep = reputations?.[solver.address];
              const health = healthMap[solver.key as keyof typeof healthMap];

              return (
                <motion.div
                  key={solver.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-2xl surface p-5"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
                        <Award size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[var(--ink)]">{solver.name}</div>
                        <div className="text-[11px] font-mono text-[var(--ink-3)]">{truncateAddress(solver.address, 4, 4)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={info?.active ? "success" : "default"}>{info?.active ? "Active" : "Inactive"}</Badge>
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          health.status === "up"
                            ? "bg-[var(--success)]"
                            : health.status === "down"
                              ? "bg-[var(--error)]"
                              : "bg-[var(--ink-4)]"
                        }`}
                        title={`Service ${health.status}`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)]">
                      <div className="text-[11px] text-[var(--ink-3)] mb-1">Registry Name</div>
                      <div className="text-sm font-medium text-[var(--ink)]">{info?.name ?? "Not registered"}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)]">
                      <div className="text-[11px] text-[var(--ink-3)] mb-1">Fee</div>
                      <div className="text-sm font-medium text-[var(--ink)]">{info ? `${(info.feeBps / 100).toFixed(2)}%` : "—"}</div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-[11px] text-[var(--ink-3)] mb-2">Supported Chains</div>
                    <div className="flex flex-wrap gap-2">
                      {info?.supportedChains.length ? (
                        info.supportedChains.map((chainId) => (
                          <Badge key={chainId} variant="info">{chainName(chainId)}</Badge>
                        ))
                      ) : (
                        <span className="text-[12px] text-[var(--ink-3)]">None configured</span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--bg-3)] border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={14} className="text-[var(--accent)]" />
                      <span className="text-[12px] font-semibold text-[var(--ink)]">Reputation (last {REPUTATION_WINDOW} fills)</span>
                    </div>
                    {rep ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] text-[var(--ink-3)]">Score</span>
                          <span className="text-lg font-semibold font-mono-nums text-[var(--ink)]">{(rep.score * 100).toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[var(--border)] overflow-hidden mb-2">
                          <div
                            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                            style={{ width: `${rep.score * 100}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[var(--ink-3)]">
                          <span>{rep.recentFulfilled} fills</span>
                          <span>{rep.totalInWindow} sampled</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-[12px] text-[var(--ink-3)]">No fulfillment data available.</div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={18} className="text-[var(--accent)]" />
          <span className="font-semibold text-[var(--ink)]">Solver Balances</span>
        </div>

        {balancesLoading ? (
          <LoadingState message="Loading solver balances..." />
        ) : balancesError ? (
          <div className="rounded-2xl p-6 surface flex items-start gap-3 text-[var(--error)]">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="text-sm">{balancesError.message || "Failed to load balances."}</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SOLVERS.map((solver) => {
              const bal = balances?.[solver.address];
              return (
                <div key={solver.key} className="rounded-2xl surface p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-[var(--ink)]">{solver.name}</div>
                    <div className="text-[11px] font-mono text-[var(--ink-3)]">{truncateAddress(solver.address, 4, 4)}</div>
                  </div>
                  <div className="space-y-3">
                    <BalanceRow symbol="XDC" balance={bal?.xdc ?? "—"} />
                    <BalanceRow symbol={tokenSymbol(MOCK_USDC)} balance={bal?.mockUsdc ?? "—"} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function BalanceRow({ symbol, balance }: { symbol: string; balance: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)]">
      <div className="flex items-center gap-2">
        <TokenDot symbol={symbol} />
        <span className="text-sm font-medium text-[var(--ink)]">{symbol}</span>
      </div>
      <span className="text-sm font-semibold font-mono-nums text-[var(--ink)]">{balance}</span>
    </div>
  );
}

function TokenDot({ symbol }: { symbol: string }) {
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  const color = colors[symbol.charCodeAt(0) % colors.length];
  return <span className={`w-6 h-6 rounded-full ${color} flex items-center justify-center text-white text-[10px] font-bold`}>{symbol.slice(0, 2)}</span>;
}
