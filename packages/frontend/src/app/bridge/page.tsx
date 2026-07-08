"use client";

import { useState } from "react";
import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { SectionHeader, Badge, TokenSymbol, EmptyState, LoadingState } from "@/components/ui";
import { tokenSymbol, chainName, formatTokenAmount, explorerUrl } from "@/lib/tokens";
import { useIntents, useBridgeStatus, type IntentData, type BridgeStatus } from "@/lib/hooks";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  Wallet,
  Layers,
  ExternalLink,
  ChevronRight,
  Route,
  AlertCircle,
  X,
} from "lucide-react";

const STATUS_FULFILLED = 1;
const STATUS_CANCELLED = 2;

function formatRelativeTime(timestamp?: number | string | Date | null): string {
  if (!timestamp) return "";
  const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function intentTimestamp(intent: IntentData): number | null {
  const hex = intent.intentId.replace(/^0x/, "");
  const tsHex = hex.slice(0, 16);
  if (!tsHex || tsHex.length < 16) return null;
  try {
    const ts = parseInt(tsHex, 16);
    return ts > 1_000_000_000 && ts < 2_000_000_000_000 ? ts * 1000 : null;
  } catch {
    return null;
  }
}

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

export default function BridgePage() {
  const { address, isConnected } = useWallet();
  const { intents, isLoading } = useIntents(address);
  const [selected, setSelected] = useState<IntentData | null>(null);

  const crossChain = intents.filter((i) => i.sourceChainId !== i.destChainId);

  if (!isConnected) {
    return (
      <PageContainer>
        <SectionHeader title="Bridge" description="Track your cross-chain intent transactions." />
        <EmptyState
          icon={<Wallet className="w-6 h-6" />}
          title="Connect your wallet"
          description="Connect to see your cross-chain bridge transactions."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        eyebrow="Cross-chain"
        title="Bridge Transactions"
        description="Track the status of your cross-chain intents and bridge transfers."
      />

      {isLoading ? (
        <LoadingState message="Loading bridge transactions..." />
      ) : crossChain.length === 0 ? (
        <EmptyState
          icon={<Layers className="w-6 h-6" />}
          title="No bridge transactions"
          description="Create a cross-chain intent to see it here."
        />
      ) : (
        <>
          <div className="hidden md:block rounded-2xl surface overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-[var(--bg-3)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-5 py-3 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider">Time</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider">From</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider">To</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider">From Chain</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider">To Chain</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider">ETA</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-[var(--ink-3)] uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {crossChain.map((intent, i) => (
                  <BridgeRow
                    key={intent.intentId}
                    intent={intent}
                    index={i}
                    onSelect={() => setSelected(intent)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {crossChain.map((intent, i) => (
              <BridgeCard
                key={intent.intentId}
                intent={intent}
                index={i}
                onSelect={() => setSelected(intent)}
              />
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {selected && (
          <DetailPanel intent={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </PageContainer>
  );
}

function BridgeRow({
  intent,
  index,
  onSelect,
}: {
  intent: IntentData;
  index: number;
  onSelect: () => void;
}) {
  const { status: bridgeStatus, isLoading: bridgeLoading } = useBridgeStatus(intent.intentId);
  const ts = intentTimestamp(intent);
  const timeLabel = ts ? formatRelativeTime(ts) : shortId(intent.intentId);

  return (
    <motion.tr
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="hover:bg-[var(--bg-3)]/50 transition-colors"
    >
      <td className="px-5 py-4 text-sm text-[var(--ink-2)] whitespace-nowrap" title={ts ? new Date(ts).toLocaleString() : undefined}>
        {timeLabel}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <TokenSymbol symbol={tokenSymbol(intent.sourceToken, intent.sourceChainId)} className="shrink-0" />
          <span className="text-sm font-medium text-[var(--ink)]">
            {formatTokenAmount(intent.sourceAmount, intent.sourceToken, intent.sourceChainId)}
          </span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <TokenSymbol symbol={tokenSymbol(intent.destToken, intent.destChainId)} className="shrink-0" />
          <span className="text-sm font-medium text-[var(--ink)]">
            {formatTokenAmount(intent.minDestAmount, intent.destToken, intent.destChainId)}
          </span>
        </div>
      </td>
      <td className="px-5 py-4 text-sm text-[var(--ink-2)]">{chainName(intent.sourceChainId)}</td>
      <td className="px-5 py-4 text-sm text-[var(--ink-2)]">{chainName(intent.destChainId)}</td>
      <td className="px-5 py-4">
        <BridgeStatusBadge intent={intent} bridgeStatus={bridgeStatus} loading={bridgeLoading} />
      </td>
      <td className="px-5 py-4 text-sm text-[var(--ink-3)]">
        <Eta intent={intent} bridgeStatus={bridgeStatus} />
      </td>
      <td className="px-5 py-4 text-right">
        <button
          onClick={onSelect}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:underline"
        >
          Details <ChevronRight size={14} />
        </button>
      </td>
    </motion.tr>
  );
}

function BridgeCard({
  intent,
  index,
  onSelect,
}: {
  intent: IntentData;
  index: number;
  onSelect: () => void;
}) {
  const { status: bridgeStatus, isLoading: bridgeLoading } = useBridgeStatus(intent.intentId);
  const ts = intentTimestamp(intent);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl surface p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--ink-3)]" title={ts ? new Date(ts).toLocaleString() : undefined}>
          {ts ? formatRelativeTime(ts) : shortId(intent.intentId)}
        </span>
        <BridgeStatusBadge intent={intent} bridgeStatus={bridgeStatus} loading={bridgeLoading} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="text-[11px] text-[var(--ink-3)] mb-1">From {chainName(intent.sourceChainId)}</div>
          <div className="flex items-center gap-2">
            <TokenSymbol symbol={tokenSymbol(intent.sourceToken, intent.sourceChainId)} />
            <span className="font-medium text-[var(--ink)]">{formatTokenAmount(intent.sourceAmount, intent.sourceToken, intent.sourceChainId)}</span>
          </div>
        </div>
        <ArrowRight size={16} className="text-[var(--ink-3)]" />
        <div className="flex-1 text-right">
          <div className="text-[11px] text-[var(--ink-3)] mb-1">To {chainName(intent.destChainId)}</div>
          <div className="flex items-center justify-end gap-2">
            <span className="font-medium text-[var(--ink)]">{formatTokenAmount(intent.minDestAmount, intent.destToken, intent.destChainId)}</span>
            <TokenSymbol symbol={tokenSymbol(intent.destToken, intent.destChainId)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
        <span className="text-xs text-[var(--ink-3)]">
          <Eta intent={intent} bridgeStatus={bridgeStatus} />
        </span>
        <button
          onClick={onSelect}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:underline"
        >
          See Details <ChevronRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}

function BridgeStatusBadge({
  intent,
  bridgeStatus,
  loading,
}: {
  intent: IntentData;
  bridgeStatus?: BridgeStatus;
  loading?: boolean;
}) {
  if (loading && intent.status !== STATUS_FULFILLED) {
    return (
      <Badge variant="default" className="animate-pulse">
        <Clock size={10} /> Loading
      </Badge>
    );
  }

  if (intent.status === STATUS_CANCELLED) {
    return (
      <Badge variant="error">
        <XCircle size={10} /> Failed
      </Badge>
    );
  }

  if (!bridgeStatus) {
    return (
      <Badge variant={intent.status === STATUS_FULFILLED ? "success" : "warning"}>
        {intent.status === STATUS_FULFILLED ? (
          <>
            <CheckCircle size={10} /> Fulfilled
          </>
        ) : (
          <>
            <Clock size={10} /> Submitted
          </>
        )}
      </Badge>
    );
  }

  switch (bridgeStatus.state) {
    case "minted":
      return (
        <Badge variant="success">
          <CheckCircle size={10} /> Minted on Destination
        </Badge>
      );
    case "locked":
      return (
        <Badge variant="success">
          <CheckCircle size={10} /> Locked on Source
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="error">
          <XCircle size={10} /> Failed
        </Badge>
      );
    case "pending":
    default:
      return (
        <Badge variant="warning">
          <Clock size={10} /> Bridge Pending
        </Badge>
      );
  }
}

function Eta({ intent, bridgeStatus }: { intent: IntentData; bridgeStatus?: BridgeStatus }) {
  if (intent.status === STATUS_CANCELLED) return "—";
  if (bridgeStatus?.state === "minted") return "Delivered";
  if (bridgeStatus?.state === "locked") return "~3 minutes";
  if (bridgeStatus?.state === "failed") return "Retrying";
  const ts = intentTimestamp(intent);
  if (ts) {
    const elapsed = Math.floor((Date.now() - ts) / 1000);
    if (elapsed < 60) return "~9 minutes";
    const minutes = Math.floor(elapsed / 60);
    return `~${Math.max(1, 9 - minutes)} minutes`;
  }
  return "~9 minutes";
}

function DetailPanel({ intent, onClose }: { intent: IntentData; onClose: () => void }) {
  const { status: bridgeStatus } = useBridgeStatus(intent.intentId);
  const steps = [
    { label: "Submitted", done: true },
    { label: "Fulfilled", done: intent.status === STATUS_FULFILLED },
    { label: "Bridge Out", done: bridgeStatus?.state === "locked" || bridgeStatus?.state === "minted" },
    { label: "Delivered", done: bridgeStatus?.state === "minted" },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, x: "100%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md surface border-l border-[var(--border)] shadow-2xl overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Route size={18} className="text-[var(--accent)]" />
            <span className="font-semibold text-[var(--ink)]">Bridge Details</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-[var(--ink-3)] hover:bg-[var(--bg-3)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="rounded-2xl p-5 bg-[var(--bg-3)] border border-[var(--border)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--ink-3)]">Intent ID</span>
              <span className="font-mono text-xs text-[var(--ink)]">{shortId(intent.intentId)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--ink-3)]">Route</span>
              <span className="text-sm font-medium text-[var(--ink)]">
                {chainName(intent.sourceChainId)} → {chainName(intent.destChainId)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--ink-3)]">You send</span>
              <span className="text-sm font-medium text-[var(--ink)]">
                {formatTokenAmount(intent.sourceAmount, intent.sourceToken, intent.sourceChainId)} {tokenSymbol(intent.sourceToken, intent.sourceChainId)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--ink-3)]">Minimum receive</span>
              <span className="text-sm font-medium text-[var(--ink)]">
                {formatTokenAmount(intent.minDestAmount, intent.destToken, intent.destChainId)} {tokenSymbol(intent.destToken, intent.destChainId)}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[var(--ink)] mb-4">Status Timeline</h3>
            <div className="space-y-0">
              {steps.map((s, i) => (
                <div key={s.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center ${
                        s.done ? "bg-[var(--success)] text-white" : "bg-[var(--bg-3)] text-[var(--ink-3)]"
                      }`}
                    >
                      {s.done ? <CheckCircle size={14} /> : <Clock size={14} />}
                    </div>
                    {i < steps.length - 1 && <div className="w-px flex-1 bg-[var(--border)] my-1" />}
                  </div>
                  <div className="pb-6">
                    <div className={`text-sm font-medium ${s.done ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}`}>
                      {s.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {bridgeStatus && (
            <div className="rounded-2xl p-5 bg-[var(--bg-3)] border border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--ink)] mb-3">Bridge Status</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <BridgeStatusBadge intent={intent} bridgeStatus={bridgeStatus} />
                </div>
                {bridgeStatus.locked && (
                  <div className="text-sm text-[var(--ink-2)]">
                    Locked{" "}
                    <span className="font-medium text-[var(--ink)]">
                      {formatTokenAmount(bridgeStatus.lockedAmount, bridgeStatus.lockedToken, bridgeStatus.sourceChainId)}{" "}
                      {tokenSymbol(bridgeStatus.lockedToken, bridgeStatus.sourceChainId)}
                    </span>{" "}
                    on source
                  </div>
                )}
                {bridgeStatus.minted && (
                  <div className="text-sm text-[var(--ink-2)]">
                    Minted{" "}
                    <span className="font-medium text-[var(--ink)]">
                      {formatTokenAmount(
                        bridgeStatus.mintedAmount,
                        bridgeStatus.mintedToken || bridgeStatus.lockedToken,
                        bridgeStatus.destChainId
                      )}{" "}
                      {tokenSymbol(bridgeStatus.mintedToken || bridgeStatus.lockedToken, bridgeStatus.destChainId)}
                    </span>{" "}
                    on destination
                  </div>
                )}
                {bridgeStatus.error && (
                  <div className="flex items-start gap-2 text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    {bridgeStatus.error}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Explorer Links</h3>
            <div className="grid grid-cols-1 gap-2">
              {bridgeStatus?.bridgeOutTxHash ? (
                <a
                  href={explorerUrl(intent.sourceChainId, "tx", bridgeStatus.bridgeOutTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
                >
                  <span className="text-sm text-[var(--ink)]">Source lock transaction</span>
                  <ExternalLink size={14} className="text-[var(--accent)]" />
                </a>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] opacity-60">
                  <span className="text-sm text-[var(--ink-3)]">Source lock transaction</span>
                  <span className="text-xs text-[var(--ink-3)]">Pending</span>
                </div>
              )}
              {bridgeStatus?.bridgeInTxHash ? (
                <a
                  href={explorerUrl(intent.destChainId, "tx", bridgeStatus.bridgeInTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
                >
                  <span className="text-sm text-[var(--ink)]">Destination mint transaction</span>
                  <ExternalLink size={14} className="text-[var(--accent)]" />
                </a>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] opacity-60">
                  <span className="text-sm text-[var(--ink-3)]">Destination mint transaction</span>
                  <span className="text-xs text-[var(--ink-3)]">Pending</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
