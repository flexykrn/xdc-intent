"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { ethers } from "ethers";
import { XDCIntentSDK } from "@xdc-intent/sdk";
import { CHAIN_METADATA, SUPPORTED_CHAIN_IDS, DEFAULT_CHAIN_ID, getContractAddresses } from "@/lib/contracts";

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isCorrectChain: boolean;
  chainId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (targetChainId: number) => Promise<void>;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  sdk: XDCIntentSDK | null;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface WindowWithEthereum {
  ethereum?: EthereumProvider;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  isConnecting: false,
  isCorrectChain: false,
  chainId: null,
  connect: async () => {},
  disconnect: () => {},
  switchChain: async () => {},
  provider: null,
  signer: null,
  sdk: null,
});

function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as WindowWithEthereum).ethereum;
}

async function addNetwork(eth: EthereumProvider, chainId: number) {
  const meta = CHAIN_METADATA[chainId];
  if (!meta) throw new Error(`No chain metadata for ${chainId}`);
  await eth.request({
    method: "wallet_addEthereumChain",
    params: [meta],
  });
}

async function promptSwitchNetwork(eth: EthereumProvider, chainId: number) {
  const chainIdHex = `0x${chainId.toString(16)}`;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch {
    await addNetwork(eth, chainId);
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [sdk, setSdk] = useState<XDCIntentSDK | null>(null);

  const isCorrectChain = chainId !== null && SUPPORTED_CHAIN_IDS.includes(chainId);

  const reset = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
    setChainId(null);
    setProvider(null);
    setSigner(null);
    setSdk(null);
  }, []);

  const disconnect = useCallback(() => {
    reset();
  }, [reset]);

  const buildSdk = useCallback((browserProvider: ethers.BrowserProvider, newSigner: ethers.JsonRpcSigner, targetChainId: number) => {
    const addresses = getContractAddresses(targetChainId);
    const newSdk = new XDCIntentSDK({
      provider: browserProvider,
      signer: newSigner,
      chainId: targetChainId,
      contractAddresses: {
        intentRegistry: addresses.intentRegistry,
        escrow: addresses.escrow,
        paymentVerifier: addresses.paymentVerifier,
      },
    });
    setSdk(newSdk);
  }, []);

  const initializeFromProvider = useCallback(async (browserProvider: ethers.BrowserProvider) => {
    const network = await browserProvider.getNetwork();
    const currentChainId = Number(network.chainId);
    setChainId(currentChainId);

    if (!SUPPORTED_CHAIN_IDS.includes(currentChainId)) {
      setProvider(browserProvider);
      setSigner(null);
      setSdk(null);
      setIsConnected(true);
      return;
    }

    const newSigner = await browserProvider.getSigner();
    const newAddress = await newSigner.getAddress();
    buildSdk(browserProvider, newSigner, currentChainId);
    setProvider(browserProvider);
    setSigner(newSigner);
    setAddress(newAddress);
    setIsConnected(true);
  }, [buildSdk]);

  const switchChain = useCallback(async (targetChainId: number) => {
    const eth = getEthereum();
    if (!eth) return;
    if (!SUPPORTED_CHAIN_IDS.includes(targetChainId)) {
      alert(`Chain ${targetChainId} is not supported`);
      return;
    }
    setIsConnecting(true);
    try {
      await promptSwitchNetwork(eth, targetChainId);
      const browserProvider = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
      await initializeFromProvider(browserProvider);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch network";
      console.error("Switch chain failed:", error);
      alert(message);
    } finally {
      setIsConnecting(false);
    }
  }, [initializeFromProvider]);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      alert("Please install MetaMask or XDC Pay");
      return;
    }

    setIsConnecting(true);
    try {
      const accountsResponse = await eth.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accountsResponse) || accountsResponse.length === 0) {
        throw new Error("No accounts found");
      }
      const accounts = accountsResponse.filter((a): a is string => typeof a === "string");
      if (accounts.length === 0) throw new Error("No accounts found");

      let browserProvider = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      if (!SUPPORTED_CHAIN_IDS.includes(currentChainId)) {
        await promptSwitchNetwork(eth, DEFAULT_CHAIN_ID);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        browserProvider = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
        const newNetwork = await browserProvider.getNetwork();
        if (!SUPPORTED_CHAIN_IDS.includes(Number(newNetwork.chainId))) {
          throw new Error("Please switch to a supported testnet");
        }
      }

      await initializeFromProvider(browserProvider);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect wallet";
      console.error("Wallet connection failed:", error);
      alert(message);
      reset();
    } finally {
      setIsConnecting(false);
    }
  }, [initializeFromProvider, reset]);

  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      if (!Array.isArray(accounts) || accounts.length === 0) {
        reset();
      } else if (typeof accounts[0] === "string") {
        setAddress(accounts[0]);
      }
    };

    const handleChainChanged = (...args: unknown[]) => {
      const newChainId = typeof args[0] === "string" ? parseInt(args[0], 16) : null;
      setChainId(newChainId);
      if (newChainId !== null && SUPPORTED_CHAIN_IDS.includes(newChainId) && provider) {
        initializeFromProvider(provider).catch(console.error);
      } else if (newChainId !== null && !SUPPORTED_CHAIN_IDS.includes(newChainId)) {
        setSigner(null);
        setSdk(null);
      }
    };

    const handleDisconnect = () => {
      reset();
    };

    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);
    if (typeof (eth as unknown as { on: (event: string, handler: () => void) => void }).on === "function") {
      (eth as unknown as { on: (event: string, handler: () => void) => void }).on("disconnect", handleDisconnect);
    }

    return () => {
      if (eth.removeListener) {
        eth.removeListener("accountsChanged", handleAccountsChanged);
        eth.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [provider, initializeFromProvider, reset]);

  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;

    let cancelled = false;
    async function autoConnect() {
      try {
        if (!eth) return;
        const accountsResponse = await eth.request({ method: "eth_accounts" });
        if (!Array.isArray(accountsResponse) || accountsResponse.length === 0) return;
        if (cancelled) return;
        await connect();
      } catch (error) {
        console.log("Auto-connect not available", error);
      }
    }
    autoConnect();
    return () => {
      cancelled = true;
    };
  }, [connect]);

  return (
    <WalletContext.Provider value={{ address, isConnected, isConnecting, isCorrectChain, chainId, connect, disconnect, switchChain, provider, signer, sdk }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
