"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACTS, SOLVER_REGISTRY_ABI, provider } from "@/lib/contracts";
import { chainName } from "@/lib/tokens";
import { Badge } from "@/components/ui";
import { truncateAddress } from "@/lib/utils";
import { Loader2, AlertCircle, Award } from "lucide-react";

interface SolverInfo {
  id: number;
  address: string;
  name: string;
  feeBps: number;
  active: boolean;
  registeredAt: number;
  supportedChains: number[];
  stake: bigint;
  withdrawableStake: bigint;
  withdrawUnlockTime: number;
}

function formatEtherCompact(value: bigint): string {
  if (value === 0n) return "0";
  const formatted = ethers.formatEther(value);
  const num = parseFloat(formatted);
  return num < 0.001 ? "<0.001" : num.toFixed(Math.min(4, Math.max(0, 4 - Math.floor(Math.log10(num)))));
}

export function SolverLeaderboard() {
  const [solvers, setSolvers] = useState<SolverInfo[]>([]);
  const [requiredBond, setRequiredBond] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSolvers() {
      try {
        const registry = new ethers.Contract(CONTRACTS.solverRegistry, SOLVER_REGISTRY_ABI, provider);
        const count = Number(await registry.getSolverCount());
        const bond = await registry.requiredBond();
        if (!cancelled) setRequiredBond(bond);
        const items: SolverInfo[] = [];

        for (let i = 1; i <= count; i++) {
          try {
            const s = await registry.getSolver(i);
            const [stake, withdrawableStake, withdrawUnlockTime] = await Promise.all([
              registry.getStake(s.solverAddress).catch(() => 0n),
              registry.getWithdrawableStake(s.solverAddress).catch(() => 0n),
              registry.getWithdrawUnlockTime(s.solverAddress).catch(() => 0n),
            ]);
            items.push({
              id: i,
              address: s.solverAddress,
              name: s.name,
              feeBps: Number(s.feeBps),
              active: s.active,
              registeredAt: Number(s.registeredAt) * 1000,
              supportedChains: s.supportedChains.map((c: bigint) => Number(c)),
              stake,
              withdrawableStake,
              withdrawUnlockTime: Number(withdrawUnlockTime) * 1000,
            });
          } catch {
            // skip stale or invalid solver entries
          }
        }

        if (!cancelled) setSolvers(items);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load solvers");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSolvers();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--ink-3)] py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading registered solvers...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 py-6">
        <AlertCircle className="w-4 h-4" /> {error}
      </div>
    );
  }

  if (solvers.length === 0) {
    return (
      <div className="text-sm text-[var(--ink-3)] py-6">No solvers are registered on the registry yet.</div>
    );
  }

  return (
    <div className="space-y-3">
      {solvers.map((solver) => (
        <div
          key={solver.id}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-[var(--bg-2)] border border-[var(--border)] hover:border-[var(--border-2)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center">
              <Award size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--ink)]">{solver.name}</div>
              <div className="text-[11px] text-[var(--ink-3)] font-mono">{truncateAddress(solver.address, 4, 4)}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={solver.active ? "success" : "default"}>{solver.active ? "Active" : "Inactive"}</Badge>
            {!solver.active && solver.stake === 0n && (
              <Badge variant="error">Slashed</Badge>
            )}
            <Badge variant="info">{(solver.feeBps / 100).toFixed(2)}% fee</Badge>
            <span title={`Required bond: ${requiredBond !== null ? formatEtherCompact(requiredBond) : "—"}`}>
              <Badge variant="default">{formatEtherCompact(solver.stake + solver.withdrawableStake)} XDC stake</Badge>
            </span>
            {solver.withdrawableStake > 0n && (
              <Badge variant={solver.withdrawUnlockTime <= now ? "success" : "warning"}>
                {solver.withdrawUnlockTime <= now ? "Withdraw ready" : `Cooldown ${Math.ceil((solver.withdrawUnlockTime - now) / 86400000)}d`}
              </Badge>
            )}
            {solver.supportedChains.map((chainId) => (
              <Badge key={chainId} variant="default">{chainName(chainId)}</Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
