"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { StatCard, SectionHeader, Badge, TokenSymbol } from "@/components/ui";
import { formatTokenAmount, tokenSymbol, chainName } from "@/lib/tokens";
import { ethers, EventLog } from "ethers";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Plus, LayoutGrid, Activity, Wallet, AlertCircle } from "lucide-react";
import { CONTRACTS, INTENT_REGISTRY_ABI, RPC_URL } from "@/lib/contracts";

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

export default function DashboardPage() {
  const { isConnected, address } = useWallet();
  const [stats, setStats] = useState({ total: 0, fulfilled: 0, open: 0, myIntents: 0 });
  const [recent, setRecent] = useState<IntentData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
      const total = await registry.getTotalIntents().catch(() => BigInt(0));
      const fulfilled = await registry.totalIntentsFulfilled().catch(() => BigInt(0));

      const filter = registry.filters.IntentSubmitted();
      const events = await registry.queryFilter(filter, -2000);
      const ids = Array.from(
        new Set(
          events
            .filter((e): e is EventLog => e instanceof EventLog && e.args !== undefined)
            .map((e) => e.args.intentId as string)
        )
      );
      const all = await Promise.all(
        ids.map(async (id) => {
          try {
            const d = await registry.getIntent(id);
            return {
              intentId: d.intentId,
              user: d.user,
              sourceToken: d.sourceToken,
              sourceAmount: d.sourceAmount.toString(),
              destToken: d.destToken,
              minDestAmount: d.minDestAmount.toString(),
              maxSolverFee: d.maxSolverFee.toString(),
              expiry: Number(d.expiry),
              status: Number(d.status),
              solver: d.solver,
              fulfilledAmount: d.fulfilledAmount.toString(),
              sourceChainId: Number(d.sourceChainId),
              destChainId: Number(d.destChainId),
            };
          } catch {
            return null;
          }
        })
      );
      const resolved = all.filter((d): d is IntentData => Boolean(d));
      const open = resolved.filter((d) => d.status === 0).length;
      const myIntents = address ? resolved.filter((d) => d.user.toLowerCase() === address.toLowerCase()).length : 0;

      setStats({ total: Number(total), fulfilled: Number(fulfilled), open, myIntents });
      setRecent(resolved.slice(-5).reverse());
    } catch (e) {
      console.error("Dashboard fetch failed", e);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <PageContainer>
      <SectionHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Monitor the intent protocol and your activity on Apothem testnet."
        action={
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold btn-primary"
          >
            <Plus size={16} /> Create Intent
          </Link>
        }
      />

      {!isConnected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-2xl bg-[var(--warning)]/10 border border-[var(--warning)]/20 flex items-center gap-3 text-[var(--warning)]"
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">Connect your wallet to see your intents and create new ones.</span>
        </motion.div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Intents" value={stats.total.toLocaleString()} />
        <StatCard label="Fulfilled" value={stats.fulfilled.toLocaleString()} />
        <StatCard label="Open" value={stats.open.toLocaleString()} />
        <StatCard label="My Intents" value={isConnected ? stats.myIntents : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl surface p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-[var(--accent)]" />
              <span className="font-semibold text-[var(--ink)]">Recent Intents</span>
            </div>
            <Link href="/market" className="text-[13px] font-medium text-[var(--accent)] hover:underline flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>

          {loading ? (
            <div className="py-12 text-center text-[var(--ink-3)]">Loading recent intents...</div>
          ) : recent.length === 0 ? (
            <div className="py-12 text-center text-[var(--ink-3)]">No intents yet.</div>
          ) : (
            <div className="space-y-3">
              {recent.map((intent, i) => (
                <motion.div
                  key={intent.intentId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={intent.status} />
                    <div>
                      <div className="text-sm font-medium text-[var(--ink)]">
                        <TokenSymbol symbol={tokenSymbol(intent.sourceToken)} />
                        <span className="mx-2 text-[var(--ink-3)]">→</span>
                        <TokenSymbol symbol={tokenSymbol(intent.destToken)} />
                      </div>
                      <div className="text-[11px] text-[var(--ink-3)] mt-1">
                        {formatTokenAmount(intent.sourceAmount, intent.sourceToken)} → min {formatTokenAmount(intent.minDestAmount, intent.destToken)} ·{" "}
                        {chainName(intent.sourceChainId)} → {chainName(intent.destChainId)}
                      </div>
                    </div>
                  </div>
                  <Badge variant={intent.status === 1 ? "success" : intent.status === 2 ? "default" : "warning"}>
                    {intent.status === 1 ? "Filled" : intent.status === 2 ? "Cancelled" : "Open"}
                  </Badge>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl surface p-6">
            <div className="flex items-center gap-2 mb-4">
              <LayoutGrid size={18} className="text-[var(--accent)]" />
              <span className="font-semibold text-[var(--ink)]">Quick Actions</span>
            </div>
            <div className="space-y-2">
              <QuickAction href="/create" icon=<Plus size={16} /> label="Create Intent" />
              <QuickAction href="/market" icon=<Activity size={16} /> label="Browse Market" />
              <QuickAction href="/my-intents" icon=<Wallet size={16} /> label="My Intents" />
              <QuickAction href="/agent-demo" icon=<LayoutGrid size={16} /> label="AI Agent Demo" />
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function StatusDot({ status }: { status: number }) {
  const color = status === 1 ? "bg-[var(--success)]" : status === 2 ? "bg-[var(--ink-4)]" : "bg-[var(--accent-2)]";
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-3)] hover:bg-[var(--bg-2)] border border-[var(--border)] hover:border-[var(--border-2)] transition-colors text-[var(--ink)] text-sm font-medium"
    >
      <span className="flex items-center gap-2">{icon} {label}</span>
      <ArrowRight size={14} className="text-[var(--ink-3)]" />
    </Link>
  );
}
