"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { Badge } from "@/components/ui";
import { tokenSymbol, chainName, parseTokenAmount, formatTokenAmount, explorerUrl } from "@/lib/tokens";
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
  ShieldCheck,
  X,
} from "lucide-react";

const APOTHEM_MUSDC = "0x86530A99784D188e8343e119140114d9e5fD0546";
const APOTHEM_MXDC = "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312";
const APOTHEM_XDC = ethers.ZeroAddress;

const CHAIN_ALIASES: Record<string, number> = {
  apothem: 51,
  "xdc apothem": 51,
  xdc: 51,
  sepolia: 11155111,
  "arb sepolia": 421614,
  "arbitrum sepolia": 421614,
  arbitrum: 421614,
};

const CROSS_CHAIN_TOKENS: Record<number, Record<string, string>> = {
  11155111: {
    USDC: "0xA0b86a33E6441E6C7D3D4b4f6c7E8F9a0B1c2D3e",
    XDC: ethers.ZeroAddress,
    ETH: ethers.ZeroAddress,
  },
  421614: {
    USDC: "0xB1c2D3e4F5a6B7c8D9e0F1a2B3c4D5e6F7a8B9c0",
    XDC: ethers.ZeroAddress,
    ETH: ethers.ZeroAddress,
  },
};

const QUICK_PROMPTS = [
  "Swap 10 MUSDC to MXDC on Apothem",
  "Bridge 5 USDC from Sepolia to Arbitrum Sepolia",
  "Send 20 USDC to Arbitrum Sepolia, min 19",
];

interface ParsedIntent {
  inputToken: string;
  inputAmount: string;
  outputToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  sourceChainId: number;
  destChainId: number;
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

interface BridgeStatus {
  status: "pending" | "locked" | "minted" | "failed";
  sourceTxHash?: string;
  destTxHash?: string;
  updatedAt: number;
}

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  intent?: ParsedIntent;
  quote?: Quote;
  txHash?: string;
  bridgeStatus?: BridgeStatus;
  isConfirmation?: boolean;
}

function resolveChainId(name: string): number | null {
  const key = name.toLowerCase().trim();
  return CHAIN_ALIASES[key] ?? null;
}

function resolveToken(symbol: string, chainId: number): string | null {
  const key = symbol.toUpperCase().replace(/^M/, "");
  if (chainId === 51) {
    if (key === "USDC" || symbol.toUpperCase() === "MUSDC") return APOTHEM_MUSDC;
    if (key === "XDC" || symbol.toUpperCase() === "MXDC") return APOTHEM_MXDC;
    if (symbol.toUpperCase() === "XDC") return APOTHEM_XDC;
  }
  const cross = CROSS_CHAIN_TOKENS[chainId];
  if (cross) {
    if (cross[symbol.toUpperCase()]) return cross[symbol.toUpperCase()];
    if (key === "USDC" && cross.USDC) return cross.USDC;
    if ((key === "XDC" || key === "ETH") && cross.XDC) return cross.XDC;
  }
  return null;
}

function isCrossChain(intent: ParsedIntent) {
  return intent.sourceChainId !== intent.destChainId || intent.sourceChainId !== 51;
}

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

