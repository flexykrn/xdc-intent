"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/providers";
import { CONTRACTS, INTENT_REGISTRY_ABI, RPC_URL } from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";
import { Clock, CheckCircle, XCircle, Loader2, AlertTriangle, ArrowRight, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

interface IntentItem {
  id: string;
  intent: any;
}

export default function MyIntentsPage() {
  const { address, isConnected, signer } = useWallet();
  const [intents, setIntents] = useState<IntentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function fetchIntents() {
    if (!address) return;
    try {
      setError(null);
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
      const intentIds = await registry.getUserIntents(address);
      const details = await Promise.all(
        intentIds.map(async (id: string) => {
          try {
            const intent = await registry.getIntent(id);
            return { id, intent };
          } catch {
            return null;
          }
        })
      );
      setIntents(details.filter((d): d is IntentItem => Boolean(d)));
    } catch (e: any) {
      console.error("Failed to fetch intents", e);
      setError(e.message || "Failed to fetch your intents");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: string) {
    if (!signer) return;
    setCancelling(id);
    try {
      const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, signer);
      const tx = await registry.cancelIntent(id);
      toast.loading("Cancelling intent...", { id: "cancel" });
      await tx.wait();
      toast.success("Intent cancelled", { id: "cancel" });
      fetchIntents();
    } catch (e: any) {
      toast.error(e?.reason || e?.message || "Failed to cancel", { id: "cancel" });
    } finally {
      setCancelling(null);
    }
  }

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    fetchIntents();
    const interval = setInterval(fetchIntents, 30000);
    return () => clearInterval(interval);
  }, [address]);

  if (!isConnected) {
    return (
      <div className="relative z-10 min-h-screen pt-32 pb-20 px-5 sm:px-8 lg:px-10">
        <div className="max-w-2xl mx-auto text-center">
          <Wallet className="w-12 h-12 text-[var(--accent)] mx-auto mb-6" />
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-[var(--ink)] mb-4">My Intents</h1>
          <p className="text-lg text-[var(--ink-2)] mb-8">Connect your wallet to view your active and historical intents.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen pt-32 pb-20 px-5 sm:px-8 lg:px-10">
      <div className="max-w-[1200px] mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-4">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-2">Account</div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-[var(--ink)] mb-2">My Intents</h1>
            <p className="text-[var(--ink-2)]">Track and manage your swap intents.</p>
          </div>
          <Link href="/create" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold btn-primary">
            New Intent <ArrowRight size={16} />
          </Link>
        </motion.div>

        {error && (
          <div className="rounded-2xl p-4 mb-6 bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="font-medium text-red-600">Error loading intents</p>
                <p className="text-sm text-red-600/70">{error}</p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          </div>
        )}

        {!loading && intents.length === 0 && !error && (
          <div className="rounded-3xl p-12 text-center surface">
            <p className="text-[var(--ink)] text-lg mb-2">No intents found</p>
            <p className="text-[var(--ink-3)] mb-6">Create your first intent to start trading.</p>
            <Link href="/create" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold btn-primary">
              Create Intent <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {!loading && intents.length > 0 && (
          <div className="space-y-4">
            {intents.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl p-6 surface"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <StatusBadge status={Number(item.intent[7])} />
                    <div>
                      <div className="font-mono text-xs text-[var(--ink-3)] mb-1">{item.id.slice(0, 18)}...</div>
                      <div className="text-lg font-semibold text-[var(--ink)]">{ethers.formatEther(item.intent[4])} XDC</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 sm:gap-10">
                    <div>
                      <div className="text-xs text-[var(--ink-3)] mb-1">Token</div>
                      <div className="font-mono text-sm text-[var(--ink)]">{item.intent[3].slice(0, 10)}...</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--ink-3)] mb-1">Expiry</div>
                      <div className="font-mono text-sm text-[var(--ink)]">{new Date(Number(item.intent[6]) * 1000).toLocaleDateString()}</div>
                    </div>
                    {Number(item.intent[7]) === 0 && (
                      <button
                        onClick={() => handleCancel(item.id)}
                        disabled={cancelling === item.id}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-red-500 border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {cancelling === item.id ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  switch (status) {
    case 0:
      return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 text-yellow-600 rounded-full text-xs font-medium border border-yellow-500/20"><Clock className="w-3 h-3" />Pending</span>;
    case 1:
      return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-full text-xs font-medium border border-emerald-500/20"><CheckCircle className="w-3 h-3" />Filled</span>;
    case 2:
      return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-500/10 text-gray-500 rounded-full text-xs font-medium border border-gray-500/20">Cancelled</span>;
    case 3:
      return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-500 rounded-full text-xs font-medium border border-red-500/20"><XCircle className="w-3 h-3" />Expired</span>;
    default:
      return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-500/10 text-gray-500 rounded-full text-xs font-medium border border-gray-500/20">Unknown</span>;
  }
}
