"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { SectionHeader, Badge, TokenSymbol, EmptyState, LoadingState } from "@/components/ui";
import { tokenSymbol, chainName, formatTokenAmount } from "@/lib/tokens";
import { useIntents, useQuotes, type Quote } from "@/lib/hooks";
import { truncateAddress } from "@/lib/utils";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Activity,
  Search,
  Wallet,
  TrendingUp,
  Trophy,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";

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
  const { isConnected } = useWallet();
  const { intents, isLoading } = useIntents();
  const [filter, setFilter] = useState<"all" | "open" | "filled" | "cross-chain">("open");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return intents.filter((intent) => {
      if (filter === "open" && intent.status !== 0) return false;
      if (filter === "filled" && intent.status !== 1) return false;
      if (filter === "cross-chain" && intent.sourceChainId === intent.destChainId) return false;
      if (search) {
        const term = search.toLowerCase();
        return (
          intent.intentId.toLowerCase().includes(term) ||
          tokenSymbol(intent.sourceToken, intent.sourceChainId).toLowerCase().includes(term) ||
          tokenSymbol(intent.destToken, intent.destChainId).toLowerCase().includes(term)
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
          icon={<Wallet className="w-6 h-6" />}
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
        description="Live open intents and the competing solver quotes. The highest output is winning."
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

      {isLoading ? (
        <LoadingState message="Loading market..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-6 h-6" />}
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
            <IntentCard key={intent.intentId} intent={intent} index={i} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function timeLeft(expiry: number) {
  const diff = expiry * 1000 - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.ceil(mins / 60);
  if (hrs < 24) return `${hrs}h left`;
  return `${Math.ceil(hrs / 24)}d left`;
}

function IntentCard({ intent, index }: { intent: IntentData; index: number }) {
  const { quotes, isLoading: quotesLoading } = useQuotes(intent.intentId);
  const sorted = useMemo(() => {
    return [...quotes].sort((a, b) => (BigInt(b.outputAmount) > BigInt(a.outputAmount) ? 1 : -1));
  }, [quotes]);
  const best = sorted[0] || null;
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
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant={intent.status === 1 ? "success" : intent.status === 2 ? "default" : "warning"}>
              {intent.status === 1 ? "Filled" : intent.status === 2 ? "Cancelled" : "Open"}
            </Badge>
            {isCrossChain && <Badge variant="info">Cross-Chain</Badge>}
            {intent.status === 0 && best && (
              <Badge variant="success" className="gap-1">
                <Trophy size={10} /> Winning
              </Badge>
            )}
          </div>
          <div className="font-mono text-[11px] text-[var(--ink-3)]">{intent.intentId.slice(0, 18)}...</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--ink-3)]">
            {chainName(intent.sourceChainId)} → {chainName(intent.destChainId)}
          </div>
          <div className="text-[11px] text-[var(--ink-4)] flex items-center justify-end gap-1 mt-0.5">
            <Clock size={10} /> {timeLeft(intent.expiry)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 p-3 rounded-xl bg-[var(--bg-3)]">
          <div className="text-xs text-[var(--ink-3)] mb-1">Send</div>
          <div className="text-lg font-semibold font-mono-nums">{formatTokenAmount(intent.sourceAmount, intent.sourceToken, intent.sourceChainId)}</div>
          <TokenSymbol symbol={tokenSymbol(intent.sourceToken, intent.sourceChainId)} className="mt-1" />
        </div>
        <ArrowRight className="w-5 h-5 text-[var(--ink-3)]" />
        <div className="flex-1 p-3 rounded-xl bg-[var(--bg-3)]">
          <div className="text-xs text-[var(--ink-3)] mb-1">Receive min</div>
          <div className="text-lg font-semibold font-mono-nums">{formatTokenAmount(intent.minDestAmount, intent.destToken, intent.destChainId)}</div>
          <TokenSymbol symbol={tokenSymbol(intent.destToken, intent.destChainId)} className="mt-1" />
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        {intent.status === 1 ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[var(--ink-3)] mb-1">Filled by {truncateAddress(intent.solver, 4, 4)}</div>
              <div className="text-emerald-600 font-semibold text-lg">
                {formatTokenAmount(intent.fulfilledAmount, intent.destToken, intent.destChainId)} {tokenSymbol(intent.destToken, intent.destChainId)}
              </div>
            </div>
            <Badge variant="success">Filled</Badge>
          </div>
        ) : intent.status === 2 ? (
          <div className="flex items-center gap-2 text-[var(--ink-3)] text-sm">
            <XCircle size={16} /> Cancelled
          </div>
        ) : quotesLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--ink-3)]">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading solver quotes...
          </div>
        ) : sorted.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
              <span>Competing quotes ({sorted.length})</span>
              <span>Highest output wins</span>
            </div>
            {sorted.map((q, idx) => (
              <QuoteRow key={`${q.solverAddress}-${idx}`} quote={q} intent={intent} rank={idx} />
            ))}
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

function QuoteRow({ quote, intent, rank }: { quote: Quote; intent: IntentData; rank: number }) {
  const isWinner = rank === 0;
  return (
    <div
      className={`flex items-center justify-between p-2.5 rounded-xl border ${
        isWinner ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[var(--bg-3)] border-[var(--border)]"
      }`}
    >
      <div className="flex items-center gap-2">
        {isWinner && <Trophy size={12} className="text-emerald-600" />}
        <span className="text-xs font-medium text-[var(--ink)]">{truncateAddress(quote.solverAddress, 3, 3)}</span>
        <span className="text-[10px] text-[var(--ink-3)]">{(quote.feeBps / 100).toFixed(2)}% fee</span>
      </div>
      <div className={`text-sm font-semibold font-mono-nums ${isWinner ? "text-emerald-600" : "text-[var(--ink)]"}`}>
        {formatTokenAmount(quote.outputAmount, intent.destToken, intent.destChainId)} {tokenSymbol(intent.destToken, intent.destChainId)}
      </div>
    </div>
  );
}
