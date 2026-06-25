"use client";

import { useEffect, useState, useRef } from "react";
import { useWallet } from "@/components/providers";
import { CONTRACTS, INTENT_REGISTRY_ABI } from "@/lib/contracts";
import { ethers } from "ethers";
import Link from "next/link";
import { Clock, CheckCircle, XCircle, ArrowRight, Loader2, AlertTriangle, Wifi, WifiOff } from "lucide-react";

export default function MyIntentsPage() {
  const { address, isConnected } = useWallet();
  const [intents, setIntents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const WS_RPC_URL = "wss://ws.apothem.network";
  const HTTP_RPC_URL = "https://rpc.apothem.network";

  async function fetchIntentsViaHTTP() {
    if (!address) return;
    try {
      setError(null);
      const httpProvider = new ethers.JsonRpcProvider(HTTP_RPC_URL);
      const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, httpProvider);
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
      setLastUpdate(new Date());
    } catch (e: any) {
      console.error("Failed to fetch intents", e);
      setError(e.message || "Failed to fetch your intents");
    } finally {
      setLoading(false);
    }
  }

  function connectWebSocket() {
    try {
      const ws = new WebSocket(WS_RPC_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("MyIntents WebSocket connected");
        setWsConnected(true);
        setError(null);
        const subscribeMsg = {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_subscribe",
          params: ["newHeads"],
        };
        ws.send(JSON.stringify(subscribeMsg));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.method === "eth_subscription" && data.params?.result) {
            console.log("New block, refreshing my intents...");
            fetchIntentsViaHTTP();
          }
        } catch (e) {
          console.error("WebSocket message error:", e);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };
    } catch (e) {
      setWsConnected(false);
    }
  }

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    fetchIntentsViaHTTP();
    connectWebSocket();

    const interval = setInterval(() => {
      if (!wsConnected) {
        fetchIntentsViaHTTP();
      }
    }, 30000);

    return () => {
      clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
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
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">My Intents</h1>
        <div className="flex items-center gap-3">
          {wsConnected ? (
            <span className="flex items-center gap-1 text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
              <Wifi className="w-4 h-4" /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full">
              <WifiOff className="w-4 h-4" /> Polling
            </span>
          )}
          {lastUpdate && (
            <span className="text-sm text-gray-400">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

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
