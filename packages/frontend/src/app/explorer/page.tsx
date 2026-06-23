"use client";

import { useState } from "react";
import { Search, Filter, ArrowUpDown, Loader2 } from "lucide-react";
import { CONTRACTS, provider, INTENT_REGISTRY_ABI } from "@/lib/contracts";
import { ethers } from "ethers";
import { useEffect } from "react";

export default function ExplorerPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [intents, setIntents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIntents() {
      try {
        const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, provider);
        const total = await registry.getTotalIntents();
        const items = [];
        for (let i = 0; i < Math.min(Number(total), 10); i++) {
          try {
            // This is a simplified approach - in production you'd need an indexer
            items.push({ id: `intent-${i}`, creator: "0x...", token: "0x...", amount: "100", status: 0 });
          } catch {}
        }
        setIntents(items);
      } catch (e) {
        console.error("Failed to fetch intents", e);
      } finally {
        setLoading(false);
      }
    }
    fetchIntents();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Intent Explorer</h1>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search intents..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                <div className="flex items-center gap-1">ID <ArrowUpDown className="w-4 h-4" /></div>
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Creator</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Token</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /></td></tr>
            ) : intents.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-500">No intents found</td></tr>
            ) : (
              intents.map((intent) => (
                <tr key={intent.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{intent.id}</td>
                  <td className="py-3 px-4 text-sm">{intent.creator.slice(0, 6)}...</td>
                  <td className="py-3 px-4 text-sm">{intent.token.slice(0, 6)}...</td>
                  <td className="py-3 px-4 text-sm">{intent.amount}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                      intent.status === 0 ? "bg-blue-50 text-blue-700" :
                      intent.status === 1 ? "bg-green-50 text-green-700" :
                      "bg-gray-50 text-gray-700"
                    }`}>
                      {intent.status === 0 ? "Pending" : intent.status === 1 ? "Fulfilled" : "Expired"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