export default function AgentPage() {
  const { isConnected, sdk, address, signer } = useWallet();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "agent",
      content:
        "Hi, I'm your XDC Intent agent. Pick a suggestion below or type a cross-chain request and I'll create an intent, fetch solver quotes, and track fulfillment.",
    },
  ]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "parsing" | "confirm" | "submitting" | "quoting" | "fulfilling" | "bridging" | "done" | "error">("idle");
  const [phaseError, setPhaseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedIntent | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [status, setStatus] = useState<{ status: number; solver: string; fulfilledAmount: string; paymentTxHash: string } | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const quoteInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const fulfillInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const bridgeInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const isBusy = ["parsing", "submitting", "quoting", "fulfilling", "bridging"].includes(phase);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (quoteInterval.current) clearInterval(quoteInterval.current);
      if (fulfillInterval.current) clearInterval(fulfillInterval.current);
      if (bridgeInterval.current) clearInterval(bridgeInterval.current);
    };
  }, []);

  function resetFlow() {
    setParsed(null);
    setIntentId(null);
    setTxHash(null);
    setQuotes([]);
    setStatus(null);
    setBridgeStatus(null);
    setPhaseError(null);
    if (quoteInterval.current) clearInterval(quoteInterval.current);
    if (fulfillInterval.current) clearInterval(fulfillInterval.current);
    if (bridgeInterval.current) clearInterval(bridgeInterval.current);
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

  function parseLocally(prompt: string): ParsedIntent {
    const lower = prompt.toLowerCase();
    const amountMatch = lower.match(/(\d+(?:\.\d+)?)\s*(usdc|musdc|xdc|mxdc|eth)/);
    if (!amountMatch) {
      return { error: "Could not parse amount. Try: 'swap 10 USDC for XDC on Apothem'" } as unknown as ParsedIntent;
    }
    const inputAmount = parseFloat(amountMatch[1]);
    const inputSymbolRaw = amountMatch[2];

    let sourceChainName = "Apothem";
    let destChainName = "Apothem";

    const chainMatches = lower.match(/(?:on|to|from)\s+([a-z\s]+?)(?:\s+(?:to|min|with|for|and|$))/gi) || [];
    const chainNamesFound: string[] = [];
    for (const m of chainMatches) {
      const cleaned = m.replace(/^(?:on|to|from)\s+/, "").trim().toLowerCase();
      if (CHAIN_ALIASES[cleaned]) chainNamesFound.push(cleaned);
    }
    if (lower.includes("from sepolia to arbitrum sepolia") || lower.includes("from sepolia to arb sepolia")) {
      chainNamesFound.push("sepolia", "arbitrum sepolia");
    } else if (lower.includes("from arbitrum sepolia to sepolia") || lower.includes("from arb sepolia to sepolia")) {
      chainNamesFound.push("arbitrum sepolia", "sepolia");
    }

    if (chainNamesFound.length >= 2) {
      sourceChainName = chainNamesFound[0];
      destChainName = chainNamesFound[1];
    } else if (chainNamesFound.length === 1) {
      if (lower.includes("from ") && lower.includes("bridge")) {
        sourceChainName = chainNamesFound[0];
        destChainName = chainNamesFound[0] === "sepolia" ? "arbitrum sepolia" : "sepolia";
      } else {
        destChainName = chainNamesFound[0];
        sourceChainName = chainNamesFound[0] === "sepolia" ? "arbitrum sepolia" : "sepolia";
      }
    }

    const sourceChainId = resolveChainId(sourceChainName) || 51;
    const destChainId = resolveChainId(destChainName) || 51;

    const isSameChain = sourceChainId === destChainId;
    let outputSymbol = inputSymbolRaw.toUpperCase() === "USDC" || inputSymbolRaw.toUpperCase() === "MUSDC" ? "XDC" : "USDC";
    if (sourceChainId === 51) {
      outputSymbol = inputSymbolRaw.toUpperCase() === "USDC" || inputSymbolRaw.toUpperCase() === "MUSDC" ? "MXDC" : "MUSDC";
    }
    if (!isSameChain) {
      outputSymbol = inputSymbolRaw.toUpperCase().replace(/^M/, "");
    }

    const minMatch = lower.match(/min\s+(\d+(?:\.\d+)?)/);
    const inputToken = resolveToken(inputSymbolRaw, sourceChainId) || APOTHEM_MUSDC;
    const outputToken = resolveToken(outputSymbol, destChainId) || APOTHEM_MXDC;

    const rate = sourceChainId === 51 && inputToken.toLowerCase() === APOTHEM_MUSDC.toLowerCase() && outputToken.toLowerCase() === APOTHEM_MXDC.toLowerCase() ? 20 : 1;
    const expectedOutput = inputAmount * rate;
    const minDestAmount = minMatch ? parseFloat(minMatch[1]) : expectedOutput * 0.95;

    return {
      inputToken,
      inputAmount: inputAmount.toString(),
      outputToken,
      minDestAmount: minDestAmount.toString(),
      maxSolverFee: sourceChainId === 51 ? "1" : "0.5",
      sourceChainId,
      destChainId,
      reasoning: `Local fallback: ${isSameChain ? "swap" : "bridge"} ${inputAmount} ${inputSymbolRaw.toUpperCase()} on ${chainName(sourceChainId)} to ${outputSymbol} on ${chainName(destChainId)}, requiring at least ${minDestAmount} ${outputSymbol}.`,
    };
  }

  async function sendMessage() {
    if (!input.trim() || !isConnected || isBusy) return;
    const userPrompt = input.trim();
    setInput("");
    resetFlow();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: userPrompt }]);
    setPhase("parsing");

    try {
      let result: ParsedIntent;
      try {
        const apiResult = await askAgent("parse", userPrompt);
        result = apiResult as ParsedIntent;
      } catch {
        result = parseLocally(userPrompt);
      }

      if (result.error) {
        const err = new Error(result.error);
        throw err;
      }

      if (!result.sourceChainId || !result.destChainId) {
        const fixed = parseLocally(userPrompt);
        result = { ...fixed, ...result, sourceChainId: fixed.sourceChainId, destChainId: fixed.destChainId };
      }

      setParsed(result);
      setPhase("confirm");
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "agent",
          content: `I parsed your request. Please review the details below and confirm.`,
          intent: result,
          isConfirmation: true,
        },
      ]);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      setPhase("error");
      setPhaseError(err.message);
      toast.error(err.message);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "agent", content: `Sorry, ${err.message}` }]);
    }
  }

  function cancelConfirmation() {
    setPhase("idle");
    setParsed(null);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "agent", content: "Intent cancelled. Ask me something else when you're ready." }]);
  }

  async function confirmIntent() {
    if (!parsed) return;
    const originalPrompt = messages.filter((m) => m.role === "user").pop()?.content || "";
    setPhase("submitting");

    if (parsed.sourceChainId !== 51) {
      await simulateCrossChainFlow(parsed);
      return;
    }

    try {
      await createIntent(parsed, originalPrompt);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed");
      setPhase("error");
      setPhaseError(err.message);
      toast.error(err.message);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "agent", content: `Sorry, ${err.message}` }]);
    }
  }

  async function simulateCrossChainFlow(parsedRef: ParsedIntent) {
    const fakeId = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    const now = 0;
    setIntentId(fakeId);
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "agent",
        content: `Cross-chain intent **${fakeId.slice(0, 12)}...** simulated. In Phase 2 this will be submitted on ${chainName(parsedRef.sourceChainId)}. Watching for quotes and bridge progress...`,
      },
    ]);

    setPhase("quoting");
    await new Promise((r) => setTimeout(r, 2500));
    const simulatedQuotes: Quote[] = [
      {
        solverAddress: "0xSolverAlpha000000000000000000000000000001",
        outputAmount: parseTokenAmount(parsedRef.minDestAmount, parsedRef.outputToken).toString(),
        feeBps: 30,
        signature: "0x00",
        createdAt: now,
      },
      {
        solverAddress: "0xSolverBeta0000000000000000000000000000002",
        outputAmount: (BigInt(parseTokenAmount(parsedRef.minDestAmount, parsedRef.outputToken)) * 101n / 100n).toString(),
        feeBps: 25,
        signature: "0x00",
        createdAt: now,
      },
    ];
    setQuotes(simulatedQuotes);
    const best = simulatedQuotes.reduce((max, q) => (BigInt(q.outputAmount) > BigInt(max.outputAmount) ? q : max), simulatedQuotes[0]);

    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "agent",
        content: `Received **${simulatedQuotes.length} quote(s)**. Winner: **${truncateAddress(best.solverAddress, 3, 3)}** with **${formatTokenAmount(best.outputAmount, parsedRef.outputToken)} ${tokenSymbol(parsedRef.outputToken)}** (fee ${best.feeBps} bps).`,
        quote: best,
      },
    ]);

    setPhase("bridging");
    await new Promise((r) => setTimeout(r, 1500));
    setStatus({ status: 1, solver: best.solverAddress, fulfilledAmount: best.outputAmount, paymentTxHash: ethers.ZeroHash });
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "agent",
        content: `Intent fulfilled by **${truncateAddress(best.solverAddress, 3, 3)}**. You will receive **${formatTokenAmount(best.outputAmount, parsedRef.outputToken)} ${tokenSymbol(parsedRef.outputToken)}** on ${chainName(parsedRef.destChainId)}.`,
      },
    ]);

    pollBridgeStatus(fakeId, true);
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
        sourceChainId: parsed.sourceChainId,
        sourceToken: parsed.inputToken,
        sourceAmount: inputAmount,
        destChainId: parsed.destChainId,
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
          content: `Intent **${signed.intentId.slice(0, 12)}...** submitted on ${chainName(parsed.sourceChainId)}. Waiting for solver quotes...`,
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
              content: `Received **${list.length} quote(s)**. Winner: **${truncateAddress(best.solverAddress, 3, 3)}** with **${formatTokenAmount(best.outputAmount, parsedRef.outputToken)} ${tokenSymbol(parsedRef.outputToken)}** (fee ${best.feeBps} bps). ${explanation}`,
              quote: best,
            },
          ]);

          setPhase("fulfilling");
          pollFulfillment(id);
          if (isCrossChain(parsedRef)) {
            setPhase("bridging");
            pollBridgeStatus(id, false);
          }
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

  function pollBridgeStatus(id: string, simulated: boolean) {
    if (bridgeInterval.current) clearInterval(bridgeInterval.current);

    if (simulated) {
      const steps: BridgeStatus["status"][] = ["pending", "locked", "minted"];
      let step = 0;
      bridgeInterval.current = setInterval(() => {
        step = Math.min(step + 1, steps.length - 1);
        const status: BridgeStatus = { status: steps[step], updatedAt: Date.now() };
        setBridgeStatus(status);
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === "agent" && last.bridgeStatus && last.content.startsWith("Bridge status")) {
            return [...m.slice(0, -1), { ...last, bridgeStatus: status, content: bridgeMessage(status) }];
          }
          return [...m, { id: crypto.randomUUID(), role: "agent", content: bridgeMessage(status), bridgeStatus: status }];
        });
        if (steps[step] === "minted") {
          if (bridgeInterval.current) clearInterval(bridgeInterval.current);
          setPhase("done");
        }
      }, 5000);
      return;
    }

    bridgeInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bridge-status?intentId=${id}`);
        const body = await res.json();
        const status = (body.status || "pending") as BridgeStatus["status"];
        const bs: BridgeStatus = {
          status,
          sourceTxHash: body.sourceTxHash,
          destTxHash: body.destTxHash,
          updatedAt: Date.now(),
        };
        setBridgeStatus(bs);
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === "agent" && last.bridgeStatus && last.content.startsWith("Bridge status")) {
            return [...m.slice(0, -1), { ...last, bridgeStatus: bs, content: bridgeMessage(bs) }];
          }
          return [...m, { id: crypto.randomUUID(), role: "agent", content: bridgeMessage(bs), bridgeStatus: bs }];
        });
        if (status === "minted") {
          if (bridgeInterval.current) clearInterval(bridgeInterval.current);
          setPhase("done");
        }
      } catch {
        // ignore
      }
    }, 5000);
  }

  function bridgeMessage(bs: BridgeStatus) {
    const labels: Record<BridgeStatus["status"], string> = {
      pending: "Bridge status: **Pending** — waiting for source-chain confirmation.",
      locked: "Bridge status: **Locked** — funds locked on source, minting on destination.",
      minted: "Bridge status: **Minted** — tokens available on the destination chain.",
      failed: "Bridge status: **Failed** — please check Bridge page for details.",
    };
    return labels[bs.status];
  }

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-180px)]">
        <div className="lg:col-span-2 flex flex-col h-full">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-1">AI Agent</div>
              <h1 className="text-2xl font-semibold text-[var(--ink)]">Intent Agent</h1>
              <p className="text-sm text-[var(--ink-2)]">Chat to create cross-chain intents and watch execution live.</p>
            </div>
            <button
              onClick={() => {
                resetFlow();
                setMessages([
                  {
                    id: "intro",
                    role: "agent",
                    content:
                      "Hi, I'm your XDC Intent agent. Pick a suggestion below or type a cross-chain request and I'll create an intent, fetch solver quotes, and track fulfillment.",
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
            {QUICK_PROMPTS.map((prompt) => (
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
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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
                    {m.intent && m.isConfirmation && (
                      <ConfirmationCard intent={m.intent} onConfirm={confirmIntent} onCancel={cancelConfirmation} disabled={isBusy} />
                    )}
                    {m.intent && !m.isConfirmation && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="default">{tokenSymbol(m.intent.inputToken)}</Badge>
                        <Badge variant="default">→ {tokenSymbol(m.intent.outputToken)}</Badge>
                        <Badge variant="default">{chainName(m.intent.sourceChainId)} → {chainName(m.intent.destChainId)}</Badge>
                      </div>
                    )}
                    {m.quote && parsed && (
                      <QuoteInChat quote={m.quote} outputToken={parsed.outputToken} />
                    )}
                    {m.bridgeStatus && parsed && (
                      <BridgeStatusInChat status={m.bridgeStatus} sourceChainId={parsed.sourceChainId} destChainId={parsed.destChainId} />
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
                  placeholder="e.g. bridge 10 USDC from Sepolia to Arbitrum Sepolia min 9.5"
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
            bridgeStatus={bridgeStatus}
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
    case "confirm":
      return "Waiting for confirmation...";
    case "submitting":
      return "Submitting on-chain...";
    case "quoting":
      return "Waiting for solver quotes...";
    case "fulfilling":
      return "Waiting for fulfillment...";
    case "bridging":
      return "Waiting for bridge...";
    default:
      return "Agent is thinking...";
  }
}

function ConfirmationCard({
  intent,
  onConfirm,
  onCancel,
  disabled,
}: {
  intent: ParsedIntent;
  onConfirm: () => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 p-3 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
      <div className="text-[11px] text-[var(--ink-3)] mb-2">Review intent</div>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Send</span>
          <span className="font-medium text-[var(--ink)]">
            {intent.inputAmount} {tokenSymbol(intent.inputToken)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Receive min</span>
          <span className="font-medium text-[var(--ink)]">
            {intent.minDestAmount} {tokenSymbol(intent.outputToken)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Max fee</span>
          <span className="font-medium text-[var(--ink)]">
            {intent.maxSolverFee} {tokenSymbol(intent.outputToken)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Route</span>
          <span className="font-medium text-[var(--ink)]">
            {chainName(intent.sourceChainId)} → {chainName(intent.destChainId)}
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onConfirm}
          disabled={disabled}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold btn-primary disabled:opacity-50"
        >
          <ShieldCheck size={12} /> Confirm & Submit
        </button>
        <button
          onClick={onCancel}
          disabled={disabled}
          className="px-3 py-2 rounded-lg text-xs font-medium btn-secondary disabled:opacity-50"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

function QuoteInChat({ quote, outputToken }: { quote: Quote; outputToken: string }) {
  return (
    <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
      <div className="flex items-center gap-2 mb-2">
        <Trophy size={12} className="text-emerald-600" />
        <span className="text-[11px] font-semibold text-emerald-600">Winning quote</span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Solver</span>
          <span className="font-medium text-[var(--ink)]">{truncateAddress(quote.solverAddress, 4, 4)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Output</span>
          <span className="font-medium text-emerald-600">
            {formatTokenAmount(quote.outputAmount, outputToken)} {tokenSymbol(outputToken)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Fee</span>
          <span className="font-medium text-[var(--ink)]">{(quote.feeBps / 100).toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
}

function BridgeStatusInChat({
  status,
  sourceChainId,
  destChainId,
}: {
  status: BridgeStatus;
  sourceChainId: number;
  destChainId: number;
}) {
  const steps = [
    { key: "pending", label: `Pending on ${chainName(sourceChainId)}` },
    { key: "locked", label: "Locked" },
    { key: "minted", label: `Minted on ${chainName(destChainId)}` },
  ];
  const currentIndex = steps.findIndex((s) => s.key === status.status);
  return (
    <div className="mt-3 p-3 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
      <div className="text-[11px] font-semibold text-[var(--accent)] mb-2">Bridge progress</div>
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                i <= currentIndex ? "bg-[var(--accent)]" : "bg-[var(--border)]"
              }`}
            />
            <span className={`text-[11px] ${i <= currentIndex ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}`}>{s.label}</span>
            {i < steps.length - 1 && <div className="w-4 h-px bg-[var(--border)]" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPanel({
  phase,
  phaseError,
  parsed,
  intentId,
  txHash,
  quotes,
  status,
  bridgeStatus,
}: {
  phase: string;
  phaseError: string | null;
  parsed: ParsedIntent | null;
  intentId: string | null;
  txHash: string | null;
  quotes: Quote[];
  status: { status: number; solver: string; fulfilledAmount: string; paymentTxHash: string } | null;
  bridgeStatus: BridgeStatus | null;
}) {
  const steps = ["Parsed", "Confirmed", "Submitted", "Quoted", "Fulfilled"];
  const currentStep =
    phase === "parsing" || phase === "confirm"
      ? 0
      : phase === "submitting"
      ? 2
      : phase === "quoting"
      ? 3
      : phase === "fulfilling" || phase === "bridging" || phase === "done" || phase === "error"
      ? 4
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
      {intentId && <SubmittedCard intentId={intentId} txHash={txHash} sourceChainId={parsed?.sourceChainId} />}
      {best && parsed && <QuoteCard best={best} total={quotes.length} outputToken={parsed.outputToken} />}
      {status && parsed && <FulfillmentCard status={status} outputToken={parsed.outputToken} />}
      {bridgeStatus && parsed && isCrossChain(parsed) && (
        <BridgeStatusCard bridgeStatus={bridgeStatus} sourceChainId={parsed.sourceChainId} destChainId={parsed.destChainId} />
      )}

      <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-2">
        <Link href="/my-intents" className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">
          View in My Intents <ArrowRight size={10} />
        </Link>
        <Link href="/bridge" className="block text-xs text-[var(--accent)] hover:underline">
          Bridge details →
        </Link>
      </div>

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
        <span className="text-[var(--ink-3)]">Route</span>
        <span className="font-medium text-[var(--ink)]">
          {chainName(parsed.sourceChainId)} → {chainName(parsed.destChainId)}
        </span>
      </div>
    </div>
  );
}

