"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Shield,
  Globe,
  Clock,
  TrendingUp,
  Lock,
  Layers,
  Activity,
} from "lucide-react";
import { useWallet } from "@/components/providers";
import { ethers } from "ethers";
import { CONTRACTS, INTENT_REGISTRY_ABI, RPC_URL } from "@/lib/contracts";
import IntentFlowVisual from "@/components/IntentFlowVisual";

const recentIntents = [
  { id: "0x8f3a...2d91", pair: "XDC → USDC", amount: "12,450", status: "filled", time: "2s" },
  { id: "0x2c71...9e44", pair: "MOCK → XDC", amount: "88,200", status: "open", time: "14s" },
  { id: "0x9b12...7c33", pair: "USDC → MOCK", amount: "3,100", status: "filled", time: "45s" },
  { id: "0x4d88...1a77", pair: "XDC → MOCK", amount: "55,000", status: "filled", time: "1m" },
];

const compareRows = [
  { feature: "Execution model", dex: "AMM pool swap", xdc: "Solver auction", highlight: true },
  { feature: "Price discovery", dex: "Pool depth limited", xdc: "Cross-source competition", highlight: true },
  { feature: "Slippage", dex: "Price impact", xdc: "Guaranteed minimum output", highlight: true },
  { feature: "MEV exposure", dex: "Front-runnable", xdc: "Intent-level protection", highlight: true },
  { feature: "Gas cost", dex: "Paid per attempt", xdc: "Paid only on fill", highlight: false },
];

