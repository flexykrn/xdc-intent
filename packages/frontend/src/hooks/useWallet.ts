import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

// WalletConnect v2 Ethereum Provider
// Note: Requires @walletconnect/ethereum-provider package
// Install: npm install @walletconnect/ethereum-provider
// For now, WalletConnect is optional - falls back to injected wallet only

const XDC_TESTNET = {
  chainId: 51,
  name: "XDC Apothem Testnet",
  rpcUrl: "https://rpc.apothem.network",
  nativeCurrency: {
    name: "XDC",
    symbol: "XDC",
    decimals: 18,
  },
  blockExplorerUrl: "https://apothem.blocksscan.io",
};

// Project ID from WalletConnect Cloud (get one at https://cloud.walletconnect.com)
const WALLET_CONNECT_PROJECT_ID = "YOUR_PROJECT_ID";

interface WalletState {
  address: string | null;
  signer: ethers.JsonRpcSigner | null;
  provider: ethers.BrowserProvider | null;
  chainId: number | null;
  isConnected: boolean;
  walletType: "injected" | "walletconnect" | null;
}

// Lazy load WalletConnect to avoid SSR issues and missing package
let EthereumProvider: any = null;

async function loadWalletConnect() {
  if (!EthereumProvider) {
    try {
      // @ts-ignore - optional dependency
      const mod = await import("@walletconnect/ethereum-provider");
      EthereumProvider = mod.default;
    } catch (error) {
      console.warn("@walletconnect/ethereum-provider not installed");
    }
  }
  return EthereumProvider;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    signer: null,
    provider: null,
    chainId: null,
    isConnected: false,
    walletType: null,
  });

  const [isLoading, setIsLoading] = useState(false);

  // Check for existing connection on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (typeof window === "undefined") return;

    // Check injected wallet (MetaMask, etc.)
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          const signer = await provider.getSigner();
          const network = await provider.getNetwork();
          setState({
            address: accounts[0].address,
            signer,
            provider,
            chainId: Number(network.chainId),
            isConnected: true,
            walletType: "injected",
          });
        }
      } catch (error) {
        console.log("No injected wallet connected");
      }
    }
  };

  const connectInjected = async () => {
    if (typeof window === "undefined") return;

    if (!window.ethereum) {
      toast.error("No wallet found. Please install MetaMask or another wallet.");
      return;
    }

    setIsLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      // Check if on correct network
      if (Number(network.chainId) !== XDC_TESTNET.chainId) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x" + XDC_TESTNET.chainId.toString(16) }],
          });
        } catch (switchError: any) {
          // If network doesn't exist, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x" + XDC_TESTNET.chainId.toString(16),
                  chainName: XDC_TESTNET.name,
                  rpcUrls: [XDC_TESTNET.rpcUrl],
                  nativeCurrency: XDC_TESTNET.nativeCurrency,
                  blockExplorerUrls: [XDC_TESTNET.blockExplorerUrl],
                },
              ],
            });
          }
        }
      }

      setState({
        address,
        signer,
        provider,
        chainId: XDC_TESTNET.chainId,
        isConnected: true,
        walletType: "injected",
      });

      toast.success("Wallet connected!");
    } catch (error: any) {
      console.error("Connection error:", error);
      toast.error(error.message || "Failed to connect wallet");
    } finally {
      setIsLoading(false);
    }
  };

  const connectWalletConnect = async () => {
    if (typeof window === "undefined") return;

    if (WALLET_CONNECT_PROJECT_ID === "YOUR_PROJECT_ID") {
      toast.error("Please configure WalletConnect Project ID");
      return;
    }

    setIsLoading(true);
    try {
      const EthereumProvider = await loadWalletConnect();
      const wcProvider = await EthereumProvider.init({
        projectId: WALLET_CONNECT_PROJECT_ID,
        chains: [XDC_TESTNET.chainId],
        showQrModal: true,
        methods: ["eth_sendTransaction", "eth_sign", "personal_sign"],
        events: ["chainChanged", "accountsChanged"],
        metadata: {
          name: "XDC Intent Framework",
          description: "Intent-based trading on XDC Network",
          url: window.location.origin,
          icons: [window.location.origin + "/icon.png"],
        },
      });

      await wcProvider.enable();

      const provider = new ethers.BrowserProvider(wcProvider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      setState({
        address,
        signer,
        provider,
        chainId: Number(network.chainId),
        isConnected: true,
        walletType: "walletconnect",
      });

      // Listen for disconnect
      wcProvider.on("disconnect", () => {
        disconnect();
      });

      toast.success("Wallet connected via WalletConnect!");
    } catch (error: any) {
      console.error("WalletConnect error:", error);
      toast.error(error.message || "Failed to connect via WalletConnect");
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = useCallback(async () => {
    if (state.walletType === "walletconnect") {
      try {
        const EthereumProvider = await loadWalletConnect();
        const wcProvider = await EthereumProvider.init({
          projectId: WALLET_CONNECT_PROJECT_ID,
          chains: [XDC_TESTNET.chainId],
        });
        await wcProvider.disconnect();
      } catch (error) {
        console.log("WalletConnect disconnect error:", error);
      }
    }

    setState({
      address: null,
      signer: null,
      provider: null,
      chainId: null,
      isConnected: false,
      walletType: null,
    });

    toast.success("Wallet disconnected");
  }, [state.walletType]);

  const getBalance = async (tokenAddress?: string): Promise<string> => {
    if (!state.provider || !state.address) return "0";

    try {
      if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
        // Native XDC
        const balance = await state.provider.getBalance(state.address);
        return ethers.formatEther(balance);
      } else {
        // ERC-20 token
        const erc20Abi = [
          "function balanceOf(address owner) view returns (uint256)",
          "function decimals() view returns (uint8)",
        ];
        const contract = new ethers.Contract(tokenAddress, erc20Abi, state.provider);
        const balance = await contract.balanceOf(state.address);
        const decimals = await contract.decimals();
        return ethers.formatUnits(balance, decimals);
      }
    } catch (error) {
      console.error("Balance error:", error);
      return "0";
    }
  };

  return {
    ...state,
    isLoading,
    connectInjected,
    connectWalletConnect,
    disconnect,
    getBalance,
  };
}

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
