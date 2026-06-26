"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { CONTRACTS, CROSS_CHAIN_BRIDGE_ABI } from "@/lib/contracts";
import { ErrorMessage, LoadingSpinner } from "@/components/error-handling";

const SUPPORTED_CHAINS = [
  { chainId: 1, name: "Ethereum", fee: "0.1" },
  { chainId: 137, name: "Polygon", fee: "0.05" },
  { chainId: 42161, name: "Arbitrum", fee: "0.08" },
  { chainId: 10, name: "Optimism", fee: "0.08" },
  { chainId: 56, name: "BSC", fee: "0.03" },
];

export default function CrossChainPage() {
  const { address, signer } = useWallet();
  const [intentId, setIntentId] = useState("");
  const [targetChainId, setTargetChainId] = useState("");
  const [targetToken, setTargetToken] = useState("");
  const [targetSolver, setTargetSolver] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const bridgeContract = signer
    ? new ethers.Contract(
        CONTRACTS.crossChainBridgeAdapter,
        CROSS_CHAIN_BRIDGE_ABI,
        signer
      )
    : null;

  const bridgeIntent = async () => {
    if (!bridgeContract || !intentId || !targetChainId || !targetToken) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await bridgeContract.bridgeIntent(
        intentId,
        targetChainId,
        targetToken,
        targetSolver || ethers.ZeroAddress
      );
      await tx.wait();
      setSuccess(`Intent bridged to chain ${targetChainId} successfully!`);
    } catch (err: any) {
      setError(err.message || "Failed to bridge intent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Cross-Chain Bridge</h1>
      <p className="text-gray-600 mb-6">
        Route your intents to other EVM chains. Solvers on target chains can fulfill them.
      </p>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bridge Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Bridge Intent</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Intent ID</label>
              <input
                type="text"
                value={intentId}
                onChange={(e) => setIntentId(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Chain</label>
              <select
                value={targetChainId}
                onChange={(e) => setTargetChainId(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="">Select chain...</option>
                {SUPPORTED_CHAINS.map((chain) => (
                  <option key={chain.chainId} value={chain.chainId}>
                    {chain.name} (Fee: {chain.fee}%)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Token</label>
              <input
                type="text"
                value={targetToken}
                onChange={(e) => setTargetToken(e.target.value)}
                placeholder="0x... (token on target chain)"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Solver (optional)</label>
              <input
                type="text"
                value={targetSolver}
                onChange={(e) => setTargetSolver(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <button
              onClick={bridgeIntent}
              disabled={loading || !signer}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : "Bridge Intent"}
            </button>
          </div>
        </div>

        {/* Supported Chains */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Supported Chains</h2>
          <div className="space-y-3">
            {SUPPORTED_CHAINS.map((chain) => (
              <div key={chain.chainId} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                    {chain.chainId}
                  </div>
                  <span className="font-medium">{chain.name}</span>
                </div>
                <span className="text-sm text-gray-600">Fee: {chain.fee}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="font-semibold mb-2">How Cross-Chain Works</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>Create intent on XDC testnet</li>
          <li>Bridge it to your target chain</li>
          <li>Funds are locked in escrow on XDC</li>
          <li>Solver on target chain fulfills the intent</li>
          <li>Proof is relayed back to release funds</li>
        </ul>
      </div>
    </div>
  );
}
