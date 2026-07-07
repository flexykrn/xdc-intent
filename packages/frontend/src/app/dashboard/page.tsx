"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { StatCard, SectionHeader, Badge, TokenSymbol, LoadingState } from "@/components/ui";
import { formatTokenAmount, tokenSymbol, chainName, TOKENS, parseTokenAmount } from "@/lib/tokens";
import { useIntents, useStats } from "@/lib/hooks";
import { ethers } from "ethers";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import toast from "react-hot-toast";
import { SolverLeaderboard } from "@/components/SolverLeaderboard";
import { ArrowRight, Plus, LayoutGrid, Activity, Wallet, AlertCircle, Droplets, Trophy } from "lucide-react";

export default function DashboardPage() {
  const { isConnected, address, signer } = useWallet();
  const { intents, isLoading: intentsLoading } = useIntents();
  const { stats, isLoading: statsLoading } = useStats();
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [minting, setMinting] = useState<string | null>(null);

  const open = intents.filter((d) => d.status === 0).length;
  const myIntents = address ? intents.filter((d) => d.user.toLowerCase() === address.toLowerCase()).length : 0;
  const recent = intents.slice(-5).reverse();

  const fetchBalances = useCallback(async () => {
    if (!signer || !address) return;
    try {
      const provider = signer.provider;
      if (!provider) return;
      const newBalances: Record<string, string> = {};
      await Promise.all(
        TOKENS.filter((t) => t.address !== ethers.ZeroAddress).map(async (t) => {
          const token = new ethers.Contract(
            t.address,
            ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
            provider
          );
          const raw = await token.balanceOf(address);
          newBalances[t.address] = formatTokenAmount(raw.toString(), t.address);
        })
      );
      setBalances(newBalances);
    } catch (e) {
      console.error("Failed to fetch balances", e);
    }
  }, [signer, address]);

  const handleMint = async (tokenInfo: (typeof TOKENS)[0]) => {
    if (!signer || !address) return;
    setMinting(tokenInfo.address);
    const toastId = toast.loading(`Minting ${tokenInfo.symbol}...`);
    try {
      const token = new ethers.Contract(tokenInfo.address, ["function mint(address,uint256)"], signer);
      const amount = parseTokenAmount("1000", tokenInfo.address);
      const tx = await token.mint(address, amount);
      await tx.wait();
      toast.success(`Minted 1000 ${tokenInfo.symbol}`, { id: toastId });
      await fetchBalances();
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Mint failed");
      toast.error(err.message || "Mint failed", { id: toastId });
    } finally {
      setMinting(null);
    }
  };

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  const loading = intentsLoading || statsLoading;

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
        <StatCard label="Total Intents" value={stats?.total.toLocaleString() ?? (loading ? "—" : "0")} />
        <StatCard label="Fulfilled" value={stats?.fulfilled.toLocaleString() ?? (loading ? "—" : "0")} />
        <StatCard label="Open" value={loading ? "—" : open} />
        <StatCard label="My Intents" value={isConnected ? myIntents : "—"} />
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
            <LoadingState message="Loading recent intents..." />
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
                        {formatTokenAmount(intent.sourceAmount, intent.sourceToken)} → min{" "}
                        {formatTokenAmount(intent.minDestAmount, intent.destToken)} · {chainName(intent.sourceChainId)} →{" "}
                        {chainName(intent.destChainId)}
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
              <QuickAction href="/create" icon={<Plus size={16} />} label="Create Intent" />
              <QuickAction href="/market" icon={<Activity size={16} />} label="Browse Market" />
              <QuickAction href="/my-intents" icon={<Wallet size={16} />} label="My Intents" />
              <QuickAction href="/solvers" icon={<Trophy size={16} />} label="Solver Leaderboard" />
              <QuickAction href="/agent-demo" icon={<LayoutGrid size={16} />} label="AI Agent Demo" />
            </div>
          </div>

          <div className="rounded-2xl surface p-6">
            <div className="flex items-center gap-2 mb-4">
              <Droplets size={18} className="text-[var(--accent)]" />
              <span className="font-semibold text-[var(--ink)]">Testnet Faucet</span>
            </div>
            <p className="text-xs text-[var(--ink-3)] mb-4">Mint free MUSDC and MXDC to try the protocol.</p>
            <div className="space-y-3">
              {TOKENS.filter((t) => t.address !== ethers.ZeroAddress).map((t) => (
                <div
                  key={t.address}
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)]"
                >
                  <div>
                    <div className="text-sm font-medium text-[var(--ink)]">{t.symbol}</div>
                    <div className="text-[11px] text-[var(--ink-3)]">Balance: {balances[t.address] ?? "—"}</div>
                  </div>
                  <button
                    onClick={() => handleMint(t)}
                    disabled={!isConnected || minting === t.address}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold btn-primary disabled:opacity-50"
                  >
                    {minting === t.address ? "Minting..." : "Mint 1000"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <SectionHeader
          eyebrow="Solvers"
          title="Solver Leaderboard"
          description="Registered solvers competing to fulfill intents."
          action={
            <Link
              href="/solvers"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:underline"
            >
              View all <ArrowRight size={14} />
            </Link>
          }
        />
        <SolverLeaderboard />
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
      <span className="flex items-center gap-2">
        {icon} {label}
      </span>
      <ArrowRight size={14} className="text-[var(--ink-3)]" />
    </Link>
  );
}
