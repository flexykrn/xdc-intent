"use client";

import { useWallet } from "@/components/providers";
import { ethers } from "ethers";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, CheckCircle, Send } from "lucide-react";
import toast from "react-hot-toast";

interface ParsedIntent {
  inputToken: string;
  inputAmount: string;
  outputToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  reasoning: string;
  error?: string;
}

// Apothem mock token addresses from deployments/apothem.json
const APOTHEM_TOKENS = {
  mockUSDC: "0x86530A99784D188e8343e119140114d9e5fD0546",
  mockXDC: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
};

export default function AgentDemoPage() {
  const { isConnected, sdk, address, signer } = useWallet();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [intentId, setIntentId] = useState("");
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null);
  const [quotes, setQuotes] = useState<{ solverAddress: string; outputAmount: string; feeBps: number }[]>([]);
  const [explanation, setExplanation] = useState("");
  const [intentStatus, setIntentStatus] = useState<{ status: number; solver: string; fulfilledAmount: string; paymentTxHash: string } | null>(null);

  const service = parsedIntent || {
    inputToken: APOTHEM_TOKENS.mockUSDC,
    inputAmount: "10",
    outputToken: APOTHEM_TOKENS.mockXDC,
    minDestAmount: "190",
    maxSolverFee: "1",
  };

  async function askAgent(mode: "parse" | "explain", extras: Record<string, unknown> = {}) {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode, ...extras }),
    });
    const body = await res.json();
    if (!res.ok || body.error) {
      throw new Error(body.error || "Agent failed");
    }
    return body.result as ParsedIntent | { explanation: string };
  }

  async function parsePrompt() {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const result = await askAgent("parse");
      if ((result as ParsedIntent).error) {
        throw new Error((result as ParsedIntent).error as string);
      }
      setParsedIntent(result as ParsedIntent);
      setStep(1);
      toast.success("Agent parsed your request");
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function createIntent() {
    if (!sdk || !address || !signer) return;
    setLoading(true);
    try {
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const nonce = Number(await sdk.getUserNonce(address)) + 1;
      const escrowAddress = await sdk.escrow.getAddress();

      const inputAmount = ethers.parseEther(service.inputAmount);
      const minOutput = ethers.parseEther(service.minDestAmount);
      const maxFee = ethers.parseEther(service.maxSolverFee);

      const token = new ethers.Contract(
        service.inputToken,
        ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"],
        signer
      );
      const allowance = await token.allowance(address, escrowAddress);
      if (allowance < inputAmount) {
        const approveTx = await token.approve(escrowAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      const params = {
        sourceChainId: 51,
        sourceToken: service.inputToken,
        sourceAmount: inputAmount,
        destChainId: 51,
        destToken: service.outputToken,
        minDestAmount: minOutput,
        maxSolverFee: maxFee,
        expiry,
        nonce,
        allowedSolvers: [],
      };
      const signed = await sdk.signIntent(address, params);
      const tx = await sdk.submitIntent(signed);
      await tx.wait();
      setIntentId(signed.intentId);
      setStep(2);
      toast.success("Intent submitted");
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuotes() {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes?intentId=${intentId}`);
      const body = await res.json();
      const list = body.quotes || [];
      setQuotes(list);

      if (list.length > 0) {
        const explain = await askAgent("explain", { intentId, quotes: list });
        setExplanation((explain as { explanation: string }).explanation || "Quotes received.");
      }

      setStep(3);
      toast.success(list.length > 0 ? `Received ${list.length} solver quotes` : "No quotes yet");
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!sdk || !intentId || step < 3) return;

    const poll = async () => {
      try {
        const intent = await sdk.getIntent(intentId);
        setIntentStatus({
          status: intent.status,
          solver: intent.solver,
          fulfilledAmount: intent.fulfilledAmount.toString(),
          paymentTxHash: intent.paymentTxHash,
        });
        if (intent.status !== 0) {
          setStep(4);
        }
      } catch (error) {
        console.error("Poll failed", error);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [sdk, intentId, step]);

  return (
    <div className="relative z-10 min-h-screen pt-32 pb-20 px-5 sm:px-8 lg:px-10">
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-2">Agent Demo</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-[var(--ink)] mb-2">AI Agent x402 Flow</h1>
          <p className="text-[var(--ink-2)]">Tell the agent what you want to swap. It parses your request, creates an intent, and watches solvers compete to fulfill it.</p>
        </motion.div>

        <StepCard
          number={1}
          title="Describe your swap"
          active={step >= 0}
          done={step >= 1}
          action={parsePrompt}
          loading={loading && step === 0}
          disabled={!isConnected || step > 0}
        >
          <div className="mt-3 flex gap-2">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && parsePrompt()}
              placeholder="e.g. swap 10 USDC for at least 190 XDC"
              className="flex-1 px-4 py-2 rounded-xl border border-[var(--border)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              disabled={step > 0}
            />
            <button
              onClick={parsePrompt}
              disabled={!isConnected || loading || step > 0}
              className="px-4 py-2 rounded-xl btn-primary disabled:opacity-50"
            >
              <Send size={16} />
            </button>
          </div>
          {parsedIntent && (
            <div className="mt-3 p-3 rounded-xl bg-black/5 text-sm text-[var(--ink-2)]">
              <p><strong>Agent plan:</strong> {parsedIntent.reasoning}</p>
              <p>Input: {parsedIntent.inputAmount} MUSDC</p>
              <p>Min output: {parsedIntent.minDestAmount} MXDC</p>
              <p>Max fee: {parsedIntent.maxSolverFee} MXDC</p>
            </div>
          )}
        </StepCard>

        <StepCard
          number={2}
          title="Create Intent"
          active={step >= 1}
          done={step >= 2}
          action={createIntent}
          loading={loading && step === 1}
          disabled={step < 1 || step > 1}
        >
          {intentId && <p className="font-mono text-xs text-[var(--ink-2)] break-all mt-2">{intentId}</p>}
        </StepCard>

        <StepCard
          number={3}
          title="Solver Quote Competition"
          active={step >= 2}
          done={step >= 3}
          action={fetchQuotes}
          loading={loading && step === 2}
          disabled={step < 2 || step > 2}
        >
          {quotes.length > 0 && (
            <div className="mt-3 space-y-2">
              {quotes.map((q, i) => (
                <div key={i} className="p-2 rounded-lg bg-black/5 text-xs font-mono text-[var(--ink-2)]">
                  {q.solverAddress}: {ethers.formatEther(q.outputAmount)} MXDC (fee {q.feeBps} bps)
                </div>
              ))}
              {explanation && <p className="text-sm text-[var(--ink)] mt-2">{explanation}</p>}
            </div>
          )}
        </StepCard>

        <StepCard
          number={4}
          title="Wait for Fulfillment"
          active={step >= 3}
          done={step >= 4}
          action={() => {}}
          loading={step === 3 && !intentStatus}
          disabled={step < 3}
        >
          {intentStatus && (
            <div className="mt-3 p-3 rounded-xl bg-black/5 text-sm text-[var(--ink-2)]">
              <p>Status: {intentStatus.status === 0 ? "Open" : intentStatus.status === 1 ? "Fulfilled" : "Cancelled"}</p>
              <p>Solver: {intentStatus.solver || "Pending"}</p>
              <p>Fulfilled amount: {ethers.formatEther(intentStatus.fulfilledAmount)} MXDC</p>
              {intentStatus.paymentTxHash !== ethers.ZeroHash && (
                <p className="font-mono text-xs break-all">Payment tx: {intentStatus.paymentTxHash}</p>
              )}
            </div>
          )}
        </StepCard>
      </div>
    </div>
  );
}

function StepCard({
  number,
  title,
  active,
  done,
  action,
  loading,
  disabled,
  children,
}: {
  number: number;
  title: string;
  active: boolean;
  done: boolean;
  action: () => void;
  loading: boolean;
  disabled: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl p-6 border mb-4 ${active ? "surface border-[var(--border)]" : "bg-black/5 border-transparent opacity-60"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${done ? "bg-emerald-500 text-white" : active ? "bg-[var(--accent)] text-white" : "bg-[var(--ink-3)] text-white"}`}>
            {done ? <CheckCircle size={16} /> : number}
          </div>
          <div className="font-semibold text-[var(--ink)]">{title}</div>
        </div>
        <button
          onClick={action}
          disabled={disabled || loading}
          className="px-4 py-2 rounded-full text-sm font-semibold btn-primary disabled:opacity-50 flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {done ? "Done" : "Run"} {!loading && <ArrowRight size={14} />}
        </button>
      </div>
      {children}
    </div>
  );
}
