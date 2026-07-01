"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/hooks/useWallet";
import { CONTRACTS, DUTCH_AUCTION_ABI } from "@/lib/contracts";
import { ErrorMessage, LoadingSpinner } from "@/components/error-handling";

export default function DutchAuctionPage() {
  const { address, signer } = useWallet();
  const [intentId, setIntentId] = useState("");
  const [startPrice, setStartPrice] = useState("");
  const [endPrice, setEndPrice] = useState("");
  const [duration, setDuration] = useState("3600"); // 1 hour default
  const [rfqPrice, setRfqPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<string | null>(null);

  const auctionContract = signer
    ? new ethers.Contract(
        CONTRACTS.dutchAuctionRFQ,
        DUTCH_AUCTION_ABI,
        signer
      )
    : null;

  const createAuction = async () => {
    if (!auctionContract || !intentId || !startPrice || !endPrice) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await auctionContract.createAuction(
        intentId,
        ethers.parseEther(startPrice),
        ethers.parseEther(endPrice),
        duration
      );
      await tx.wait();
      setSuccess("Dutch auction created successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to create auction");
    } finally {
      setLoading(false);
    }
  };

  const getCurrentPrice = async () => {
    if (!auctionContract || !intentId) return;
    setLoading(true);
    try {
      const price = await auctionContract.getCurrentPrice(intentId);
      setCurrentPrice(ethers.formatEther(price));
    } catch (err: any) {
      setError(err.message || "Failed to get current price");
    } finally {
      setLoading(false);
    }
  };

  const placeRFQ = async () => {
    if (!auctionContract || !intentId || !rfqPrice) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const tx = await auctionContract.placeRFQ(
        intentId,
        ethers.parseEther(rfqPrice)
      );
      await tx.wait();
      setSuccess("RFQ placed successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to place RFQ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Dutch Auction & RFQ</h1>
      <p className="text-gray-600 mb-6">
        Price starts high and decreases over time. Solvers can also submit fixed-price RFQs.
      </p>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Auction */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Create Dutch Auction</h2>
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
              <label className="block text-sm font-medium mb-1">Start Price (XDC)</label>
              <input
                type="text"
                value={startPrice}
                onChange={(e) => setStartPrice(e.target.value)}
                placeholder="e.g. 100"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Price (XDC)</label>
              <input
                type="text"
                value={endPrice}
                onChange={(e) => setEndPrice(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Duration (seconds)</label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 3600"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <button
              onClick={createAuction}
              disabled={loading || !signer}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : "Create Auction"}
            </button>
          </div>
        </div>

        {/* RFQ & Price Check */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Solver Actions</h2>
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
            <div className="flex gap-2">
              <button
                onClick={getCurrentPrice}
                disabled={loading || !signer}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                Get Current Price
              </button>
            </div>
            {currentPrice && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <span className="text-sm text-gray-600">Current Price:</span>
                <span className="ml-2 font-mono font-bold">{currentPrice} XDC</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Your RFQ Price (XDC)</label>
              <input
                type="text"
                value={rfqPrice}
                onChange={(e) => setRfqPrice(e.target.value)}
                placeholder="e.g. 75"
                className="w-full px-4 py-2 border rounded-lg"
              />
            </div>
            <button
              onClick={placeRFQ}
              disabled={loading || !signer}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : "Place RFQ"}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="font-semibold mb-2">How Dutch Auction Works</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          <li>Price starts at <strong>Start Price</strong> and linearly decreases to <strong>End Price</strong></li>
          <li>First solver to accept gets the intent at current price</li>
          <li>Solvers can also submit fixed-price RFQs (Request For Quote)</li>
          <li>Intent creator can accept the best RFQ at any time</li>
          <li>Price updates every block based on elapsed time</li>
        </ul>
      </div>
    </div>
  );
}
