"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { SectionHeader, Badge, TokenSymbol, EmptyState, LoadingState } from "@/components/ui";
import { tokenSymbol, chainName, formatTokenAmount } from "@/lib/tokens";
import { EventLog } from "ethers";
import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Activity, Search, Wallet, TrendingUp } from "lucide-react";

interface Quote {
  intentId: string;
  solverAddress: string;
  outputAmount: string;
  feeBps: number;
  signature: string;
  createdAt: number;
}

interface IntentData {
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

export default function MarketPage() {
  const { isConnected, sdk } = useWallet();
  const [intents, setIntents] = useState<IntentData[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "filled" | "cross-chain">("all");
  const [search, setSearch] = useState("");

  const fetchIntents = useCallback(async () => {
    if (!sdk) return;
    try {
      const filterSubmitted = sdk.intentRegistry.filters.IntentSubmitted();
      const events = await sdk.intentRegistry.queryFilter(filterSubmitted, -2000);
      const ids = Array.from(
        new Set(
          events
            .filter((e): e is EventLog => e instanceof EventLog && e.args !== undefined)
            .map((e) => e.args.intentId as string)
        )
      );
      const details = await Promise.all(
        ids.map(async (id) => {
          try {
            const d = await sdk.getIntent(id);
            return {
              intentId: d.intentId,
              user: d.user,
              sourceToken: d.sourceToken,
              sourceAmount: d.sourceAmount.toString(),
              destToken: d.destToken,
              minDestAmount: d.minDestAmount.toString(),
              maxSolverFee: d.maxSolverFee.toString(),
              expiry: d.expiry,
              status: d.status,
              solver: d.solver,
              fulfilledAmount: d.fulfilledAmount.toString(),
              sourceChainId: d.sourceChainId,
              destChainId: d.destChainId,
            };
          } catch {
            return null;
          }
        })
      );
      const resolved = details.filter((d): d is IntentData => Boolean(d));
      setIntents(resolved);

      const quoteMap: Record<string, Quote[]> = {};
      await Promise.all(
        resolved.map(async (intent) => {
          try {
            const res = await fetch(`/api/quotes?intentId=${intent.intentId}`);
            const body = await res.json();
            quoteMap[intent.intentId] = body.quotes || [];
          } catch {
            quoteMap[intent.intentId] = [];
          }
        })
      );
      setQuotes(quoteMap);
    } catch (e) {
      console.error("Failed to fetch market", e);
    } finally {
      setLoading(false);
    }
  }, [sdk]);

  useEffect(() => {
    fetchIntents();
    const interval = setInterval(fetchIntents, 5000);
    return () => clearInterval(interval);
  }, [fetchIntents]);

  const filtered = useMemo(() => {
    return intents.filter((intent) => {
      if (filter === "open" && intent.status !== 0) return false;
      if (filter === "filled" && intent.status !== 1) return false;
      if (filter === "cross-chain" && intent.sourceChainId === intent.destChainId) return false;
      if (search) {
        const term = search.toLowerCase();
        return (
          intent.intentId.toLowerCase().includes(term) ||
          tokenSymbol(intent.sourceToken).toLowerCase().includes(term) ||
          tokenSymbol(intent.destToken).toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [intents, filter, search]);

  if (!isConnected) {
    return (
      <PageContainer>
        <SectionHeader title="Market" description="Browse open intents and solver competition." />
        <EmptyState
          icon=<Wallet className="w-6 h-6" />
          title="Connect your wallet"
          description="Connect to view live intents and solver quotes."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        eyebrow="Protocol"
        title="Intent Market"
        description="Open intents competing for the best solver quote."
        action={
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold btn-primary"
          >
            Create Intent <ArrowRight size={16} />
          </Link>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-3)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by intent ID or token..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl surface-subtle bg-transparent text-sm text-[var(--ink)] outline-none"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(["all", "open", "filled", "cross-chain"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
                filter === f
                  ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                  : "bg-[var(--bg-3)] text-[var(--ink-2)] border-[var(--border)] hover:border-[var(--border-2)]"
              }`}
            >
              {f === "cross-chain" ? "Cross-Chain" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading market..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon=<Activity className="w-6 h-6" />
          title="No intents match"
          description={filter === "all" ? "There are no intents yet. Create the first one." : "Try a different filter."}
          action={
            <Link href="/create" className="px-5 py-2.5 rounded-full text-sm font-semibold btn-primary">
              Create Intent
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((intent, i) => (
            <IntentCard
              key={intent.intentId}
              intent={intent}
              quotes={quotes[intent.intentId] || []}
              index={i}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function IntentCard({ intent, quotes, index }: { intent: IntentData; quotes: Quote[]; index: number }) {
  const best = quotes.reduce((max, q) => (BigInt(q.outputAmount) > BigInt(max.outputAmount) ? q : max), quotes[0]);
  const isCrossChain = intent.sourceChainId !== intent.destChainId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl p-5 surface hover:border-[var(--border-2)] transition-colors"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={intent.status === 1 ? "success" : intent.status === 2 ? "default" : "warning"}>
              {intent.status === 1 ? "Filled" : intent.status === 2 ? "Cancelled" : "Open"}
            </Badge>
            {isCrossChain && <Badge variant="info">Cross-Chain</Badge>}
          </div>
          <div className="font-mono text-[11px] text-[var(--ink-3)]">{intent.intentId.slice(0, 18)}...</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--ink-3)]">{chainName(intent.sourceChainId)} → {chainName(intent.destChainId)}</div>
          <div className="text-[11px] text-[var(--ink-4)]">{new Date(intent.expiry * 1000).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 p-3 rounded-xl bg-[var(--bg-3)]">
          <div className="text-xs text-[var(--ink-3)] mb-1">Send</div>
          <div className="text-lg font-semibold font-mono-nums">{formatTokenAmount(intent.sourceAmount, intent.sourceToken)}</div>
          <TokenSymbol symbol={tokenSymbol(intent.sourceToken)} className="mt-1" />
        </div>
        <ArrowRight className="w-5 h-5 text-[var(--ink-3)]" />
        <div className="flex-1 p-3 rounded-xl bg-[var(--bg-3)]">
          <div className="text-xs text-[var(--ink-3)] mb-1">Receive min</div>
          <div className="text-lg font-semibold font-mono-nums">{formatTokenAmount(intent.minDestAmount, intent.destToken)}</div>
          <TokenSymbol symbol={tokenSymbol(intent.destToken)} className="mt-1" />
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        {best ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[var(--ink-3)] mb-1">Best quote ({quotes.length} solver{quotes.length !== 1 ? "s" : ""})</div>
              <div className="text-emerald-600 font-semibold text-lg">
                {formatTokenAmount(best.outputAmount, intent.destToken)} {tokenSymbol(intent.destToken)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[var(--ink-3)]">Solver fee</div>
              <div className="text-sm font-medium">{(best.feeBps / 100).toFixed(2)}%</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-yellow-600 text-sm">
            <TrendingUp size={16} /> Awaiting solver quotes...
          </div>
        )}
      </div>
    </motion.div>
  );
}
