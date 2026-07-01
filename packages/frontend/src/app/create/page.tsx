"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ArrowDown, Wallet, AlertCircle, CheckCircle, Zap, Clock, Info } from "lucide-react";
import { useWallet } from "@/components/providers";
import { ethers } from "ethers";
import { CONTRACTS, INTENT_REGISTRY_ABI } from "@/lib/contracts";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

const expiryOptions = [
  { label: "1 hour", value: "1h", seconds: 3600 },
  { label: "6 hours", value: "6h", seconds: 21600 },
  { label: "24 hours", value: "24h", seconds: 86400 },
  { label: "3 days", value: "3d", seconds: 259200 },
];

const tokens = [
  { symbol: "XDC", name: "XDC Network", icon: "⚡", address: "0x0000000000000000000000000000000000000000", balance: 12345.67 },
  { symbol: "MOCK", name: "Mock Token", icon: "🪙", address: "0x1111111111111111111111111111111111111111", balance: 5000 },
  { symbol: "USDC", name: "USD Coin", icon: "💲", address: "0x2222222222222222222222222222222222222222", balance: 2500 },
];

export default function CreatePage() {
  const { isConnected, signer, address } = useWallet();
  const router = useRouter();
  const [fromToken, setFromToken] = useState(tokens[0]);
  const [toToken, setToToken] = useState(tokens[2]);
  const [fromAmount, setFromAmount] = useState("");
  const [minOutput, setMinOutput] = useState("");
  const [expiry, setExpiry] = useState("24h");
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [showExpiryDropdown, setShowExpiryDropdown] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateIntent = async () => {
    if (!isConnected || !signer || !address) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }

    setIsSubmitting(true);
    try {
      const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, signer);
      const intentId = ethers.keccak256(ethers.toUtf8Bytes(`${address}-${Date.now()}`));
      const amountWei = ethers.parseEther(fromAmount);
      const expirySeconds = expiryOptions.find((o) => o.value === expiry)?.seconds || 86400;
      const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;

      const tx = await registry.createIntent(intentId, fromToken.address, amountWei, expiryTimestamp, {
        value: fromToken.address === "0x0000000000000000000000000000000000000000" ? amountWei : 0,
      });
      toast.loading("Creating intent...", { id: "create" });
      await tx.wait();
      toast.success("Intent created successfully", { id: "create" });
      setStatus("success");
      setFromAmount("");
      setMinOutput("");
      setTimeout(() => {
        setStatus("idle");
        router.push("/my-intents");
      }, 2000);
    } catch (e: any) {
      console.error("Create intent failed", e);
      toast.error(e?.reason || e?.message || "Failed to create intent", { id: "create" });
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen pt-32 pb-20 px-5 sm:px-8 lg:px-10">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-4">Create Intent</div>
            <h1 className="text-[clamp(36px,4vw,56px)] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--ink)] mb-6">
              Define your
              <br />
              <span className="text-gradient">swap.</span>
            </h1>
            <p className="text-lg text-[var(--ink-2)] leading-relaxed mb-10">
              Set the token you want to spend, the minimum you expect back, and how long solvers have to fill it.
            </p>

            <div className="space-y-3">
              {[
                { icon: <Zap size={18} />, title: "Competitive pricing", desc: "Multiple solvers bid to fill your intent" },
                { icon: <Clock size={18} />, title: "Expiry protection", desc: "Intent auto-expires if not filled in time" },
                { icon: <Info size={18} />, title: "Transparent fees", desc: "Protocol fee is 0.05% on filled intents" },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4 p-4 rounded-2xl surface">
                  <div className="text-[var(--accent)] mt-0.5">{item.icon}</div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--ink)]">{item.title}</div>
                    <div className="text-xs text-[var(--ink-3)]">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-3">
            <div className="rounded-3xl p-6 sm:p-8 surface">
              {!isConnected && (
                <div className="p-5 rounded-2xl mb-6 surface-subtle">
                  <div className="flex items-center gap-3">
                    <Wallet size={20} className="text-[var(--accent)]" />
                    <p className="text-sm text-[var(--ink-2)]">Connect your wallet to create an intent.</p>
                  </div>
                </div>
              )}

              <div className="mb-2">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-[var(--ink-3)]">You send</label>
                  <span className="text-xs flex items-center gap-1.5 text-[var(--ink-3)] font-mono">
                    <Wallet size={12} />
                    {fromToken.balance.toLocaleString()} {fromToken.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-2xl surface-subtle">
                  <div className="relative">
                    <motion.button
                      onClick={() => { setShowFromDropdown(!showFromDropdown); setShowToDropdown(false); setShowExpiryDropdown(false); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-2)] border border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="text-xl">{fromToken.icon}</span>
                      <span className="font-bold text-sm text-[var(--ink)]">{fromToken.symbol}</span>
                      <ChevronDown size={14} className="text-[var(--ink-3)]" />
                    </motion.button>
                    <AnimatePresence>
                      {showFromDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.95 }}
                          className="absolute top-full left-0 mt-2 w-52 rounded-2xl overflow-hidden z-50 surface"
                        >
                          {tokens.map((token) => (
                            <button
                              key={token.symbol}
                              onClick={() => { setFromToken(token); setShowFromDropdown(false); }}
                              className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left hover:bg-[var(--bg-3)]"
                            >
                              <span className="text-xl">{token.icon}</span>
                              <div>
                                <div className="text-sm font-semibold text-[var(--ink)]">{token.symbol}</div>
                                <div className="text-xs text-[var(--ink-3)]">{token.name}</div>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <input
                    type="number"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-2xl font-bold text-right outline-none text-[var(--ink)] placeholder:text-[var(--ink-4)] font-mono-nums"
                  />
                </div>
              </div>

              <div className="flex justify-center my-4">
                <motion.button
                  onClick={() => { const temp = fromToken; setFromToken(toToken); setToToken(temp); }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center surface-subtle border border-[var(--border)] hover:border-[var(--border-2)]"
                  whileHover={{ scale: 1.1, rotate: 180 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400 }}
                >
                  <ArrowDown size={18} className="text-[var(--accent)]" />
                </motion.button>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-[var(--ink-3)]">You receive at least</label>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-2xl surface-subtle">
                  <div className="relative">
                    <motion.button
                      onClick={() => { setShowToDropdown(!showToDropdown); setShowFromDropdown(false); setShowExpiryDropdown(false); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-2)] border border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="text-xl">{toToken.icon}</span>
                      <span className="font-bold text-sm text-[var(--ink)]">{toToken.symbol}</span>
                      <ChevronDown size={14} className="text-[var(--ink-3)]" />
                    </motion.button>
                    <AnimatePresence>
                      {showToDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.95 }}
                          className="absolute top-full left-0 mt-2 w-52 rounded-2xl overflow-hidden z-50 surface"
                        >
                          {tokens.map((token) => (
                            <button
                              key={token.symbol}
                              onClick={() => { setToToken(token); setShowToDropdown(false); }}
                              className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left hover:bg-[var(--bg-3)]"
                            >
                              <span className="text-xl">{token.icon}</span>
                              <div>
                                <div className="text-sm font-semibold text-[var(--ink)]">{token.symbol}</div>
                                <div className="text-xs text-[var(--ink-3)]">{token.name}</div>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <input
                    type="number"
                    value={minOutput}
                    onChange={(e) => setMinOutput(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-2xl font-bold text-right outline-none text-[var(--ink)] placeholder:text-[var(--ink-4)] font-mono-nums"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-sm font-medium text-[var(--ink-3)] mb-3 block">Intent expiry</label>
                <div className="relative">
                  <motion.button
                    onClick={() => { setShowExpiryDropdown(!showExpiryDropdown); setShowFromDropdown(false); setShowToDropdown(false); }}
                    className="w-full flex items-center justify-between p-4 rounded-2xl surface-subtle"
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-[var(--ink-3)]" />
                      <span className="font-semibold text-[var(--ink)]">{expiryOptions.find((o) => o.value === expiry)?.label}</span>
                    </div>
                    <ChevronDown size={18} className="text-[var(--ink-3)]" />
                  </motion.button>
                  <AnimatePresence>
                    {showExpiryDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-50 surface"
                      >
                        {expiryOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => { setExpiry(option.value); setShowExpiryDropdown(false); }}
                            className={`w-full text-left px-4 py-3.5 transition-colors hover:bg-[var(--bg-3)] ${expiry === option.value ? "bg-[var(--bg-3)]" : ""}`}
                          >
                            <span className={`text-sm font-semibold ${expiry === option.value ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>{option.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="p-4 rounded-2xl mb-6 surface-subtle">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--ink-3)]">Protocol fee</span>
                  <span className="text-sm font-medium text-[var(--ink)]">0.05%</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--ink-3)]">Gas (estimated)</span>
                  <span className="text-sm font-medium text-[var(--ink)]">~0 XDC</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--ink-3)]">Slippage</span>
                  <span className="text-sm font-medium text-[var(--ink)]">0%</span>
                </div>
              </div>

              <AnimatePresence>
                {status === "success" && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-3 p-4 rounded-2xl mb-6 bg-[var(--success)]/10 border border-[var(--success)]/20">
                    <CheckCircle size={18} className="text-[var(--success)] shrink-0" />
                    <span className="text-[var(--success)] text-sm font-semibold">Intent created successfully. Redirecting...</span>
                  </motion.div>
                )}
                {status === "error" && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-3 p-4 rounded-2xl mb-6 bg-red-500/10 border border-red-500/20">
                    <AlertCircle size={18} className="text-red-500 shrink-0" />
                    <span className="text-red-500 text-sm font-semibold">Failed to create intent. Check console for details.</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                onClick={handleCreateIntent}
                disabled={isSubmitting || !isConnected}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-full text-base font-semibold btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                whileHover={!isSubmitting ? { scale: 1.01 } : {}}
                whileTap={!isSubmitting ? { scale: 0.99 } : {}}
              >
                {isSubmitting ? (
                  <>
                    <motion.div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
                    Creating Intent...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Create Intent
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
