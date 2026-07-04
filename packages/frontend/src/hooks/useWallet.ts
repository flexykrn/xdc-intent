import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";

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

const WALLET_CONNECT_PROJECT_ID = "YOUR_PROJECT_ID";

interface WalletState {
  address: string | null;
  signer: ethers.JsonRpcSigner | null;
  provider: ethers.BrowserProvider | null;
  chainId: number | null;
  isConnected: boolean;
  walletType: "injected" | "walletconnect" | null;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  enable?: () => Promise<unknown[]>;
}

let EthereumProviderClass: typeof import("@walletconnect/ethereum-provider").default | null = null;

async function loadWalletConnect() {
  if (!EthereumProviderClass) {
    try {
      const mod = await import("@walletconnect/ethereum-provider");
      EthereumProviderClass = mod.default;
    } catch {
      console.warn("@walletconnect/ethereum-provider not installed");
      EthereumProviderClass = null;
    }
  }
  return EthereumProviderClass;
}

function getInjectedProvider(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
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

  const disconnect = useCallback(async () => {
    if (state.walletType === "walletconnect") {
      try {
        const ProviderClass = await loadWalletConnect();
        if (!ProviderClass) return;
        const wcProvider = await ProviderClass.init({
          projectId: WALLET_CONNECT_PROJECT_ID,
          chains: [XDC_TESTNET.chainId],
          showQrModal: false,
        });
        await wcProvider.disconnect();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Disconnect failed";
        console.log("WalletConnect disconnect error:", message);
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

  const checkConnection = useCallback(async () => {
    if (typeof window === "undefined") return;

    const injected = getInjectedProvider();
    if (injected) {
      try {
        const provider = new ethers.BrowserProvider(injected as ethers.Eip1193Provider);
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
      } catch {
        console.log("No injected wallet connected");
      }
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connectInjected = useCallback(async () => {
    if (typeof window === "undefined") return;

    const injected = getInjectedProvider();
    if (!injected) {
      toast.error("No wallet found. Please install MetaMask or another wallet.");
      return;
    }

    setIsLoading(true);
    try {
      const provider = new ethers.BrowserProvider(injected as ethers.Eip1193Provider);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      if (Number(network.chainId) !== XDC_TESTNET.chainId) {
        try {
          await injected.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x" + XDC_TESTNET.chainId.toString(16) }],
          });
        } catch (switchError) {
          const err = switchError instanceof Error ? switchError : new Error("Switch chain failed");
          if ((err as Error & { code?: number }).code === 4902) {
            await injected.request({
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect wallet";
      console.error("Connection error:", error);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connectWalletConnect = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (WALLET_CONNECT_PROJECT_ID === "YOUR_PROJECT_ID") {
      toast.error("Please configure WalletConnect Project ID");
      return;
    }

    setIsLoading(true);
    try {
      const ProviderClass = await loadWalletConnect();
      if (!ProviderClass) {
        toast.error("WalletConnect provider not available");
        return;
      }
      const wcProvider = await ProviderClass.init({
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

      wcProvider.on("disconnect", () => {
        disconnect();
      });

      toast.success("Wallet connected via WalletConnect!");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect via WalletConnect";
      console.error("WalletConnect error:", error);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [disconnect]);

  const getBalance = useCallback(async (tokenAddress?: string): Promise<string> => {
    if (!state.provider || !state.address) return "0";

    try {
      if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
        const balance = await state.provider.getBalance(state.address);
        return ethers.formatEther(balance);
      } else {
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
      const message = error instanceof Error ? error.message : "Balance fetch failed";
      console.error("Balance error:", message);
      return "0";
    }
  }, [state.provider, state.address]);

  return {
    ...state,
    isLoading,
    connectInjected,
    connectWalletConnect,
    disconnect,
    getBalance,
  };
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
