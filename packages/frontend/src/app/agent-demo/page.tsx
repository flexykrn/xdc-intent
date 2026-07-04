"use client";

import { useWallet } from "@/components/providers";
import { ethers } from "ethers";
import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, ArrowRight, Loader2, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

interface PaymentRequired {
  x402Version: number;
  resource: { url: string; description?: string };
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
  }>;
}

interface SettleResult {
  transaction?: string;
  success?: boolean;
  error?: string;
}

export default function AgentDemoPage() {
  const { isConnected, sdk, address } = useWallet();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [intentId, setIntentId] = useState("");
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequired | null>(null);
  const [result, setResult] = useState<SettleResult | null>(null);

  const service = {
    name: "RWA Token Minting Service",
    description: "Mint 1 RWA token for 5 MUSDC",
    inputToken: "0xa3f37BBd132C6DA9088B4A63622CacbCBee394A4",
    inputAmount: ethers.parseEther("5"),
    outputToken: "0x6DC37E3ca98E49e923E953c5A7229726513eaf6E",
    minOutput: ethers.parseEther("1"),
    maxFee: ethers.parseEther("0.1"),
  };

  async function createIntent() {
    if (!sdk || !address) return;
    setLoading(true);
    try {
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const nonce = Number(await sdk.getUserNonce(address)) + 1;
      const params = {
        sourceChainId: 51,
        sourceToken: service.inputToken,
        sourceAmount: service.inputAmount,
        destChainId: 51,
        destToken: service.outputToken,
        minDestAmount: service.minOutput,
        maxSolverFee: service.maxFee,
        expiry,
        nonce,
        allowedSolvers: [],
      };
      const signed = await sdk.signIntent(address, params);
      const tx = await sdk.submitIntent(signed);
      await tx.wait();
      setIntentId(signed.intentId);
      setStep(1);
      toast.success("Intent submitted");
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function requestPayment() {
    setLoading(true);
    try {
      const res = await fetch(`/api/payment-required?intentId=${intentId}`);
      const body = (await res.json()) as PaymentRequired;
      setPaymentRequired(body);
      setStep(2);
      toast.success("Received 402 payment required");
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function settlePayment() {
    setLoading(true);
    try {
      const res = await fetch(`/api/settle?intentId=${intentId}`);
      const body = (await res.json()) as SettleResult;
      setResult(body);
      setStep(3);
      toast.success("Payment settled");
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative z-10 min-h-screen pt-32 pb-20 px-5 sm:px-8 lg:px-10">
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-2">Agent Demo</div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-[var(--ink)] mb-2">AI Agent x402 Flow</h1>
          <p className="text-[var(--ink-2)]">Simulate an autonomous agent declaring an intent, receiving a 402, and paying for fulfillment.</p>
        </motion.div>

        <div className="rounded-2xl p-6 surface mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-6 h-6 text-[var(--accent)]" />
            <div className="font-semibold text-[var(--ink)]">{service.name}</div>
          </div>
          <p className="text-[var(--ink-2)] text-sm">{service.description}</p>
        </div>

        <div className="space-y-4">
          <StepCard
            number={1}
            title="Declare Intent"
            active={step >= 0}
            done={step >= 1}
            action={createIntent}
            loading={loading && step === 0}
            disabled={!isConnected || step > 0}
          >
            {intentId && <p className="font-mono text-xs text-[var(--ink-2)] break-all mt-2">{intentId}</p>}
          </StepCard>

          <StepCard
            number={2}
            title="Receive 402 Payment Required"
            active={step >= 1}
            done={step >= 2}
            action={requestPayment}
            loading={loading && step === 1}
            disabled={step < 1 || step > 1}
          >
            {paymentRequired && <pre className="text-xs text-[var(--ink-2)] mt-2 overflow-auto">{JSON.stringify(paymentRequired, null, 2)}</pre>}
          </StepCard>

          <StepCard
            number={3}
            title="Settle Payment"
            active={step >= 2}
            done={step >= 2}
            action={settlePayment}
            loading={loading && step === 2}
            disabled={step < 2 || step > 2}
          >
            {result && <p className="font-mono text-xs text-emerald-600 mt-2 break-all">Tx: {result.transaction}</p>}
          </StepCard>
        </div>
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
    <div className={`rounded-2xl p-6 border ${active ? "surface border-[var(--border)]" : "bg-black/5 border-transparent opacity-60"}`}>
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
