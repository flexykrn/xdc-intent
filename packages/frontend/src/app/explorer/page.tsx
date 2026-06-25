"use client";

import { useState, useEffect } from "react";
import { Search, Filter, ArrowUpDown, Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { CONTRACTS, provider, INTENT_REGISTRY_ABI } from "@/lib/contracts";
import { ethers } from "ethers";

interface Intent {
  id: string;
  creator: string;
  token: string;
  amount: string;
  status: number;
  expiryTimestamp: number;
  protocolFee: string;
}

const STATUS_LABELS = ["Pending", "Fulfilled", "Expired", "Cancelled"];
const STATUS_COLORS = [
  "bg-blue-50 text-blue-700",
  "bg-green-50 text-green-700",
  "bg-gray-50 text-gray-700",
  "bg-red-50 text-red-700",
];

export default function ExplorerPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalIntents, setTotalIntents] = useState(0);
  const [totalFulfilled, setTotalFulfilled] = useState(0);

  useEffect(() => {
    async function fetchIntents() {
      try {
        setError(null);
        const registry = new ethers.Contract(
          CONTRACTS.intentRegistry,
          INTENT_REGISTRY_ABI,
          provider
        );

        const total = await registry.getTotalIntents();
        const fulfilled = await registry.getTotalIntentsFulfilled();
        setTotalIntents(Number(total));
        setTotalFulfilled(Number(fulfilled));

        const items: Intent[] = [];
        const count = Math.min(Number(total), 20);

        for (let i = 0; i < count; i++) {
          try {
            const intentId = await registry.intentList(i);
            const intent = await registry.getIntent(intentId);
            items.push({
              id: intentId,
              creator: intent[1],
              token: intent[2],
              amount: ethers.formatEther(intent[4]),
              status: Number(intent[7]),
              expiryTimestamp: Number(intent[5]),
              protocolFee: ethers.formatEther(intent[6]),
            });
          } catch (e) {
            console.error(`Failed to fetch intent ${i}:`, e);
          }
        }

        setIntents(items);
      } catch (e: any) {
        console.error("Failed to fetch intents:", e);
        setError(e.message || "Failed to fetch intents from the blockchain");
      } finally {
        setLoading(false);
      }
    }

    fetchIntents();
    const interval = setInterval(fetchIntents, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredIntents = intents.filter((intent) => {
    if (statusFilter !== "all" && STATUS_LABELS[intent.status].toLowerCase() !== statusFilter) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        intent.id.toLowerCase().includes(term) ||
        intent.creator.toLowerCase().includes(term) ||
        intent.token.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Intent Explorer</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <p className="text-red-800 font-medium">Failed to load data</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Total Intents</p>
          <p className="text-2xl font-bold">{totalIntents}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Fulfilled</p>
          <p className="text-2xl font-bold text-green-600">{totalFulfilled}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500 mb-1">Fill Rate</p>
          <p className="text-2xl font-bold text-blue-600">
            {totalIntents > 0 ? ((totalFulfilled / totalIntents) * 100).toFixed(1) : 0}%
          </p>
        </div>
      </div>

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
              <option value="cancelled">Cancelled</option>
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
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Expires</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                </td>
              </tr>
            ) : filteredIntents.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-500">
                  No intents found
                </td>
              </tr>
            ) : (
              filteredIntents.map((intent) => (
                <tr key={intent.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">
                    <a
                      href={`https://testnet.xdcscan.com/tx/${intent.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-blue-600"
                    >
                      {intent.id.slice(0, 10)}...{intent.id.slice(-6)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="py-3 px-4 text-sm font-mono">
                    {intent.creator.slice(0, 6)}...{intent.creator.slice(-4)}
                  </td>
                  <td className="py-3 px-4 text-sm font-mono">
                    {intent.token.slice(0, 6)}...{intent.token.slice(-4)}
                  </td>
                  <td className="py-3 px-4 text-sm">{parseFloat(intent.amount).toFixed(4)}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[intent.status]}`}>
                      {STATUS_LABELS[intent.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {new Date(intent.expiryTimestamp * 1000).toLocaleString()}
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
