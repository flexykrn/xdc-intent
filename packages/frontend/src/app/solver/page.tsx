"use client";

import { useState } from "react";
import { useWallet } from "@/components/providers";
import { ethers } from "ethers";
import { CONTRACTS, SOLVER_REGISTRY_ABI } from "@/lib/contracts";
import { Cpu, ArrowRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export default function SolverPage() {
  const { isConnected, signer } = useWallet();
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !signer) {
      toast.error("Please connect your wallet first");
      return;
    }

    setLoading(true);
    try {
      const registry = new ethers.Contract(CONTRACTS.solverRegistry, SOLVER_REGISTRY_ABI, signer);
      const tx = await registry.registerSolver(name, endpoint, { value: ethers.parseEther("1") });
      await tx.wait();
      toast.success("Solver registered successfully!");
      setName("");
      setEndpoint("");
    } catch (error: any) {
      toast.error(error.message || "Failed to register solver");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Solver Dashboard</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center gap-2 mb-6">
            <Cpu className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Register as Solver</h2>
          </div>

          {!isConnected ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">Connect your wallet to register</p>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Solver Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Solver"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Endpoint URL</label>
                <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.mysolver.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
              </div>

              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
                <p>Stake required: 1 XDC</p>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Register Solver <ArrowRight className="w-5 h-5" /></>}
              </button>
            </form>
          )}
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-6">Network Stats</h2>
          <div className="space-y-4">
            <StatItem label="Active Solvers" value="3" />
            <StatItem label="Total Intents Fulfilled" value="5" />
            <StatItem label="Average Response Time" value="2.3s" />
            <StatItem label="Success Rate" value="99.2%" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}
