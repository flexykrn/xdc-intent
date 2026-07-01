"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { CONTRACTS, PARTIAL_FILL_ABI, INTENT_REGISTRY_ABI } from "@/lib/contracts";
import { ErrorMessage, LoadingSpinner } from "@/components/error-handling";

export default function PartialFillPage() {
  const { address, signer } = useWallet();
  const [intentId, setIntentId] = useState("");
  const [minFillAmount, setMinFillAmount] = useState("");
  const [maxFillAmount, setMaxFillAmount] = useState("");
  const [fillAmount, setFillAmount] = useState("");
  const [outputToken, setOutputToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const partialContract = signer
    ? new ethers.Contract(
        CONTRACTS.partialFulfillmentModule,
        PARTIAL_FILL_ABI,
        signer
      )
    : null;

  const configurePartition = async () => {
    if (!partialContract || !intentId || !minFillAmount || !maxFillAmount) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await partialContract.configurePartition(
        intentId,
        ethers.parseEther(minFillAmount),
        ethers.parseEther(maxFillAmount)
      );
      await tx.wait();
      setSuccess("Partition configured successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to configure partition");
    } finally {
      setLoading(false);
    }
  };

  const fillPartially = async () => {
    if (!partialContract || !intentId || !fillAmount || !outputToken) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await partialContract.fillPartially(
        intentId,
        ethers.parseEther(fillAmount),
        outputToken
      );
      await tx.wait();
      setSuccess("Partial fill executed successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to fill partially");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Partial Fulfillment</h1>
      <p className="text-gray-600 mb-6">
        Split large intents into smaller chunks. Multiple solvers can fill different portions.
      </p>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configure Partition */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Configure Partition</h2>
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
              <label className="block text-sm font-medium mb-1">Min Fill Amount</label>
              <input
                type="text"
                value={minFillAmount}
                onChange={(e) => setMinFillAmount(e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Fill Amount</label>
              <input
                type="text"
                value={maxFillAmount}
                onChange={(e) => setMaxFillAmount(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <button
              onClick={configurePartition}
              disabled={loading || !signer}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : "Configure Partition"}
            </button>
          </div>
        </div>

        {/* Fill Partially */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Fill Partially (Solver)</h2>
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
              <label className="block text-sm font-medium mb-1">Fill Amount</label>
              <input
                type="text"
                value={fillAmount}
                onChange={(e) => setFillAmount(e.target.value)}
                placeholder="e.g. 25"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Output Token</label>
              <input
                type="text"
                value={outputToken}
                onChange={(e) => setOutputToken(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <button
              onClick={fillPartially}
              disabled={loading || !signer}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : "Fill Partially"}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="font-semibold mb-2">How Partial Fulfillment Works</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>Intent creators set min/max fill amounts per transaction</li>
          <li>Multiple solvers can fill different portions of the same intent</li>
          <li>Each fill is recorded on-chain with remaining amount updated</li>
          <li>Intent is complete when total filled equals original amount</li>
          <li>Default max fill is 50% per solver to encourage competition</li>
        </ul>
      </div>
    </div>
  );
}