export default function HomePage() {
  const { isConnected } = useWallet();
  const [totalIntents, setTotalIntents] = useState<number | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
        let total: bigint = BigInt(0);
        try {
          total = await registry.getTotalIntents();
        } catch {
          // Contract may not expose a total intent counter on this deployment.
        }
        setTotalIntents(Number(total));
      } catch (e) {
        console.error("Failed to fetch stats", e);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="relative z-10 overflow-hidden">
      {/* HERO */}
      <section className="min-h-[92vh] flex items-center pt-28 pb-16 px-5 sm:px-8 lg:px-10">
        <div className="max-w-[1200px] mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-2)] mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                <span className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-2)] uppercase">
                  Live on Apothem Testnet
                </span>
              </div>

              <h1 className="text-[clamp(40px,5.2vw,72px)] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--ink)] mb-6">
                Trade with
                <br />
                <span className="text-gradient">intention.</span>
              </h1>

              <p className="text-[clamp(16px,1.4vw,18px)] text-[var(--ink-2)] max-w-[500px] leading-relaxed mb-8">
                The first intent-based liquidity protocol on XDC Network. State what you want. Let the solver network compete to deliver it.
              </p>

              <div className="flex flex-wrap items-center gap-3 mb-10">
                <Link href="/agent">
                  <motion.button
                    className="group inline-flex items-center gap-2 px-7 py-4 rounded-full text-[14px] font-semibold btn-primary"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isConnected ? "Ask Agent" : "Connect & Trade"}
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </motion.button>
                </Link>
                <Link href="/my-intents">
                  <motion.button
                    className="inline-flex items-center gap-2 px-7 py-4 rounded-full text-[14px] font-semibold btn-secondary"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    View Intents
                  </motion.button>
                </Link>
              </div>

              <div className="flex flex-wrap gap-8">
                <div>
                  <div className="text-[28px] font-semibold font-mono-nums text-[var(--ink)]">
                    {totalIntents !== null ? totalIntents.toLocaleString() : "—"}
                  </div>
                  <div className="text-[12px] text-[var(--ink-3)] uppercase tracking-[0.06em]">Intents</div>
                </div>
                <div>
                  <div className="text-[28px] font-semibold font-mono-nums text-[var(--ink)]">4</div>
                  <div className="text-[12px] text-[var(--ink-3)] uppercase tracking-[0.06em]">Solvers</div>
                </div>
                <div>
                  <div className="text-[28px] font-semibold font-mono-nums text-[var(--ink)]">&lt;5s</div>
                  <div className="text-[12px] text-[var(--ink-3)] uppercase tracking-[0.06em]">Avg Fill</div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative">
              <IntentFlowVisual />
            </motion.div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-5 sm:px-8 lg:px-10 border-y border-[var(--border)]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div>
              <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-4">How it works</div>
              <h2 className="text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.02em] text-[var(--ink)] mb-6">
                From intent to settlement.
              </h2>
              <p className="text-lg text-[var(--ink-2)] leading-relaxed">
                Traditional swaps force you to accept whatever the pool offers. Intents flip the model: you define the outcome, and solvers compete to make it real.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { num: "01", title: "Create", desc: "Define token in, minimum out, and expiry." },
                { num: "02", title: "Broadcast", desc: "Intent is published to all registered solvers." },
                { num: "03", title: "Compete", desc: "Solvers bid prices and routes in real time." },
                { num: "04", title: "Settle", desc: "Best bid executes atomically on-chain." },
              ].map((step, i, arr) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-5 p-5 rounded-2xl surface group hover:border-[var(--border-2)] transition-colors"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] font-mono text-sm font-bold">
                      {step.num}
                    </div>
                    {i < arr.length - 1 && <div className="w-px flex-1 bg-[var(--border)] my-2" />}
                  </div>
                  <div className="pb-4">
                    <h3 className="text-lg font-semibold text-[var(--ink)] mb-1">{step.title}</h3>
                    <p className="text-sm text-[var(--ink-3)] leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="py-24 px-5 sm:px-8 lg:px-10">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-12">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-4">Comparison</div>
            <h2 className="text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              Why intents outperform AMMs.
            </h2>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] shadow-[var(--shadow)]">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-6 py-5 font-mono text-[11px] tracking-[0.06em] uppercase text-[var(--ink)]">Feature</th>
                  <th className="text-left px-6 py-5 text-sm font-semibold text-[var(--ink-2)]">Traditional DEX</th>
                  <th className="text-left px-6 py-5 text-sm font-semibold text-[var(--accent)] bg-[var(--accent)]/5 relative">
                    XDCIntent
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.feature} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-6 py-5 text-sm font-medium text-[var(--ink)]">{row.feature}</td>
                    <td className="px-6 py-5 text-sm text-[var(--ink-3)]">{row.dex}</td>
                    <td className={`px-6 py-5 text-sm font-medium text-[var(--ink)] ${row.highlight ? "bg-[var(--accent)]/5" : ""}`}>
                      {row.xdc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* METRICS + LIVE FEED */}
      <section className="py-24 px-5 sm:px-8 lg:px-10 bg-[var(--bg-3)]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-4">Network</div>
              <h2 className="text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.02em] text-[var(--ink)] mb-10">
                Live network state.
              </h2>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: totalIntents !== null ? totalIntents.toLocaleString() : "—", label: "Total Intents" },
                  { value: "4", label: "Solver Nodes" },
                  { value: "99%", label: "Fill Rate" },
                  { value: "<5s", label: "Avg Settlement" },
                ].map((m) => (
                  <div key={m.label} className="p-5 rounded-2xl surface">
                    <div className="text-[clamp(28px,3.5vw,40px)] font-semibold font-mono-nums text-gradient leading-none">
                      {m.value}
                    </div>
                    <div className="mt-2 text-[13px] text-[var(--ink-3)]">{m.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <Activity size={18} className="text-[var(--accent)]" />
                  <span className="font-semibold text-[var(--ink)]">Recent Intents</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
                  <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--ink-3)]">Live</span>
                </div>
              </div>

              <div className="space-y-3">
                {recentIntents.map((intent, i) => (
                  <motion.div
                    key={intent.id}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg)] border border-[var(--border)]"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${intent.status === "filled" ? "bg-[var(--success)]" : "bg-[var(--accent-2)]"}`} />
                      <div>
                        <div className="text-sm font-medium text-[var(--ink)]">{intent.pair}</div>
                        <div className="font-mono text-[11px] text-[var(--ink-3)]">{intent.id}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold font-mono-nums text-[var(--ink)]">{intent.amount}</div>
                      <div className="font-mono text-[11px] text-[var(--ink-3)]">{intent.time} ago</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 px-5 sm:px-8 lg:px-10">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-12 text-center">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-4">Features</div>
            <h2 className="text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              Built for serious traders.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: <Shield size={20} />, title: "MEV Protected", desc: "Intents hide routing details until settlement, eliminating front-running." },
              { icon: <Lock size={20} />, title: "Price Guarantee", desc: "Set a minimum output and only settle if a solver meets it." },
              { icon: <Globe size={20} />, title: "Cross-Source Liquidity", desc: "Solvers tap DEXs, bridges, and private inventory in one request." },
              { icon: <Clock size={20} />, title: "Expiry Control", desc: "Intents auto-expire. Your capital is never stuck indefinitely." },
              { icon: <Layers size={20} />, title: "Gas on Fill", desc: "You only pay gas when a solver successfully fills your intent." },
              { icon: <TrendingUp size={20} />, title: "Competitive Pricing", desc: "Multiple solvers bid against each other for your order flow." },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="p-6 rounded-2xl surface hover:border-[var(--border-2)] transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-[var(--ink)] mb-2">{feature.title}</h3>
                <p className="text-sm text-[var(--ink-3)] leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-5 sm:px-8 lg:px-10">
        <div className="max-w-[1200px] mx-auto">
          <div className="rounded-[32px] p-12 sm:p-16 text-center bg-[var(--ink)] text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-30 bg-gradient-to-br from-[var(--accent)] via-[var(--accent-2)] to-[var(--accent-3)]" />
            <div className="relative z-10">
              <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/70 mb-4">Get started</div>
              <h2 className="text-[clamp(30px,3.5vw,48px)] font-semibold text-white mb-5">
                Start trading with intent.
              </h2>
              <p className="text-lg text-white/70 max-w-xl mx-auto mb-8">
                Experience the first intent-based swap protocol purpose-built for XDC Network.
              </p>
              <Link href="/agent">
                <motion.button
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-[var(--ink)] text-[14px] font-semibold hover:shadow-[0_20px_50px_-10px_rgba(0,0,0,0.4)] transition-shadow"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Ask Your First Agent <ArrowRight size={16} />
                </motion.button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