function SubmittedCard({
  intentId,
  txHash,
  sourceChainId,
}: {
  intentId: string;
  txHash: string | null;
  sourceChainId?: number;
}) {
  const explorer = sourceChainId ? explorerUrl(sourceChainId, "tx", txHash || "") : `https://testnet.xdcscan.com/tx/${txHash}`;
  return (
    <div className="mb-4 p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)]">
      <div className="text-[11px] text-[var(--ink-3)] mb-1">Submitted Intent</div>
      <div className="font-mono text-[11px] text-[var(--ink)] mb-2">{intentId.slice(0, 24)}...</div>
      {txHash && txHash !== ethers.ZeroHash && (
        <a
          href={explorer}
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
    </div>
  );
}

function BridgeStatusCard({
  bridgeStatus,
  sourceChainId,
  destChainId,
}: {
  bridgeStatus: BridgeStatus;
  sourceChainId: number;
  destChainId: number;
}) {
  const steps = [
    { key: "pending", label: `Pending on ${chainName(sourceChainId)}` },
    { key: "locked", label: "Locked" },
    { key: "minted", label: `Minted on ${chainName(destChainId)}` },
  ];
  const currentIndex = steps.findIndex((s) => s.key === bridgeStatus.status);
  return (
    <div className="mb-4 p-3 rounded-xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
      <div className="text-[11px] font-semibold text-[var(--accent)] mb-2">Bridge progress</div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${i <= currentIndex ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`}
            />
            <span className={`text-xs ${i <= currentIndex ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}`}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

