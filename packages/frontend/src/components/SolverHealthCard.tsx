"use client";

import { Activity, AlertCircle, CheckCircle2, Server, Loader2 } from "lucide-react";

export interface SolverHealthCardProps {
  title: string;
  url: string;
  status: "up" | "down" | "unknown";
  lastSeen: string | null;
  responseTime?: number | null;
  error?: string | null;
  loading?: boolean;
  details?: React.ReactNode;
}

export function SolverHealthCard({
  title,
  url,
  status,
  lastSeen,
  responseTime,
  error,
  loading = false,
  details,
}: SolverHealthCardProps) {
  const isUp = status === "up";
  const isDown = status === "down";

  return (
    <div className="rounded-2xl surface p-5 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isUp
                ? "bg-[var(--success)]/10 text-[var(--success)]"
                : isDown
                  ? "bg-[var(--error)]/10 text-[var(--error)]"
                  : "bg-[var(--bg-3)] text-[var(--ink-3)]"
            }`}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Server size={20} />}
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--ink)]">{title}</div>
            <div className="text-[11px] font-mono text-[var(--ink-3)] truncate max-w-[180px]">{url}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isUp ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
              <span className="text-[11px] font-semibold text-[var(--success)]">Healthy</span>
            </>
          ) : isDown ? (
            <>
              <AlertCircle size={14} className="text-[var(--error)]" />
              <span className="text-[11px] font-semibold text-[var(--error)]">Down</span>
            </>
          ) : (
            <>
              <Activity size={14} className="text-[var(--ink-3)]" />
              <span className="text-[11px] font-semibold text-[var(--ink-3)]">Unknown</span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Status</span>
          <span className={`font-medium ${isUp ? "text-[var(--success)]" : isDown ? "text-[var(--error)]" : "text-[var(--ink-3)]"}`}>
            {isUp ? "Online" : isDown ? "Offline" : "Checking..."}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--ink-3)]">Last seen</span>
          <span className="font-mono text-[var(--ink)]">{lastSeen ?? "—"}</span>
        </div>
        {responseTime !== undefined && responseTime !== null && (
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-3)]">Response time</span>
            <span className="font-mono text-[var(--ink)]">{responseTime}ms</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 text-[var(--error)] text-[12px] mt-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {details && <div className="mt-4 pt-4 border-t border-[var(--border)]">{details}</div>}
    </div>
  );
}

export function HealthSummary({ up, total }: { up: number; total: number }) {
  const allUp = up === total && total > 0;
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold border ${
        allUp
          ? "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20"
          : "bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20"
      }`}
    >
      {allUp ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {up}/{total} services healthy
    </div>
  );
}
