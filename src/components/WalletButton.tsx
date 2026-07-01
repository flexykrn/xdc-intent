"use client";

import { useState } from "react";
import { useWalletContext } from "@/components/WalletProvider";
import { Wallet, LogOut, ChevronDown, QrCode } from "lucide-react";

export default function WalletButton() {
  const { address, isConnected, isLoading, connectInjected, connectWalletConnect, disconnect } = useWalletContext();
  const [showOptions, setShowOptions] = useState(false);

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Wallet className="w-4 h-4" />
          <span className="hidden sm:inline">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <ChevronDown className="w-4 h-4" />
        </button>

        {showOptions && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
            <button
              onClick={() => {
                disconnect();
                setShowOptions(false);
              }}
              className="flex items-center gap-2 w-full px-4 py-2 text-red-600 hover:bg-gray-50"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowOptions(!showOptions)}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        <Wallet className="w-4 h-4" />
        {isLoading ? "Connecting..." : "Connect Wallet"}
      </button>

      {showOptions && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
          <button
            onClick={() => {
              connectInjected();
              setShowOptions(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 text-left"
          >
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
              <Wallet className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">MetaMask</div>
              <div className="text-sm text-gray-500">Browser extension</div>
            </div>
          </button>

          <div className="border-t border-gray-100 my-1" />

          <button
            onClick={() => {
              connectWalletConnect();
              setShowOptions(false);
            }}
            className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 text-left"
          >
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <QrCode className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">WalletConnect</div>
              <div className="text-sm text-gray-500">Mobile wallets</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
