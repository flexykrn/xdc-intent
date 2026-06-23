"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ethers } from "ethers";
import { RPC_URL } from "@/lib/contracts";

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isConnecting: false,
  connect: async () => {},
  disconnect: () => {},
  provider: null,
  signer: null,
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const eth = (window as any).ethereum;
      eth.on("accountsChanged", (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          setAddress(accounts[0]);
          setIsConnected(true);
        }
      });
      eth.on("chainChanged", () => {
        window.location.reload();
      });
    }
  }, []);

  const connect = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      alert("Please install MetaMask or XDC Pay");
      return;
    }

    setIsConnecting(true);
    try {
      const eth = (window as any).ethereum;
      const accounts = await eth.request({ method: "eth_requestAccounts" });

      if (accounts.length === 0) {
        throw new Error("No accounts found");
      }

      const browserProvider = new ethers.BrowserProvider(eth);
      const network = await browserProvider.getNetwork();

      if (Number(network.chainId) !== 51) {
        try {
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x33" }],
          });
        } catch {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x33",
              chainName: "XDC Apothem Testnet",
              nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: ["https://testnet.xdcscan.com"],
            }],
          });
        }
      }

      const newSigner = await browserProvider.getSigner();
      setProvider(browserProvider);
      setSigner(newSigner);
      setAddress(accounts[0]);
      setIsConnected(true);
    } catch (error: any) {
      console.error("Wallet connection failed:", error);
      alert(error.message || "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setIsConnected(false);
    setProvider(null);
    setSigner(null);
  };

  return (
    <WalletContext.Provider value={{ address, isConnected, isConnecting, connect, disconnect, provider, signer }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
