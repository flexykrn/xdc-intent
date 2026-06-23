"use client";

import { useState } from "react";
import { useWallet } from "@/components/providers";
import { ethers } from "ethers";
import { CONTRACTS, INTENT_REGISTRY_ABI } from "@/lib/contracts";
import { ArrowRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export default function CreateIntentPage() {
  const { isConnected, signer } = useWallet();
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [minOutput, setMinOutput] = useState("");
  const [expiry, setExpiry] = useState("1");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !signer) {
      toast.error("Please connect your wallet first");
      return;
    }

    setLoading(true);
    try {
      const intentId = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const expiryTimestamp = Math.floor(Date.now() / 1000) + parseInt(expiry) * 3600;

      const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, signer);
      const tx = await registry.createIntent(intentId, token, ethers.parseEther(amount), expiryTimestamp);
      await tx.wait();

      toast.success("Intent created successfully!");
      setToken("");
      setAmount("");
      setMinOutput("");
    } catch (error: any) {
      toast.error(error.message || "Failed to create intent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Create Intent</h1>

      {!isConnected && (
        <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6 text-center">
          <p className="text-gray-600 mb-4">Connect your wallet to create intents</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Token Address</label>
          <input type="text" value={token} onChange={(e) => setToken(e.target.value)} placeholder="0x..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required disabled={!isConnected} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required disabled={!isConnected} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Output</label>
          <input type="number" value={minOutput} onChange={(e) => setMinOutput(e.target.value)} placeholder="99"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required disabled={!isConnected} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Expiry (hours)</label>
          <input type="number" value={expiry} onChange={(e) => setExpiry(e.target.value)} min="1" max="24"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!isConnected} />
        </div>

        <button type="submit" disabled={loading || !isConnected}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Create Intent <ArrowRight className="w-5 h-5" /></>}
        </button>
      </form>
    </div>
  );
}
