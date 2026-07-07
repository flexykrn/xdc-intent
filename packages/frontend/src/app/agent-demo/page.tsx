"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { Badge } from "@/components/ui";
import { tokenSymbol, chainName, parseTokenAmount, formatTokenAmount } from "@/lib/tokens";
import { truncateAddress } from "@/lib/utils";
import { ethers } from "ethers";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Bot,
  Send,
  User,
  Loader2,
  CheckCircle,
  ArrowRight,
  ExternalLink,
  RefreshCcw,
  Lightbulb,
  AlertCircle,
  Trophy,
  Wallet,
} from "lucide-react";

interface ParsedIntent {
  inputToken: string;
  inputAmount: string;
  outputToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  reasoning: string;
  error?: string;
}

interface Quote {
  solverAddress: string;
  outputAmount: string;
  feeBps: number;
  signature: string;
  createdAt: number;
}

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  intent?: ParsedIntent;
  quote?: Quote;
  txHash?: string;
}

const EXAMPLE_PROMPTS = [
  "Swap 10 USDC for at least 190 XDC on Apothem",
  "Swap 50 USDC for XDC with max fee 1 XDC",
  "Swap 100 XDC for USDC with max fee 1 XDC",
];

function formatAgentContent(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function AgentDemoPage() {
  const { isConnected, sdk, address, signer } = useWallet();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "agent",
      content:
        "Hi, I'm your XDC Intent agent. Pick an example below or type your own swap request and I'll create an intent, fetch solver quotes, and track fulfillment.",
    },
  ]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "parsing" | "submitting" | "quoting" | "fulfilling" | "done" | "error">("idle");
  const [phaseError, setPhaseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedIntent | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [status, setStatus] = useState<{ status: number; solver: string; fulfilledAmount: string; paymentTxHash: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const quoteInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const fulfillInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBusy = ["parsing", "submitting", "quoting", "fulfilling"].includes(phase);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (quoteInterval.current) clearInterval(quoteInterval.current);
      if (fulfillInterval.current) clearInterval(fulfillInterval.current);
    };
  }, []);

  function resetFlow() {
    setParsed(null);
    setIntentId(null);
    setTxHash(null);
    setQuotes([]);
    setStatus(null);
    setPhaseError(null);
    if (quoteInterval.current) clearInterval(quoteInterval.current);
    if (fulfillInterval.current) clearInterval(fulfillInterval.current);
  }

  async function askAgent(mode: "parse" | "explain", promptText: string, extras: Record<string, unknown> = {}) {
    const res = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: promptText, mode, ...extras }),
    });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(body.error || "Agent failed");
    return body.result as ParsedIntent | { explanation: string };
  }

  async function sendMessage() {
    if (!input.trim() || !isConnected || isBusy) return;
    const userPrompt = input.trim();
    setInput("");
    resetFlow();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: userPrompt }]);
    setPhase("parsing");

    try {
      const result = await askAgent("parse", userPrompt);
      const parsedResult = result as ParsedIntent;
      if (parsedResult.error) throw new Error(parsedResult.error);

      setParsed(parsedResult);
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: `I parsed that as: **${parsedResult.inputAmount} ${tokenSymbol(parsedResult.inputToken)} → min ${parsedResult.minDestAmount} ${tokenSymbol(parsedResult.outputToken)}**. ${parsedResult.reasoning}`,
          intent: parsedResult,
        },
      ]);

      setPhase("submitting");
      await createIntent(parsedResult, userPrompt);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      setPhase("error");
      setPhaseError(err.message);
      toast.error(err.message);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "agent", content: `Sorry, ${err.message}` }]);
    }
  }

  async function createIntent(parsed: ParsedIntent, originalPrompt: string) {
    if (!sdk || !address || !signer) return;
    const toastId = toast.loading("Submitting intent...");
    try {
      const expiry = Math.floor(new Date().getTime() / 1000) + 3600;
      const nonce = (await sdk.getUserNonce(address)) + 1n;
      const escrowAddress = await sdk.escrow.getAddress();

      const inputAmount = parseTokenAmount(parsed.inputAmount, parsed.inputToken);
      const minOutput = parseTokenAmount(parsed.minDestAmount, parsed.outputToken);
      const maxFee = parseTokenAmount(parsed.maxSolverFee, parsed.outputToken);

      const token = new ethers.Contract(
        parsed.inputToken,
        ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"],
        signer
      );
      const allowance = await token.allowance(address, escrowAddress);
      if (allowance < inputAmount) {
        toast.loading("Approving token...", { id: toastId });
        const approveTx = await token.approve(escrowAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      const params = {
        sourceChainId: 51,
        sourceToken: parsed.inputToken,
        sourceAmount: inputAmount,
        destChainId: 51,
        destToken: parsed.outputToken,
        minDestAmount: minOutput,
        maxSolverFee: maxFee,
        expiry,
        nonce,
        allowedSolvers: [],
      };
      const signed = await sdk.signIntent(address, params);
      const tx = await sdk.submitIntent(signed);
      toast.loading("Confirming on-chain...", { id: toastId });
      await tx.wait();
      setIntentId(signed.intentId);
      setTxHash(tx.hash);
      toast.success("Intent submitted", { id: toastId });

      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: `Intent **${signed.intentId.slice(0, 12)}...** submitted. Waiting for solver quotes...`,
          txHash: tx.hash,
        },
      ]);

      setPhase("quoting");
      pollQuotes(signed.intentId, originalPrompt, parsed);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed", { id: toastId });
      throw e;
    }
  }

  async function pollQuotes(id: string, originalPrompt: string, parsedRef: ParsedIntent) {
    if (quoteInterval.current) clearInterval(quoteInterval.current);
    let tries = 0;
    quoteInterval.current = setInterval(async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/quotes?intentId=${id}`);
        const body = await res.json();
        const list = (body.quotes || []) as Quote[];
        if (list.length > 0) {
          if (quoteInterval.current) clearInterval(quoteInterval.current);
          setQuotes(list);
          const best = list.reduce((max, q) => (BigInt(q.outputAmount) > BigInt(max.outputAmount) ? q : max), list[0]);

          let explanation = "";
          try {
            const explain = await askAgent("explain", originalPrompt, { intentId: id, quotes: list });
            explanation = (explain as { explanation: string }).explanation || "";
          } catch {
            explanation = `${truncateAddress(best.solverAddress, 3, 3)} offered the best quote.`;
          }

          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "agent",
              content: `Received **${list.length} quote(s)**. Best: **${formatTokenAmount(best.outputAmount, parsedRef.outputToken)} ${tokenSymbol(parsedRef.outputToken)}** from **${truncateAddress(best.solverAddress, 3, 3)}** (fee ${best.feeBps} bps). ${explanation}`,
              quote: best,
            },
          ]);

          setPhase("fulfilling");
          pollFulfillment(id);
        }
        if (tries > 20) {
          if (quoteInterval.current) clearInterval(quoteInterval.current);
          setPhase("error");
          setPhaseError("No solver quotes received yet. Check My Intents for updates.");
          setMessages((m) => [
            ...m,
            { id: crypto.randomUUID(), role: "agent", content: "No quotes received yet. You can check My Intents for updates." },
          ]);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  }

  function pollFulfillment(id: string) {
    if (!sdk) return;
    if (fulfillInterval.current) clearInterval(fulfillInterval.current);
    fulfillInterval.current = setInterval(async () => {
      try {
        const intent = await sdk.getIntent(id);
        setStatus({
          status: intent.status,
          solver: intent.solver,
          fulfilledAmount: intent.fulfilledAmount.toString(),
          paymentTxHash: intent.paymentTxHash,
        });
        if (intent.status !== 0) {
          if (fulfillInterval.current) clearInterval(fulfillInterval.current);
          setPhase("done");
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "agent",
              content:
                intent.status === 1
                  ? `Intent fulfilled by **${truncateAddress(intent.solver, 3, 3)}**. You received **${formatTokenAmount(intent.fulfilledAmount.toString(), intent.destToken)} ${tokenSymbol(intent.destToken)}**.`
                  : "Intent was cancelled.",
            },
          ]);
        }
      } catch {
        // ignore
      }
    }, 3000);
  }

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-180px)]">
        <div className="lg:col-span-2 flex flex-col h-full">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-1">Agent Demo</div>
              <h1 className="text-2xl font-semibold text-[var(--ink)]">AI Agent x402 Flow</h1>
              <p className="text-sm text-[var(--ink-2)]">Chat with the agent to create an intent and watch solvers compete.</p>
            </div>
            <button
              onClick={() => {
                resetFlow();
                setMessages([
                  {
                    id: "intro",
                    role: "agent",
                    content:
                      "Hi, I'm your XDC Intent agent. Pick an example below or type your own swap request and I'll create an intent, fetch solver quotes, and track fulfillment.",
                  },
                ]);
                setPhase("idle");
              }}
              disabled={isBusy}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium btn-secondary disabled:opacity-50"
            >
              <RefreshCcw size={12} /> Reset
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-3)] mr-1">
              <Lightbulb size={12} /> Try:
            </div>
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setInput(prompt)}
                disabled={isBusy}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-[var(--bg-3)] border border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--border-2)] hover:text-[var(--ink)] transition-colors disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex-1 rounded-2xl surface p-4 overflow-y-auto space-y-4 min-h-[320px]">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      m.role === "user" ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-3)] text-[var(--accent)]"
                    }`}
                  >
                    {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user" ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-3)] text-[var(--ink)]"
                    }`}
                  >
                    <div>{formatAgentContent(m.content)}</div>
                    {m.txHash && m.txHash !== ethers.ZeroHash && (
                      <a
                        href={`https://testnet.xdcscan.com/tx/${m.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs opacity-80 hover:underline"
                      >
                        View tx <ExternalLink size={10} />
                      </a>
                    )}
                    {m.intent && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="default">{tokenSymbol(m.intent.inputToken)}</Badge>
                        <Badge variant="default">→ {tokenSymbol(m.intent.outputToken)}</Badge>
                        <Badge variant="default">{chainName(51)}</Badge>
                      </div>
                    )}
                    {m.quote && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="success" className="gap-1">
                          <Trophy size={10} /> Best quote
                        </Badge>
                        <Badge variant="default">{(m.quote.feeBps / 100).toFixed(2)}% fee</Badge>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isBusy && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--bg-3)] text-[var(--accent)] flex items-center justify-center">
                  <Bot size={14} />
                </div>
                <div className="bg-[var(--bg-3)] rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-[var(--ink-3)]">
                  <Loader2 className="w-4 h-4 animate-spin" /> {phaseLabel(phase)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="mt-4">
            {!isConnected ? (
              <div className="rounded-xl p-4 text-center text-sm text-[var(--ink-3)] bg-[var(--bg-3)] flex items-center justify-center gap-2">
                <Wallet size={16} /> Connect your wallet to chat with the agent.
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="e.g. swap 10 USDC for at least 190 XDC"
                  disabled={isBusy}
                  className="flex-1 px-5 py-3 rounded-full border border-[var(--border)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isBusy}
                  className="px-5 py-3 rounded-full btn-primary disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <StatusPanel
            phase={phase}
            phaseError={phaseError}
            parsed={parsed}
            intentId={intentId}
            txHash={txHash}
            quotes={quotes}
            status={status}
          />
        </div>
      </div>
    </PageContainer>
  );
}

function phaseLabel(phase: string) {
  switch (phase) {
    case "parsing":
      return "Parsing intent...";
    case "submitting":
      return "Submitting on-chain...";
    case "quoting":
      return "Waiting for solver quotes...";
    case "fulfilling":
      return "Waiting for fulfillment...";
    default:
      return "Agent is thinking...";
  }
}

function StatusPanel({
  phase,
  phaseError,
  parsed,
  intentId,
  txHash,
  quotes,
  status,
}: {
  phase: string;
  phaseError: string | null;
  parsed: ParsedIntent | null;
  intentId: string | null;
  txHash: string | null;
  quotes: Quote[];
  status: { status: number; solver: string; fulfilledAmount: string; paymentTxHash: string } | null;
}) {
  const steps = ["Parsed", "Submitted", "Quoted", "Fulfilled"];
  const currentStep =
    phase === "parsing"
      ? 0
      : phase === "submitting"
      ? 1
      : phase === "quoting"
      ? 2
      : phase === "fulfilling" || phase === "done"
      ? 3
      : -1;

  const best = quotes.length
    ? quotes.reduce((max, q) => (BigInt(q.outputAmount) > BigInt(max.outputAmount) ? q : max), quotes[0])
    : null;

  return (
    <div className="rounded-2xl surface p-5 h-fit lg:sticky lg:top-28">
      <div className="text-sm font-semibold text-[var(--ink)] mb-4">Intent Status</div>

      <div className="space-y-0 mb-6">
        {steps.map((label, i) => {
          const done = currentStep > i || phase === "done";
          const active = currentStep === i;
          return (
            <div key={label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border ${
                    done
                      ? "bg-[var(--success)] text-white border-[var(--success)]"
                      : active
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-[var(--bg-3)] text-[var(--ink-3)] border-[var(--border)]"
                  }`}
                >
                  {done ? <CheckCircle size={12} /> : active ? <Loader2 size={12} className="animate-spin" /> : i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-px flex-1 my-1 ${done ? "bg-[var(--success)]" : "bg-[var(--border)]"}`} />
                )}
              </div>
              <div className="pb-5">
                <div className={`text-sm font-medium ${done || active ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}`}>{label}</div>
                {active && <div className="text-[11px] text-[var(--ink-3)] mt-0.5">{phaseLabel(phase)}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {phase === "error" && phaseError && (
        <div className="mb-5 p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-start gap-2 text-sm text-red-600">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{phaseError}</span>
        </div>
      )}

      {parsed && <ParsedCard parsed={parsed} />}
      {intentId && <SubmittedCard intentId={intentId} txHash={txHash} />}
      {best && parsed && <QuoteCard best={best} total={quotes.length} outputToken={parsed.outputToken} />}
      {status && parsed && <FulfillmentCard status={status} outputToken={parsed.outputToken} />}

      {phase === "idle" && !parsed && (
        <div className="text-[12px] text-[var(--ink-3)]">
          Send a prompt to see the parsed intent, live quotes, and fulfillment status here.
        </div>
      )}
    </div>
  );
}

function ParsedCard({ parsed }: { parsed: ParsedIntent }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)]">
      <div className="text-[11px] text-[var(--ink-3)] mb-1">Parsed Intent</div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-[var(--ink-3)]">Send</span>
        <span className="font-medium text-[var(--ink)]">
          {parsed.inputAmount} {tokenSymbol(parsed.inputToken)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-[var(--ink-3)]">Receive min</span>
        <span className="font-medium text-[var(--ink)]">
          {parsed.minDestAmount} {tokenSymbol(parsed.outputToken)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-[var(--ink-3)]">Max fee</span>
        <span className="font-medium text-[var(--ink)]">
          {parsed.maxSolverFee} {tokenSymbol(parsed.outputToken)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--ink-3)]">Chain</span>
        <span className="font-medium text-[var(--ink)]">{chainName(51)}</span>
      </div>
    </div>
  );
}

function SubmittedCard({ intentId, txHash }: { intentId: string; txHash: string | null }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)]">
      <div className="text-[11px] text-[var(--ink-3)] mb-1">Submitted Intent</div>
      <div className="font-mono text-[11px] text-[var(--ink)] mb-2">{intentId.slice(0, 24)}...</div>
      {txHash && txHash !== ethers.ZeroHash && (
        <a
          href={`https://testnet.xdcscan.com/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
        >
          View submission tx <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

function QuoteCard({ best, total, outputToken }: { best: Quote; total: number; outputToken: string }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
      <div className="flex items-center gap-2 mb-2">
        <Trophy size={12} className="text-emerald-600" />
        <span className="text-[11px] font-semibold text-emerald-600">Winning Quote ({total} total)</span>
      </div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-[var(--ink-3)]">Solver</span>
        <span className="font-medium text-[var(--ink)]">{truncateAddress(best.solverAddress, 4, 4)}</span>
      </div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-[var(--ink-3)]">Output</span>
        <span className="font-medium text-emerald-600">
          {formatTokenAmount(best.outputAmount, outputToken)} {tokenSymbol(outputToken)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--ink-3)]">Fee</span>
        <span className="font-medium text-[var(--ink)]">{(best.feeBps / 100).toFixed(2)}%</span>
      </div>
    </div>
  );
}

function FulfillmentCard({
  status,
  outputToken,
}: {
  status: { status: number; solver: string; fulfilledAmount: string; paymentTxHash: string };
  outputToken: string;
}) {
  const isFilled = status.status === 1;
  return (
    <div className={`p-3 rounded-xl border ${isFilled ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[var(--bg-3)] border-[var(--border)]"}`}>
      <div className="flex items-center gap-2 mb-2">
        {isFilled ? <CheckCircle size={12} className="text-emerald-600" /> : <AlertCircle size={12} className="text-[var(--ink-3)]" />}
        <span className={`text-[11px] font-semibold ${isFilled ? "text-emerald-600" : "text-[var(--ink-3)]"}`}>
          {isFilled ? "Fulfilled" : "Cancelled"}
        </span>
      </div>
      {isFilled && (
        <>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-[var(--ink-3)]">Solver</span>
            <span className="font-medium text-[var(--ink)]">{truncateAddress(status.solver, 4, 4)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-[var(--ink-3)]">Received</span>
            <span className="font-medium text-emerald-600">
              {formatTokenAmount(status.fulfilledAmount, outputToken)} {tokenSymbol(outputToken)}
            </span>
          </div>
          {status.paymentTxHash && status.paymentTxHash !== ethers.ZeroHash && (
            <a
              href={`https://testnet.xdcscan.com/tx/${status.paymentTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
            >
              View payment tx <ExternalLink size={10} />
            </a>
          )}
        </>
      )}
      <Link href="/my-intents" className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">
        View in My Intents <ArrowRight size={10} />
      </Link>
    </div>
  );
}
