"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { SectionHeader, TokenSymbol } from "@/components/ui";
import { CHAINS, TOKENS, chainName, tokenSymbol, formatTokenAmount, parseTokenAmount } from "@/lib/tokens";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Wallet,
  ArrowRightLeft,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

const expiryOptions = [
  { label: "1 hour", value: "1h", seconds: 3600 },
  { label: "6 hours", value: "6h", seconds: 21600 },
  { label: "24 hours", value: "24h", seconds: 86400 },
  { label: "3 days", value: "3d", seconds: 259200 },
  { label: "7 days", value: "7d", seconds: 604800 },
];

const steps = ["Chain & Token", "Amounts", "Review"];

export default function CreatePage() {
  const { isConnected, sdk, address } = useWallet();
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [sourceChainId, setSourceChainId] = useState(51);
  const [destChainId, setDestChainId] = useState(51);
  const [fromToken, setFromToken] = useState(TOKENS[0]);
  const [toToken, setToToken] = useState(TOKENS[1]);
  const [fromAmount, setFromAmount] = useState("");
  const [minOutput, setMinOutput] = useState("");
  const [maxSolverFee, setMaxSolverFee] = useState("0.5");
  const [expiry, setExpiry] = useState("24h");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [estimatedOutput, setEstimatedOutput] = useState<string | null>(null);

  const isCrossChain = sourceChainId !== destChainId;

  useEffect(() => {
    if (!isConnected) return;
    async function estimate() {
      if (!fromAmount || parseFloat(fromAmount) <= 0) {
        setEstimatedOutput(null);
        return;
      }
      try {
        const res = await fetch(`/api/quotes/estimate?fromToken=${fromToken.address}&toToken=${toToken.address}&amount=${fromAmount}`);
        if (!res.ok) return;
        const body = await res.json();
        setEstimatedOutput(body.outputAmount);
      } catch {
        setEstimatedOutput(null);
      }
    }
    estimate();
  }, [fromAmount, fromToken, toToken, isConnected]);

  const canNext = useMemo(() => {
    if (step === 0) return sourceChainId && destChainId && fromToken && toToken;
    if (step === 1) return parseFloat(fromAmount) > 0 && parseFloat(minOutput) > 0 && parseFloat(maxSolverFee) >= 0;
    return true;
  }, [step, sourceChainId, destChainId, fromToken, toToken, fromAmount, minOutput, maxSolverFee]);

  const handleCreate = async () => {
    if (!isConnected || !sdk || !address) {
      toast.error("Please connect your wallet first");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Creating intent...");
    try {
      const expirySeconds = expiryOptions.find((o) => o.value === expiry)?.seconds || 86400;
      const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
      const nonce = Number(await sdk.getUserNonce(address)) + 1;

      const sourceAmount = parseTokenAmount(fromAmount, fromToken.address);
      const minDestAmount = parseTokenAmount(minOutput, toToken.address);
      const maxSolverFeeRaw = parseTokenAmount(maxSolverFee, toToken.address);

      const params = {
        sourceChainId,
        sourceToken: fromToken.address,
        sourceAmount,
        destChainId,
        destToken: toToken.address,
        minDestAmount,
        maxSolverFee: maxSolverFeeRaw,
        expiry: expiryTimestamp,
        nonce,
        allowedSolvers: [],
      };

      const signed = await sdk.signIntent(address, params);

      if (fromToken.address !== ethers.ZeroAddress) {
        toast.loading("Approving token...", { id: toastId });
        const token = new ethers.Contract(
          fromToken.address,
          ["function approve(address spender,uint256 amount) returns (bool)"],
          sdk.escrow.runner as ethers.Signer
        );
        const approveTx = await token.approve(await sdk.escrow.getAddress(), sourceAmount);
        await approveTx.wait();
      }

      const tx = await sdk.submitIntent(signed);
      toast.loading("Submitting to chain...", { id: toastId });
      await tx.wait();
      toast.success("Intent created successfully", { id: toastId });
      router.push("/my-intents");
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed to create intent");
      console.error("Create intent failed", e);
      toast.error(err.message || "Failed to create intent", { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <PageContainer>
        <SectionHeader title="Create Intent" description="Define your swap and let solvers compete." />
        <div className="rounded-3xl p-12 text-center surface">
          <Wallet className="w-12 h-12 text-[var(--accent)] mx-auto mb-5" />
          <p className="text-lg font-medium text-[var(--ink)] mb-2">Connect your wallet</p>
          <p className="text-[var(--ink-3)] mb-6">You need a wallet to create intents and approve tokens.</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        eyebrow="New Intent"
        title="Create Intent"
        description="Step-by-step wizard to define your cross-chain or same-chain swap."
      />

      <div className="max-w-[800px] mx-auto">
        <Stepper steps={steps} current={step} />

        <div className="mt-8 rounded-3xl surface p-6 sm:p-8">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ChainSelector label="Source chain" value={sourceChainId} onChange={setSourceChainId} />
                  <ChainSelector label="Destination chain" value={destChainId} onChange={setDestChainId} />
                </div>

                {isCrossChain && (
                  <div className="p-4 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20 flex items-start gap-3">
                    <ArrowRightLeft className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                    <div className="text-sm text-[var(--ink-2)]">
                      Cross-chain intents route through the MockBridge on Apothem. Solvers will rebalance via the bridge after fulfillment.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TokenSelector label="You send" value={fromToken} onChange={setFromToken} />
                  <TokenSelector label="You receive" value={toToken} onChange={setToToken} />
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--ink-3)]">Amount to send</label>
                  <div className="flex items-center gap-3 p-4 rounded-2xl surface-subtle">
                    <input
                      type="number"
                      value={fromAmount}
                      onChange={(e) => setFromAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-2xl font-bold text-right outline-none text-[var(--ink)] placeholder:text-[var(--ink-4)] font-mono-nums"
                    />
                    <TokenSymbol symbol={tokenSymbol(fromToken.address)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[var(--ink-3)]">Minimum you receive</label>
                  <div className="flex items-center gap-3 p-4 rounded-2xl surface-subtle">
                    <input
                      type="number"
                      value={minOutput}
                      onChange={(e) => setMinOutput(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-2xl font-bold text-right outline-none text-[var(--ink)] placeholder:text-[var(--ink-4)] font-mono-nums"
                    />
                    <TokenSymbol symbol={tokenSymbol(toToken.address)} />
                  </div>
                  <p className="text-xs text-[var(--ink-3)]">Solvers must deliver at least this amount or the intent reverts.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--ink-3)]">Max solver fee</label>
                    <div className="flex items-center gap-3 p-3 rounded-xl surface-subtle">
                      <input
                        type="number"
                        value={maxSolverFee}
                        onChange={(e) => setMaxSolverFee(e.target.value)}
                        className="flex-1 bg-transparent text-lg font-semibold text-right outline-none text-[var(--ink)] font-mono-nums"
                      />
                      <span className="text-sm text-[var(--ink-3)]">{tokenSymbol(toToken.address)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--ink-3)]">Expiry</label>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {expiryOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setExpiry(option.value)}
                          className={`px-2 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                            expiry === option.value
                              ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                              : "bg-[var(--bg-3)] text-[var(--ink-2)] border-[var(--border)] hover:border-[var(--border-2)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {estimatedOutput && (
                  <div className="p-4 rounded-xl bg-[var(--success)]/5 border border-[var(--success)]/20 flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-[var(--success)] shrink-0" />
                    <div className="text-sm text-[var(--ink-2)]">
                      Estimated DEX output: {" "}
                      <span className="font-semibold text-[var(--ink)]">
                        {formatTokenAmount(estimatedOutput, toToken.address)} {tokenSymbol(toToken.address)}
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="rounded-2xl bg-[var(--bg-3)] border border-[var(--border)] overflow-hidden">
                  <ReviewRow label="Source" value={<span className="flex items-center gap-2"><TokenSymbol symbol={tokenSymbol(fromToken.address)} /> on {chainName(sourceChainId)}</span>} />
                  <ReviewRow label="Destination" value={<span className="flex items-center gap-2"><TokenSymbol symbol={tokenSymbol(toToken.address)} /> on {chainName(destChainId)}</span>} />
                  <ReviewRow label="You send" value={`${fromAmount} ${tokenSymbol(fromToken.address)}`} />
                  <ReviewRow label="Minimum receive" value={`${minOutput} ${tokenSymbol(toToken.address)}`} />
                  <ReviewRow label="Max solver fee" value={`${maxSolverFee} ${tokenSymbol(toToken.address)}`} />
                  <ReviewRow
                    label="Expiry"
                    value={expiryOptions.find((o) => o.value === expiry)?.label}
                    last
                  />
                </div>

                <div className="p-4 rounded-xl bg-[var(--warning)]/10 border border-[var(--warning)]/20 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-[var(--warning)] shrink-0 mt-0.5" />
                  <div className="text-sm text-[var(--ink-2)]">
                    You will approve the Escrow contract to spend {fromAmount} {tokenSymbol(fromToken.address)}. This is a testnet transaction with no real value.
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-8 pt-6 border-t border-[var(--border)] flex items-center justify-between">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0 || isSubmitting}
              className="px-5 py-2.5 rounded-full text-sm font-semibold btn-secondary disabled:opacity-50 flex items-center gap-2"
            >
              <ChevronLeft size={16} /> Back
            </button>

            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canNext}
                className="px-5 py-2.5 rounded-full text-sm font-semibold btn-primary disabled:opacity-50 flex items-center gap-2"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-full text-sm font-semibold btn-primary disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>Creating...</>
                ) : (
                  <>Create Intent <Check size={16} /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center justify-between">
      {steps.map((label, i) => (
        <div key={label} className="flex-1 flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                i < current
                  ? "bg-[var(--success)] text-white border-[var(--success)]"
                  : i === current
                    ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                    : "bg-[var(--bg-3)] text-[var(--ink-3)] border-[var(--border)]"
              }`}
            >
              {i < current ? <Check size={14} /> : i + 1}
            </div>
            <span className={`mt-2 text-[11px] font-medium ${i === current ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}`}>{label}</span>
          </div>
          {i < steps.length - 1 && <div className="flex-1 h-px bg-[var(--border)] mx-2" />}
        </div>
      ))}
    </div>
  );
}

function ChainSelector({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--ink-3)]">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        {CHAINS.map((chain) => (
          <button
            key={chain.chainId}
            onClick={() => onChange(chain.chainId)}
            className={`p-3 rounded-xl border text-left transition-colors ${
              value === chain.chainId
                ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--ink)]"
                : "bg-[var(--bg-3)] text-[var(--ink)] border-[var(--border)] hover:border-[var(--border-2)]"
            }`}
          >
            <div className="text-sm font-semibold">{chain.shortName}</div>
            <div className={`text-[11px] ${value === chain.chainId ? "text-white/70" : "text-[var(--ink-3)]"}`}>{chain.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TokenSelector({ label, value, onChange }: { label: string; value: (typeof TOKENS)[0]; onChange: (t: (typeof TOKENS)[0]) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--ink-3)]">{label}</label>
      <div className="space-y-2">
        {TOKENS.map((token) => (
          <button
            key={token.address}
            onClick={() => onChange(token)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${
              value.address === token.address
                ? "bg-[var(--accent)]/5 border-[var(--accent)]"
                : "bg-[var(--bg-3)] border-[var(--border)] hover:border-[var(--border-2)]"
            }`}
          >
            <TokenSymbol symbol={token.symbol} />
            {value.address === token.address && <Check size={16} className="text-[var(--accent)]" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ label, value, last = false }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 ${!last ? "border-b border-[var(--border)]" : ""}`}>
      <span className="text-sm text-[var(--ink-3)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--ink)]">{value}</span>
    </div>
  );
}
