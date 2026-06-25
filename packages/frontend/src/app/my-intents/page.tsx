"use client";

import { useWallet } from "@/components/providers";
import { useEffect, useState } from "react";
import { CONTRACTS, provider, INTENT_REGISTRY_ABI } from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";
import { Clock, CheckCircle, XCircle, ArrowRight, Loader2, AlertTriangle } from "lucide-react";

export default function MyIntentsPage() {
  const { address, isConnected } = useWallet();
  const [intents, setIntents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    async function fetchIntents() {
      try {
        setError(null);
        const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
        const intentIds = await registry.getUserIntents(address);
        const details = await Promise.all(
          intentIds.map(async (id: string) => {
            try {
              const intent = await registry.getIntent(id);
              return { id, intent };
            } catch {
              return null;
            }
          })
        );
        setIntents(details.filter(Boolean));
      } catch (e: any) {
        console.error("Failed to fetch intents", e);
        setError(e.message || "Failed to fetch your intents");
      } finally {
        setLoading(false);
      }
    }
    fetchIntents();
  }, [address]);

  if (!isConnected) {
    return (
      <div className="text-center py-16">
        <h1 className="text-3xl font-bold mb-4">My Intents</h1>
        <p className="text-gray-600 mb-6">Connect your wallet to view your intents</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">My Intents</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-red-800 font-medium">Failed to load intents</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : intents.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <p className="text-gray-500 mb-4">No intents found</p>
          <Link href="/create" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
            Create Your First Intent <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">ID</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Token</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {intents.map((item: any) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{item.id.slice(0, 10)}...</td>
                  <td className="py-3 px-4 text-sm">{item.intent[3].slice(0, 6)}...</td>
                  <td className="py-3 px-4 text-sm">{ethers.formatEther(item.intent[4])}</td>
                  <td className="py-3 px-4"><StatusBadge status={Number(item.intent[7])} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  switch (status) {
    case 0:
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"><Clock className="w-3 h-3" />Pending</span>;
    case 1:
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium"><CheckCircle className="w-3 h-3" />Fulfilled</span>;
    case 2:
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-700 rounded-full text-xs font-medium">Cancelled</span>;
    case 3:
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium"><XCircle className="w-3 h-3" />Expired</span>;
    default:
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-700 rounded-full text-xs font-medium">Unknown</span>;
  }
}
