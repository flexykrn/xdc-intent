"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { Badge } from "@/components/ui";
import { tokenSymbol, chainName, parseTokenAmount, formatTokenAmount } from "@/lib/tokens";
import { ethers } from "ethers";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, User, Loader2, CheckCircle, ArrowRight, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

interface ParsedIntent {
  inputToken: string;
  inputAmount: string;
  outputToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  reasoning: string;
  error?: string;
}

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  intent?: ParsedIntent;
  quote?: { solverAddress: string; outputAmount: string; feeBps: number };
  txHash?: string;
}

const APOTHEM_TOKENS = {
  mockUSDC: "0x86530A99784D188e8343e119140114d9e5fD0546",
  mockXDC: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
};

function formatAgentContent(text: string): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const raw = match[0];
    const inner = raw.slice(2, -2);
    if (raw.startsWith("**") || raw.startsWith("__")) {
      nodes.push(<strong key={match.index}>{inner}</strong>);
    } else {
      nodes.push(<em key={match.index}>{inner}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

export default function AgentDemoPage() {
  const { isConnected, sdk, address, signer } = useWallet();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "agent",
      content:
        'Hi, I\'m your XDC Intent agent. Tell me what you\'d like to swap, e.g. "Swap 10 USDC for at least 190 XDC on Apothem".',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ status: number; solver: string; fulfilledAmount: string; paymentTxHash: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    if (!input.trim() || !isConnected || loading) return;
    const userPrompt = input.trim();
    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: userPrompt }]);
    setLoading(true);

    try {
      const result = await askAgent("parse", userPrompt);
      const parsed = result as ParsedIntent;
      if (parsed.error) throw new Error(parsed.error);

      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: `I parsed that as: **${parsed.inputAmount} ${tokenSymbol(parsed.inputToken)} → min ${parsed.minDestAmount} ${tokenSymbol(parsed.outputToken)}**. ${parsed.reasoning}`,
          intent: parsed,
        },
      ]);

      await createIntent(parsed, userPrompt);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed");
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "agent", content: `Sorry, ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function createIntent(parsed: ParsedIntent, originalPrompt: string) {
    if (!sdk || !address || !signer) return;
    const toastId = toast.loading("Submitting intent...");
    try {
      const expiry = Math.floor((new Date().getTime()) / 1000) + 3600;
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
      toast.success("Intent submitted", { id: toastId });

      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: `Intent submitted. Waiting for solver quotes...`,
          txHash: tx.hash,
        },
      ]);

      pollQuotes(signed.intentId, originalPrompt);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      toast.error(err.message || "Failed", { id: toastId });
      throw e;
    }
  }

  async function pollQuotes(id: string, originalPrompt: string) {
    let tries = 0;
    const interval = setInterval(async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/quotes?intentId=${id}`);
        const body = await res.json();
        const list = body.quotes || [];
        if (list.length > 0) {
          clearInterval(interval);
          const best = list[0];

          let explanation = "";
          try {
            const explain = await askAgent("explain", originalPrompt, { intentId: id, quotes: list });
            explanation = (explain as { explanation: string }).explanation || "";
          } catch {
            explanation = `${best.solverAddress.slice(0, 12)}... offered the best quote.`;
          }

          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "agent",
              content: `Received ${list.length} quote(s). Best: **${formatTokenAmount(best.outputAmount, APOTHEM_TOKENS.mockXDC)} ${tokenSymbol(APOTHEM_TOKENS.mockXDC)}** from **${best.solverAddress.slice(0, 10)}...** (fee ${best.feeBps} bps). ${explanation}`,
              quote: best,
            },
          ]);
          pollFulfillment(id);
        }
        if (tries > 20) {
          clearInterval(interval);
          setMessages((m) => [...m, { id: crypto.randomUUID(), role: "agent", content: "No quotes received yet. You can check My Intents for updates." }]);
        }
      } catch {
        // ignore
      }
    }, 3000);
  }

  function pollFulfillment(id: string) {
    if (!sdk) return;
    const interval = setInterval(async () => {
      try {
        const intent = await sdk.getIntent(id);
        setStatus({
          status: intent.status,
          solver: intent.solver,
          fulfilledAmount: intent.fulfilledAmount.toString(),
          paymentTxHash: intent.paymentTxHash,
        });
        if (intent.status !== 0) {
          clearInterval(interval);
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "agent",
              content:
                intent.status === 1
                  ? `Intent fulfilled by ${intent.solver.slice(0, 12)}... You received ${formatTokenAmount(intent.fulfilledAmount.toString(), intent.destToken)} ${tokenSymbol(intent.destToken)}.`
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
      <div className="max-w-3xl mx-auto h-[calc(100vh-140px)] flex flex-col">
        <div className="mb-5">
          <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-1">Agent Demo</div>
          <h1 className="text-2xl font-semibold text-[var(--ink)]">AI Agent x402 Flow</h1>
          <p className="text-sm text-[var(--ink-2)]">Chat with the agent to create an intent and watch solvers compete.</p>
        </div>

        <div className="flex-1 rounded-2xl surface p-4 overflow-y-auto space-y-4">
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
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-3)] text-[var(--accent)] flex items-center justify-center">
                <Bot size={14} />
              </div>
              <div className="bg-[var(--bg-3)] rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-[var(--ink-3)]">
                <Loader2 className="w-4 h-4 animate-spin" /> Agent is thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4">
          {!isConnected ? (
            <div className="rounded-xl p-4 text-center text-sm text-[var(--ink-3)] bg-[var(--bg-3)]">
              Connect your wallet to chat with the agent.
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="e.g. swap 10 USDC for at least 190 XDC"
                disabled={loading}
                className="flex-1 px-5 py-3 rounded-full border border-[var(--border)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="px-5 py-3 rounded-full btn-primary disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          )}
        </div>

        {status && status.status === 1 && intentId && (
          <div className="mt-4 rounded-xl p-4 bg-emerald-500/5 border border-emerald-500/20 text-sm">
            <div className="flex items-center gap-2 text-emerald-600 font-semibold mb-1">
              <CheckCircle size={14} /> Fulfilled
            </div>
            <div className="text-[var(--ink-2)]">
              Received {formatTokenAmount(status.fulfilledAmount, APOTHEM_TOKENS.mockXDC)} {tokenSymbol(APOTHEM_TOKENS.mockXDC)} from {status.solver.slice(0, 12)}...
            </div>
            <Link href={`/my-intents`} className="mt-2 inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
              View in My Intents <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
