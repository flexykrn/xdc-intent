"use client";

import { useState } from "react";
import { useWallet } from "@/components/providers";
import { ethers } from "ethers";
import { CONTRACTS, INTENT_REGISTRY_ABI, ERC20_ABI } from "@/lib/contracts";
import { ArrowRight, Loader2, CheckCircle, AlertTriangle, Info } from "lucide-react";
import toast from "react-hot-toast";

// Error parsing utilities
function parseRevertError(error: any): { title: string; message: string; action: string } {
  const reason = error?.reason || error?.message || "";
  const code = error?.code || "";
  
  // User rejected transaction
  if (code === "ACTION_REJECTED" || reason.includes("user rejected")) {
    return {
      title: "Transaction Rejected",
      message: "You rejected the transaction in your wallet.",
      action: "Try again when ready."
    };
  }
  
  // Insufficient balance
  if (reason.includes("insufficient funds") || reason.includes("Insufficient balance")) {
    return {
      title: "Insufficient Balance",
      message: "You don't have enough tokens for this transaction.",
      action: "Add more funds to your wallet or reduce the amount."
    };
  }
  
  // Allowance too low
  if (reason.includes("allowance") || reason.includes("ERC20: transfer amount exceeds allowance")) {
    return {
      title: "Approval Required",
      message: "The IntentRegistry doesn't have permission to spend your tokens.",
      action: "Approve the token first before creating the intent."
    };
  }
  
  // Gas estimation failed
  if (reason.includes("gas required exceeds allowance") || reason.includes("cannot estimate gas")) {
    return {
      title: "Gas Estimation Failed",
      message: "The transaction may fail. Check your inputs and balance.",
      action: "Ensure you have enough XDC for gas fees."
    };
  }
  
  // Network errors
  if (reason.includes("network") || reason.includes("timeout") || reason.includes("ECONNREFUSED")) {
    return {
      title: "Network Error",
      message: "Failed to connect to the XDC network.",
      action: "Check your internet connection and try again."
    };
  }
  
  // Intent already exists
  if (reason.includes("Intent already exists")) {
    return {
      title: "Intent Already Exists",
      message: "An intent with this ID already exists.",
      action: "Try again with different parameters."
    };
  }
  
  // Expired
  if (reason.includes("expired") || reason.includes("deadline")) {
    return {
      title: "Intent Expired",
      message: "The intent has expired or the deadline has passed.",
      action: "Create a new intent with a longer expiry."
    };
  }
  
  // Generic fallback
  return {
    title: "Transaction Failed",
    message: reason.length > 100 ? reason.slice(0, 100) + "..." : reason,
    action: "Check your inputs and try again."
  };
}

// Error display component
function ErrorDisplay({ error, onDismiss }: { error: any; onDismiss: () => void }) {
  const parsed = parseRevertError(error);
  
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-800 mb-1">{parsed.title}</h3>
          <p className="text-red-700 mb-2">{parsed.message}</p>
          <p className="text-sm text-red-600">
            <Info className="w-4 h-4 inline mr-1" />
            {parsed.action}
          </p>
        </div>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600">
          ✕
        </button>
      </div>
    </div>
  );
}

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
  const [error, setError] = useState<any>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleTokenChange = async (tokenAddress: string) => {
    setToken(tokenAddress);
    setError(null);
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
        tokenContract.symbol().catch(() => "???"),
        tokenContract.balanceOf(address).catch(() => 0),
        tokenContract.decimals().catch(() => 18),
        tokenContract.allowance(address, CONTRACTS.intentRegistry).catch(() => 0),
      ]);

      setTokenSymbol(symbol);
      setTokenBalance(ethers.formatUnits(balance, decimals));
      setAllowance(ethers.formatUnits(allowed, decimals));
    } catch (error) {
      console.error("Failed to load token info:", error);
      setTokenSymbol("???");
      setTokenBalance("0");
      setAllowance("0");
    }
  };

  const handleApprove = async () => {
    if (!signer || !token) return;

    setLoading(true);
    setError(null);
    setTxHash(null);
    try {
      if (token === "0x0000000000000000000000000000000000000000") {
        setStep("submit");
        return;
      }

      const tokenContract = new ethers.Contract(token, ERC20_ABI, signer);
      const amountWei = ethers.parseEther(amount);
      const tx = await tokenContract.approve(CONTRACTS.intentRegistry, amountWei);
      
      setTxHash(tx.hash);
      toast.loading("Approval pending...", { id: "approve" });
      
      await tx.wait();

      toast.success("Token approved successfully!", { id: "approve" });
      setAllowance(amount);
      setStep("submit");
    } catch (error: any) {
      setError(error);
      toast.dismiss("approve");
      const parsed = parseRevertError(error);
      toast.error(parsed.title);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTxHash(null);
    
    if (!isConnected || !signer) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!token || !amount) {
      toast.error("Please fill in all fields");
      return;
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    const balanceNum = parseFloat(tokenBalance);
    if (amountNum > balanceNum) {
      toast.error(`Insufficient balance. You have ${balanceNum.toFixed(4)} ${tokenSymbol}`);
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
      
      // Estimate gas first
      let gasLimit;
      try {
        gasLimit = await registry.createIntent.estimateGas(intentId, token, amountWei, expiryTimestamp);
        gasLimit = Number(gasLimit);
        gasLimit = (gasLimit * 120) / 100; // Add 20% buffer
      } catch (gasError) {
        console.warn("Gas estimation failed, using default:", gasError);
        gasLimit = 500000; // Default gas limit
      }
      
      const tx = await registry.createIntent(intentId, token, amountWei, expiryTimestamp, {
        gasLimit
      });
      
      setTxHash(tx.hash);
      toast.loading("Creating intent...", { id: "create" });
      
      await tx.wait();

      toast.success("Intent created successfully!", { id: "create" });
      setToken("");
      setAmount("");
      setMinOutput("");
      setStep("form");
      setTokenBalance("0");
      setAllowance("0");
    } catch (error: any) {
      setError(error);
      toast.dismiss("create");
      const parsed = parseRevertError(error);
      toast.error(parsed.title);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Create Intent</h1>

      {!isConnected && (
        <div className="bg-blue-50 rounded-xl p-8 shadow-sm border border-blue-200 mb-6 text-center">
          <p className="text-blue-700 mb-4">Connect your wallet to create intents</p>
          <p className="text-sm text-blue-600">
            You need a Web3 wallet like MetaMask or WalletConnect to interact with the XDC network.
          </p>
        </div>
      )}

      {error && <ErrorDisplay error={error} onDismiss={() => setError(null)} />}

      {txHash && !error && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-green-800 font-medium">Transaction submitted!</p>
              <a 
                href={`https://apothem.blocksscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-600 hover:underline"
              >
                View on explorer → {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </div>
          </div>
        </div>
      )}

      {step === "approve" && (
        <div className="bg-yellow-50 rounded-xl p-6 shadow-sm border border-yellow-200 mb-6">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">Approval Required</h3>
          <p className="text-yellow-700 mb-4">
            You need to approve the IntentRegistry to spend {amount} {tokenSymbol} on your behalf.
          </p>
          <div className="text-sm text-yellow-600 mb-4">
            <Info className="w-4 h-4 inline mr-1" />
            This is a one-time approval per token. Future intents won't need this step.
          </div>
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
