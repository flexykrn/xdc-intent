"use client";

import { useWallet } from "@/components/providers";
import { XDCIntentSDK, IntentParams } from "@xdc-intent/sdk";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Wallet, AlertCircle, CheckCircle, Zap, Clock } from "lucide-react";

interface TokenInfo {
  symbol: string;
  name: string;
  address: string;
}

const expiryOptions = [
  { label: "1 hour", value: "1h", seconds: 3600 },
  { label: "6 hours", value: "6h", seconds: 21600 },
  { label: "24 hours", value: "24h", seconds: 86400 },
  { label: "3 days", value: "3d", seconds: 259200 },
];

const tokens: TokenInfo[] = [
  { symbol: "XDC", name: "XDC Network", address: "0xC4db3B088781431ea29201BaF931FD4B731F3B91" },
  { symbol: "MUSDC", name: "Mock USDC", address: "0x86530A99784D188e8343e119140114d9e5fD0546" },
  { symbol: "MXDC", name: "Mock XDC", address: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312" },
];

const DEFAULT_SOLVER = "0x5cF5bA47FA35F6e43adeE8445A487C32F1545fDe";

export default function CreatePage() {
  const { isConnected, sdk, address } = useWallet();
  const router = useRouter();
  const [fromToken, setFromToken] = useState<TokenInfo>(tokens[1]);
  const [toToken, setToToken] = useState<TokenInfo>(tokens[2]);
  const [fromAmount, setFromAmount] = useState("");
  const [minOutput, setMinOutput] = useState("");
  const [maxSolverFee, setMaxSolverFee] = useState("0.5");
  const [expiry, setExpiry] = useState("24h");
  const [sourceChainId, setSourceChainId] = useState(51);
  const [destChainId, setDestChainId] = useState(51);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [showExpiryDropdown, setShowExpiryDropdown] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateIntent = async () => {
    if (!isConnected || !sdk || !address) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!fromAmount || parseFloat(fromAmount) <= 0 || !minOutput || parseFloat(minOutput) <= 0) {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }

    setIsSubmitting(true);
    try {
      const expirySeconds = expiryOptions.find((o) => o.value === expiry)?.seconds || 86400;
      const expiryTimestamp = Math.floor(Date.now() / 1000) + expirySeconds;
      const nonce = Number(await sdk.getUserNonce(address)) + 1;

      const params: IntentParams = {
        sourceChainId,
        sourceToken: fromToken.address,
        sourceAmount: ethers.parseEther(fromAmount),
        destChainId,
        destToken: toToken.address,
        minDestAmount: ethers.parseEther(minOutput),
        maxSolverFee: ethers.parseEther(maxSolverFee),
        expiry: expiryTimestamp,
        nonce,
        allowedSolvers: [], // open to all registered solvers
      };

      const signed = await sdk.signIntent(address, params);

      // Approve escrow to spend ERC-20 source tokens.
      if (fromToken.address !== ethers.ZeroAddress) {
        const token = new ethers.Contract(
          fromToken.address,
          ["function approve(address spender,uint256 amount) returns (bool)"],
          sdk.escrow.runner as ethers.Signer
        );
        toast.loading("Approving token...", { id: "approve" });
        const approveTx = await token.approve(await sdk.escrow.getAddress(), params.sourceAmount);
        await approveTx.wait();
        toast.success("Token approved", { id: "approve" });
      }

      const tx = await sdk.submitIntent(signed);
      toast.loading("Creating intent...", { id: "create" });
      await tx.wait();
      toast.success("Intent created successfully", { id: "create" });
      setStatus("success");
      setFromAmount("");
      setMinOutput("");
      setTimeout(() => {
        setStatus("idle");
        router.push("/market");
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
              Set the token you want to spend, the minimum you expect back, max solver fee, and expiry.
            </p>
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

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-medium text-[var(--ink-3)] mb-2 block">Source chain</label>
                  <input
                    type="number"
                    value={sourceChainId}
                    onChange={(e) => setSourceChainId(Number(e.target.value))}
                    className="w-full p-3 rounded-xl surface-subtle bg-transparent text-[var(--ink)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--ink-3)] mb-2 block">Dest chain</label>
                  <input
                    type="number"
                    value={destChainId}
                    onChange={(e) => setDestChainId(Number(e.target.value))}
                    className="w-full p-3 rounded-xl surface-subtle bg-transparent text-[var(--ink)] outline-none"
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-[var(--ink-3)]">You send</label>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-2xl surface-subtle">
                  <TokenSelector selected={fromToken} tokens={tokens} onSelect={(t) => { setFromToken(t); setShowFromDropdown(false); }} show={showFromDropdown} setShow={setShowFromDropdown} />
                  <input type="number" value={fromAmount} onChange={(e) => setFromAmount(e.target.value)} placeholder="0.00" className="flex-1 bg-transparent text-2xl font-bold text-right outline-none text-[var(--ink)] placeholder:text-[var(--ink-4)] font-mono-nums" />
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-[var(--ink-3)]">You receive at least</label>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-2xl surface-subtle">
                  <TokenSelector selected={toToken} tokens={tokens} onSelect={(t) => { setToToken(t); setShowToDropdown(false); }} show={showToDropdown} setShow={setShowToDropdown} />
                  <input type="number" value={minOutput} onChange={(e) => setMinOutput(e.target.value)} placeholder="0.00" className="flex-1 bg-transparent text-2xl font-bold text-right outline-none text-[var(--ink)] placeholder:text-[var(--ink-4)] font-mono-nums" />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-sm font-medium text-[var(--ink-3)] mb-2 block">Max solver fee</label>
                <input
                  type="number"
                  value={maxSolverFee}
                  onChange={(e) => setMaxSolverFee(e.target.value)}
                  className="w-full p-3 rounded-xl surface-subtle bg-transparent text-[var(--ink)] outline-none"
                />
              </div>

              <div className="mb-6">
                <label className="text-sm font-medium text-[var(--ink-3)] mb-3 block">Intent expiry</label>
                <div className="relative">
                  <motion.button
                    onClick={() => setShowExpiryDropdown(!showExpiryDropdown)}
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
                      <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-50 surface">
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
                {isSubmitting ? "Creating Intent..." : (
                  <span className="flex items-center gap-2"><Zap size={18} /> Create Intent</span>
                )}
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function TokenSelector({
  selected,
  tokens,
  onSelect,
  show,
  setShow,
}: {
  selected: TokenInfo;
  tokens: TokenInfo[];
  onSelect: (t: TokenInfo) => void;
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  return (
    <div className="relative">
      <motion.button
        onClick={() => setShow(!show)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-2)] border border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
        whileTap={{ scale: 0.98 }}
      >
        <span className="font-bold text-sm text-[var(--ink)]">{selected.symbol}</span>
        <ChevronDown size={14} className="text-[var(--ink-3)]" />
      </motion.button>
      <AnimatePresence>
        {show && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }} className="absolute top-full left-0 mt-2 w-52 rounded-2xl overflow-hidden z-50 surface">
            {tokens.map((token) => (
              <button
                key={token.symbol}
                onClick={() => onSelect(token)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left hover:bg-[var(--bg-3)]"
              >
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
  );
}
