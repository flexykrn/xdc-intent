"use client";

import { useState } from "react";
import { useWallet } from "@/components/providers";
import { ethers } from "ethers";
import { CONTRACTS, INTENT_REGISTRY_ABI, ERC20_ABI } from "@/lib/contracts";
import { ArrowRight, Loader2, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

const TOKEN_OPTIONS = [
  { address: "0x148D54159656D8D8c36240c7cD73ce80e239e137", symbol: "MOCK", name: "Mock Token" },
  { address: "0x0000000000000000000000000000000000000000", symbol: "XDC", name: "XDC Native" },
];

export default function CreateIntentPage() {
  const { isConnected, signer, address } = useWallet();
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [minOutput, setMinOutput] = useState("");
  const [expiry, setExpiry] = useState("1");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "approve" | "submit">("form");
  const [tokenBalance, setTokenBalance] = useState("0");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [allowance, setAllowance] = useState("0");

  const handleTokenChange = async (tokenAddress: string) => {
    setToken(tokenAddress);
    if (!signer || !address) return;

    try {
      if (tokenAddress === "0x0000000000000000000000000000000000000000") {
        setTokenSymbol("XDC");
        const balance = await signer.provider.getBalance(address);
        setTokenBalance(ethers.formatEther(balance));
        setAllowance("999999999");
        return;
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const [symbol, balance, decimals, allowed] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.balanceOf(address),
        tokenContract.decimals(),
        tokenContract.allowance(address, CONTRACTS.intentRegistry),
      ]);

      setTokenSymbol(symbol);
      setTokenBalance(ethers.formatUnits(balance, decimals));
      setAllowance(ethers.formatUnits(allowed, decimals));
    } catch (error) {
      console.error("Failed to load token info:", error);
    }
  };

  const handleApprove = async () => {
    if (!signer || !token) return;

    setLoading(true);
    try {
      if (token === "0x0000000000000000000000000000000000000000") {
        setStep("submit");
        return;
      }

      const tokenContract = new ethers.Contract(token, ERC20_ABI, signer);
      const amountWei = ethers.parseEther(amount);
      const tx = await tokenContract.approve(CONTRACTS.intentRegistry, amountWei);
      await tx.wait();

      toast.success("Token approved successfully!");
      setAllowance(amount);
      setStep("submit");
    } catch (error: any) {
      toast.error(error.message || "Approval failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !signer) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!token || !amount) {
      toast.error("Please fill in all fields");
      return;
    }

    const amountWei = ethers.parseEther(amount);
    const currentAllowance = ethers.parseEther(allowance || "0");

    if (currentAllowance < amountWei && token !== "0x0000000000000000000000000000000000000000") {
      setStep("approve");
      return;
    }

    setLoading(true);
    try {
      const intentId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "uint256", "uint256", "uint256"],
          [address, token, amountWei, ethers.parseEther(minOutput || "0"), Math.floor(Date.now() / 1000)]
        )
      );

      const expiryTimestamp = Math.floor(Date.now() / 1000) + parseInt(expiry) * 3600;

      const registry = new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, signer);
      const tx = await registry.createIntent(intentId, token, amountWei, expiryTimestamp);
      await tx.wait();

      toast.success("Intent created successfully!");
      setToken("");
      setAmount("");
      setMinOutput("");
      setStep("form");
      setTokenBalance("0");
      setAllowance("0");
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

      {step === "approve" && (
        <div className="bg-yellow-50 rounded-xl p-6 shadow-sm border border-yellow-200 mb-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">Approval Required</h3>
          <p className="text-yellow-700 mb-4">
            You need to approve the IntentRegistry to spend {amount} {tokenSymbol} on your behalf.
          </p>
          <button
            onClick={handleApprove}
            disabled={loading}
            className="bg-yellow-600 text-white px-6 py-2 rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Approve Token"}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Token</label>
          <select
            value={token}
            onChange={(e) => handleTokenChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={!isConnected || loading}
          >
            <option value="">Select a token</option>
            {TOKEN_OPTIONS.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol} - {t.name}
              </option>
            ))}
          </select>
          {token && (
            <p className="text-sm text-gray-500 mt-1">
              Balance: {parseFloat(tokenBalance).toFixed(4)} {tokenSymbol}
              {parseFloat(allowance) > 0 && (
                <span className="text-green-600 ml-2">
                  <CheckCircle className="w-4 h-4 inline" /> Approved
                </span>
              )}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={!isConnected || loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Output</label>
          <input
            type="number"
            value={minOutput}
            onChange={(e) => setMinOutput(e.target.value)}
            placeholder="99"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            disabled={!isConnected || loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Expiry (hours)</label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={!isConnected || loading}
          >
            <option value="1">1 hour</option>
            <option value="6">6 hours</option>
            <option value="24">24 hours</option>
            <option value="72">3 days</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!isConnected || loading || !token || !amount}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>
            Create Intent <ArrowRight className="w-5 h-5" />
          </>}
        </button>
      </form>
    </div>
  );
}
