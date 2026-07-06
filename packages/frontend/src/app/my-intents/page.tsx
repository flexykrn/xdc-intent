"use client";

import { useWallet } from "@/components/providers";
import PageContainer from "@/components/PageContainer";
import { SectionHeader, Badge, TokenSymbol, EmptyState, LoadingState } from "@/components/ui";
import { tokenSymbol, chainName, formatTokenAmount } from "@/lib/tokens";
import { useIntents, useBridgeStatus } from "@/lib/hooks";
import Link from "next/link";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Wallet,
  ChevronRight,
  ExternalLink,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useState } from "react";

interface IntentData {
  intentId: string;
  user: string;
  sourceToken: string;
  sourceAmount: string;
  destToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  expiry: number;
  status: number;
  solver: string;
  fulfilledAmount: string;
  sourceChainId: number;
  destChainId: number;
}

const STATUS_OPEN = 0;
const STATUS_FULFILLED = 1;
const STATUS_CANCELLED = 2;

export default function MyIntentsPage() {
  const { address, isConnected, sdk } = useWallet();
  const { intents, isLoading } = useIntents(address);
  const [selected, setSelected] = useState<IntentData | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function handleCancel(id: string) {
    if (!sdk) return;
    setCancelling(id);
    try {
      const tx = await sdk.cancelIntent(id);
      toast.loading("Cancelling intent...", { id: "cancel" });
      await tx.wait();
      toast.success("Intent cancelled", { id: "cancel" });
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Failed to cancel");
      toast.error(err.message || "Failed to cancel", { id: "cancel" });
    } finally {
      setCancelling(null);
    }
  }

  if (!isConnected) {
    return (
      <PageContainer>
        <SectionHeader title="My Intents" description="Track and manage your swap intents." />
        <EmptyState
          icon=<Wallet className="w-6 h-6" />
          title="Connect your wallet"
          description="Connect to see your active and historical intents."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        eyebrow="Account"
        title="My Intents"
        description="Track and manage your swap intents."
        action={
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold btn-primary"
          >
            New Intent <ArrowRight size={16} />
          </Link>
        }
      />

      {isLoading ? (
        <LoadingState message="Loading your intents..." />
      ) : intents.length === 0 ? (
        <EmptyState
          icon=<Layers className="w-6 h-6" />
          title="No intents found"
          description="Create your first intent to start trading."
          action={
            <Link href="/create" className="px-5 py-2.5 rounded-full text-sm font-semibold btn-primary">
              Create Intent
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {intents.map((intent, i) => (
              <motion.div
                key={intent.intentId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelected(intent)}
                className={`p-5 rounded-2xl surface cursor-pointer transition-all ${
                  selected?.intentId === intent.intentId
                    ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                    : "hover:border-[var(--border-2)]"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <StatusBadge status={intent.status} />
                    <div>
                      <div className="flex items-center gap-2 text-[var(--ink)] font-medium">
                        <TokenSymbol symbol={tokenSymbol(intent.sourceToken)} />
                        <ArrowRight size={14} className="text-[var(--ink-3)]" />
                        <TokenSymbol symbol={tokenSymbol(intent.destToken)} />
                      </div>
                      <div className="text-[11px] text-[var(--ink-3)] mt-1">
                        {formatTokenAmount(intent.sourceAmount, intent.sourceToken)} → min{" "}
                        {formatTokenAmount(intent.minDestAmount, intent.destToken)} ·{" "}
                        {chainName(intent.sourceChainId)} → {chainName(intent.destChainId)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {intent.status === STATUS_OPEN && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel(intent.intentId);
                        }}
                        disabled={cancelling === intent.intentId}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {cancelling === intent.intentId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Cancel"
                        )}
                      </button>
                    )}
                    <ChevronRight size={18} className="text-[var(--ink-3)]" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <AnimatePresence mode="wait">
              {selected ? (
                <DetailPanel key={selected.intentId} intent={selected} />
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl p-8 text-center surface text-[var(--ink-3)]"
                >
                  <Layers className="w-8 h-8 mx-auto mb-3" />
                  Select an intent to view details and bridge status.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function DetailPanel({ intent }: { intent: IntentData }) {
  const { status: bridgeStatus } = useBridgeStatus(
    intent.sourceChainId !== intent.destChainId ? intent.intentId : null
  );
  const isCrossChain = intent.sourceChainId !== intent.destChainId;
  const steps = [
    { label: "Submitted", done: true },
    { label: "Quoted", done: intent.status !== STATUS_OPEN || true },
    { label: "Fulfilled", done: intent.status === STATUS_FULFILLED },
    ...(isCrossChain ? [{ label: "Locked", done: !!bridgeStatus?.locked }, { label: "Minted on dest", done: !!bridgeStatus?.minted }] : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="rounded-2xl surface p-6 sticky top-28"
    >
      <div className="flex items-center justify-between mb-5">
        <span className="font-semibold text-[var(--ink)]">Intent Details</span>
        <StatusBadge status={intent.status} />
      </div>

      <div className="space-y-4 mb-6">
        <DetailRow
          label="Intent ID"
          value={<span className="font-mono text-[11px]">{intent.intentId.slice(0, 24)}...</span>}
        />
        <DetailRow
          label="You send"
          value={`${formatTokenAmount(intent.sourceAmount, intent.sourceToken)} ${tokenSymbol(intent.sourceToken)}`}
        />
        <DetailRow
          label="Minimum receive"
          value={`${formatTokenAmount(intent.minDestAmount, intent.destToken)} ${tokenSymbol(intent.destToken)}`}
        />
        <DetailRow
          label="Route"
          value={`${chainName(intent.sourceChainId)} → ${chainName(intent.destChainId)}`}
        />
        {intent.status === STATUS_FULFILLED && (
          <>
            <DetailRow
              label="Filled amount"
              value={`${formatTokenAmount(intent.fulfilledAmount, intent.destToken)} ${tokenSymbol(intent.destToken)}`}
            />
            <DetailRow
              label="Solver"
              value={
                <a
                  href={`https://testnet.xdcscan.com/address/${intent.solver}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-[var(--accent)] hover:underline"
                >
                  {intent.solver.slice(0, 14)}...
                </a>
              }
            />
          </>
        )}
      </div>

      <div className="border-t border-[var(--border)] pt-5">
        <div className="text-sm font-medium text-[var(--ink)] mb-4">Status Timeline</div>
        <div className="space-y-0">
          {steps.map((s, i) => (
            <div key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    s.done ? "bg-[var(--success)] text-white" : "bg-[var(--bg-3)] text-[var(--ink-3)]"
                  }`}
                >
                  {s.done ? <CheckCircle size={12} /> : <Clock size={12} />}
                </div>
                {i < steps.length - 1 && <div className="w-px flex-1 bg-[var(--border)] my-1" />}
              </div>
              <div className="pb-5">
                <div className={`text-sm font-medium ${s.done ? "text-[var(--ink)]" : "text-[var(--ink-3)]"}`}>
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isCrossChain && bridgeStatus && (
        <div className="border-t border-[var(--border)] pt-5 mt-5">
          <div className="text-sm font-medium text-[var(--ink)] mb-3">Bridge Status</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={bridgeStatus.locked ? "success" : "warning"}>
                {bridgeStatus.locked ? "Locked on source" : "Pending lock"}
              </Badge>
              <Badge variant={bridgeStatus.minted ? "success" : "warning"}>
                {bridgeStatus.minted ? "Minted on destination" : "Pending mint"}
              </Badge>
            </div>
            {bridgeStatus.bridgeOutTxHash && (
              <a
                href={`https://testnet.xdcscan.com/tx/${bridgeStatus.bridgeOutTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              >
                View lock tx <ExternalLink size={12} />
              </a>
            )}
            {bridgeStatus.bridgeInTxHash && (
              <a
                href={`https://testnet.xdcscan.com/tx/${bridgeStatus.bridgeInTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              >
                View mint tx <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}

      <a
        href={`https://testnet.xdcscan.com/tx/${intent.intentId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold btn-secondary"
      >
        View on Explorer <ExternalLink size={14} />
      </a>
    </motion.div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--ink-3)]">{label}</span>
      <span className="font-medium text-[var(--ink)]">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  switch (status) {
    case STATUS_OPEN:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-600 rounded-full text-[11px] font-semibold border border-yellow-500/20">
          <Clock className="w-3 h-3" /> Open
        </span>
      );
    case STATUS_FULFILLED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[11px] font-semibold border border-emerald-500/20">
          <CheckCircle className="w-3 h-3" /> Filled
        </span>
      );
    case STATUS_CANCELLED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-500/10 text-gray-500 rounded-full text-[11px] font-semibold border border-gray-500/20">
          <XCircle className="w-3 h-3" /> Cancelled
        </span>
      );
    default:
      return null;
  }
}
