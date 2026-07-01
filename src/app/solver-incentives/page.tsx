"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { CONTRACTS, SOLVER_INCENTIVE_ABI } from "@/lib/contracts";
import { ErrorMessage, LoadingSpinner } from "@/components/error-handling";

export default function SolverIncentivesPage() {
  const { address, signer } = useWallet();
  const [solverAddress, setSolverAddress] = useState("");
  const [solverScore, setSolverScore] = useState<string | null>(null);
  const [solverTier, setSolverTier] = useState<string | null>(null);
  const [topSolvers, setTopSolvers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incentiveContract = signer
    ? new ethers.Contract(
        CONTRACTS.solverIncentiveManager,
        SOLVER_INCENTIVE_ABI,
        signer
      )
    : null;

  const fetchSolverStats = async () => {
    if (!incentiveContract || !solverAddress) return;
    setLoading(true);
    setError(null);
    try {
      const score = await incentiveContract.getSolverScore(solverAddress);
      const tier = await incentiveContract.getSolverTier(solverAddress);
      setSolverScore(ethers.formatUnits(score, 0));
      setSolverTier(tier.toString());
    } catch (err: any) {
      setError(err.message || "Failed to fetch solver stats");
    } finally {
      setLoading(false);
    }
  };

  const tiers = [
    { tier: 0, name: "Bronze", minScore: 0, color: "bg-amber-700" },
    { tier: 1, name: "Silver", minScore: 100, color: "bg-gray-400" },
    { tier: 2, name: "Gold", minScore: 500, color: "bg-yellow-500" },
    { tier: 3, name: "Platinum", minScore: 1000, color: "bg-cyan-400" },
    { tier: 4, name: "Diamond", minScore: 5000, color: "bg-purple-500" },
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Solver Incentives & Reputation</h1>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Solver Lookup */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Solver Lookup</h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Enter solver address"
              value={solverAddress}
              onChange={(e) => setSolverAddress(e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg"
            />
            <button
              onClick={fetchSolverStats}
              disabled={loading || !signer}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : "Lookup"}
            </button>
          </div>

          {solverScore && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Reputation Score:</span>
                <span className="font-mono font-bold">{solverScore}</span>
              </div>
              <div className="flex justify-between">
                <span>Tier:</span>
                <span className={`px-2 py-1 rounded text-white text-sm ${
                  tiers.find(t => t.tier === Number(solverTier))?.color || "bg-gray-500"
                }`}>
                  {tiers.find(t => t.tier === Number(solverTier))?.name || "Unknown"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Tier System */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Tier System</h2>
          <div className="space-y-3">
            {tiers.map((t) => (
              <div key={t.tier} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${t.color}`} />
                  <span className="font-semibold">{t.name}</span>
                </div>
                <span className="text-sm text-gray-600">Min: {t.minScore} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* My Stats */}
      {address && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">My Solver Stats</h2>
          <button
            onClick={() => {
              setSolverAddress(address);
              fetchSolverStats();
            }}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? <LoadingSpinner /> : "View My Stats"}
          </button>
        </div>
      )}
    </div>
  );
}
