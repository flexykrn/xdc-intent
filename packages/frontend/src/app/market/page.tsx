"use client";

import { useWallet } from "@/components/providers";
import { ethers, EventLog } from "ethers";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2, ArrowRight, Wallet, Activity } from "lucide-react";
import Link from "next/link";

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
  paymentTxHash: string;
  signature: string;
  sourceChainId: number;
  destChainId: number;
  nonce: string;
}

const tokenMap: Record<string, { symbol: string; decimals: number }> = {
  "0xa3f37BBd132C6DA9088B4A63622CacbCBee394A4": { symbol: "MUSDC", decimals: 18 },
  "0x6DC37E3ca98E49e923E953c5A7229726513eaf6E": { symbol: "MXDC", decimals: 18 },
  "0x0000000000000000000000000000000000000000": { symbol: "XDC", decimals: 18 },
};

function formatAmount(amount: string, token: string): string {
  const meta = tokenMap[token.toLowerCase()] || { symbol: token.slice(0, 6), decimals: 18 };
  try {
    return `${Number(ethers.formatUnits(amount, meta.decimals)).toFixed(4)} ${meta.symbol}`;
  } catch {
    return `${amount} ${meta.symbol}`;
  }
}

export default function MarketPage() {
  const { isConnected, sdk } = useWallet();
  const [intents, setIntents] = useState<IntentData[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchIntents = useCallback(async () => {
    if (!sdk) return;
    try {
      const filter = sdk.intentRegistry.filters.IntentSubmitted();
      const events = await sdk.intentRegistry.queryFilter(filter, -2000);
      const ids = Array.from(new Set(
        events
          .filter((e): e is EventLog => e instanceof EventLog && e.args !== undefined)
          .map((e) => e.args.intentId as string)
      ));
      const details = await Promise.all(
        ids.map(async (id) => {
          try {
            return await sdk.getIntent(id);
          } catch {
            return null;
          }
        })
      );
      const open: IntentData[] = details
        .filter((d): d is NonNullable<typeof d> => d !== null && d.status === 0)
        .map((d) => ({
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
          paymentTxHash: d.paymentTxHash,
          signature: d.signature,
          sourceChainId: d.sourceChainId,
          destChainId: d.destChainId,
          nonce: d.nonce.toString(),
        }));
      setIntents(open);

      const quoteMap: Record<string, Quote[]> = {};
      await Promise.all(
        open.map(async (intent) => {
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

  if (!isConnected) {
    return (
      <div className="relative z-10 min-h-screen pt-32 pb-20 px-5 sm:px-8 lg:px-10">
        <div className="max-w-2xl mx-auto text-center">
          <Wallet className="w-12 h-12 text-[var(--accent)] mx-auto mb-6" />
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-[var(--ink)] mb-4">Intent Market</h1>
          <p className="text-lg text-[var(--ink-2)]">Connect your wallet to view open intents and solver quotes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen pt-32 pb-20 px-5 sm:px-8 lg:px-10">
      <div className="max-w-[1200px] mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-2">Protocol</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-[var(--ink)] mb-2">Intent Market</h1>
          <p className="text-[var(--ink-2)]">Open intents competing for the best solver quote.</p>
        </motion.div>

        {loading && intents.length === 0 && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          </div>
        )}

        {!loading && intents.length === 0 && (
          <div className="rounded-3xl p-12 text-center surface">
            <p className="text-[var(--ink)] text-lg mb-2">No open intents</p>
            <p className="text-[var(--ink-3)] mb-6">Create an intent to see solver competition in action.</p>
            <Link href="/create" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold btn-primary">
              Create Intent <ArrowRight size={16} />
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {intents.map((intent) => {
            const intentQuotes = quotes[intent.intentId] || [];
            const best = intentQuotes.reduce((max, q) => (BigInt(q.outputAmount) > BigInt(max.outputAmount) ? q : max), intentQuotes[0]);
            return (
              <motion.div
                key={intent.intentId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-6 surface"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-[var(--accent)]" />
                      <span className="font-mono text-xs text-[var(--accent)]">{intent.intentId.slice(0, 18)}...</span>
                    </div>
                    <div className="text-lg font-semibold text-[var(--ink)]">
                      {formatAmount(intent.sourceAmount, intent.sourceToken)} → {formatAmount(intent.minDestAmount, intent.destToken)} min
                    </div>
                    <div className="text-sm text-[var(--ink-2)] mt-1">Max solver fee: {formatAmount(intent.maxSolverFee, intent.destToken)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--ink-3)] mb-1">Best quote</div>
                    {best ? (
                      <div className="text-emerald-600 font-semibold">{formatAmount(best.outputAmount, intent.destToken)}</div>
                    ) : (
                      <div className="text-yellow-600 text-sm">Awaiting quotes...</div>
                    )}
                    <div className="text-xs text-[var(--ink-3)] mt-1">{intentQuotes.length} solver quote{intentQuotes.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                {intentQuotes.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="text-xs text-[var(--ink-3)] mb-2">Solver quotes</div>
                    <div className="space-y-2">
                      {intentQuotes.map((q) => (
                        <div key={q.signature} className="flex items-center justify-between text-sm">
                          <span className="font-mono text-[var(--ink-2)]">{q.solverAddress.slice(0, 12)}...</span>
                          <span className={q.solverAddress.toLowerCase() === best?.solverAddress.toLowerCase() ? "text-emerald-600 font-medium" : "text-[var(--ink)]"}>
                            {formatAmount(q.outputAmount, intent.destToken)} ({q.feeBps / 100}% fee)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
