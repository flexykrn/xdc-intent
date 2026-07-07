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
}

export function SolverLeaderboard() {
  const [solvers, setSolvers] = useState<SolverInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSolvers() {
      try {
        const registry = new ethers.Contract(CONTRACTS.solverRegistry, SOLVER_REGISTRY_ABI, provider);
        const count = Number(await registry.getSolverCount());
        const items: SolverInfo[] = [];

        for (let i = 1; i <= count; i++) {
          try {
            const s = await registry.getSolver(i);
            items.push({
              id: i,
              address: s.solverAddress,
              name: s.name,
              feeBps: Number(s.feeBps),
              active: s.active,
              registeredAt: Number(s.registeredAt) * 1000,
              supportedChains: s.supportedChains.map((c: bigint) => Number(c)),
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
            <Badge variant="info">{(solver.feeBps / 100).toFixed(2)}% fee</Badge>
            {solver.supportedChains.map((chainId) => (
              <Badge key={chainId} variant="default">{chainName(chainId)}</Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
