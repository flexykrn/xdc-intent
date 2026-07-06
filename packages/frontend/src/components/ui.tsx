import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-3xl p-12 text-center surface">
      {icon && <div className="w-14 h-14 rounded-2xl bg-[var(--bg-3)] flex items-center justify-center text-[var(--ink-3)] mx-auto mb-5">{icon}</div>}
      <p className="text-[var(--ink)] text-lg font-medium mb-2">{title}</p>
      {description && <p className="text-[var(--ink-3)] mb-6 max-w-sm mx-auto">{description}</p>}
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mb-4" />
      <p className="text-[var(--ink-3)] text-sm">{message}</p>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  subtext?: string;
}

export function StatCard({ label, value, subtext }: StatCardProps) {
  return (
    <div className="p-5 rounded-2xl surface">
      <div className="text-[12px] text-[var(--ink-3)] uppercase tracking-[0.06em] mb-2">{label}</div>
      <div className="text-[clamp(24px,3vw,32px)] font-semibold font-mono-nums text-[var(--ink)] leading-none">{value}</div>
      {subtext && <div className="mt-2 text-[12px] text-[var(--ink-3)]">{subtext}</div>}
    </div>
  );
}

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
      <div>
        {eyebrow && <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--accent)] mb-2">{eyebrow}</div>}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h1>
        {description && <p className="text-[var(--ink-2)] mt-1 max-w-xl">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
}

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const variants = {
    default: "bg-[var(--bg-3)] text-[var(--ink-2)] border-[var(--border)]",
    success: "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20",
    warning: "bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20",
    error: "bg-[var(--error)]/10 text-[var(--error)] border-[var(--error)]/20",
    info: "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

export function TokenSymbol({ symbol, className = "" }: { symbol: string; className?: string }) {
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  const color = colors[symbol.charCodeAt(0) % colors.length];
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`w-6 h-6 rounded-full ${color} flex items-center justify-center text-white text-[10px] font-bold`}>
        {symbol.slice(0, 2)}
      </span>
      <span className="font-medium text-[var(--ink)]">{symbol}</span>
    </div>
  );
}
