"use client";

import { useWallet } from "@/components/providers";
import { useEffect, useState } from "react";
import { CONTRACTS, provider, INTENT_REGISTRY_ABI } from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";
import { Wallet, Zap, Shield, BarChart3, ArrowRight, Loader2 } from "lucide-react";

export default function HomePage() {
  const { isConnected } = useWallet();
  const [stats, setStats] = useState({ total: "0", fulfilled: "0", solvers: "3", rate: "99%" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
        const total = await registry.getTotalIntents();
        const fulfilled = await registry.getTotalIntentsFulfilled();
        setStats({ total: total.toString(), fulfilled: fulfilled.toString(), solvers: "3", rate: "99%" });
      } catch (e) {
        console.error("Failed to fetch stats", e);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const statItems = [
    { label: "Total Intents", value: stats.total, icon: BarChart3 },
    { label: "Fulfilled", value: stats.fulfilled, icon: Zap },
    { label: "Active Solvers", value: stats.solvers, icon: Shield },
    { label: "Success Rate", value: stats.rate, icon: Wallet },
  ];

  return (
    <div className="space-y-12">
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Intent-Based Trading on XDC</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          Create trading intents and let solvers compete to fulfill them. No MEV, better prices, gasless execution.
        </p>

        {isConnected ? (
          <Link href="/create" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
            Create Intent <ArrowRight className="w-5 h-5" />
          </Link>
        ) : (
          <p className="text-gray-500">Connect wallet to get started</p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statItems.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <stat.icon className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-gray-600">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : stat.value}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <FeatureCard icon={<Zap className="w-8 h-8 text-blue-600" />} title="Gasless Execution" description="Sign intents off-chain, let relayers execute on-chain. No gas fees for users." />
        <FeatureCard icon={<Shield className="w-8 h-8 text-green-600" />} title="MEV Protection" description="Commit-reveal scheme prevents frontrunning. Batch auctions ensure fair pricing." />
        <FeatureCard icon={<BarChart3 className="w-8 h-8 text-purple-600" />} title="Solver Competition" description="Multiple solvers compete to fulfill your intent. Best price wins." />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
