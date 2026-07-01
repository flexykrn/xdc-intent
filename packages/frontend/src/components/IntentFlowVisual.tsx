"use client";

import { motion } from "framer-motion";
import { Send, Search, CheckCircle, Zap, TrendingUp, Shield } from "lucide-react";

const steps = [
  { icon: <Send size={16} />, label: "Create", color: "var(--accent)" },
  { icon: <Search size={16} />, label: "Match", color: "var(--accent-2)" },
  { icon: <CheckCircle size={16} />, label: "Settle", color: "var(--accent-3)" },
];

const floatingCards = [
  { icon: <Zap size={12} />, label: "Best price", value: "-0.3%" },
  { icon: <TrendingUp size={12} />, label: "Solvers", value: "4 bids" },
  { icon: <Shield size={12} />, label: "MEV safe", value: "Yes" },
];

export default function IntentFlowVisual() {
  return (
    <div className="relative w-full min-h-[420px] flex items-center justify-center">
      {/* Main card */}
      <div className="relative w-full max-w-[440px] rounded-3xl bg-[var(--bg-2)] border border-[var(--border)] shadow-[var(--shadow-lg)] p-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/3 via-transparent to-[var(--accent-2)]/3" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-8">
            <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--ink-3)]">
              Intent lifecycle
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--success)]/10 text-[var(--success)] text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
              Live
            </span>
          </div>

          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={step.label} className="relative">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.2 }}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)]"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                    style={{ background: step.color }}
                  >
                    {step.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[var(--ink)]">{step.label}</div>
                    <div className="text-[11px] text-[var(--ink-3)]">
                      {i === 0 && "Define token, amount, expiry"}
                      {i === 1 && "Solvers compete to fill"}
                      {i === 2 && "Atomic on-chain settlement"}
                    </div>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="text-[10px] font-mono text-[var(--ink-4)]">
                      {i === 0 ? "~120ms" : "~45ms"}
                    </div>
                  )}
                </motion.div>

                {i < steps.length - 1 && (
                  <div className="flex justify-center my-2">
                    <motion.div
                      className="w-px h-4 bg-[var(--border)] relative overflow-hidden"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 + i * 0.2 }}
                    >
                      <motion.div
                        className="absolute w-full h-3 bg-[var(--accent)]"
                        animate={{ y: [-12, 16] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: i * 0.3 }}
                      />
                    </motion.div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Floating cards */}
        {floatingCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1 + i * 0.15 }}
            className="absolute z-20 px-3 py-2.5 rounded-xl bg-[var(--bg-2)] border border-[var(--border)] shadow-[var(--shadow)] flex items-center gap-2.5"
            style={{
              [i === 0 ? "top" : i === 1 ? "bottom" : "top"]: i === 1 ? "24px" : "50%",
              [i === 2 ? "left" : "right"]: i === 2 ? "-16px" : "-16px",
              transform: i === 0 ? "translateY(-50%)" : i === 2 ? "translateY(-50%)" : "none",
            }}
          >
            <div className="text-[var(--accent)]">{card.icon}</div>
            <div>
              <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--ink-3)]">{card.label}</div>
              <div className="text-xs font-semibold text-[var(--ink)]">{card.value}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
