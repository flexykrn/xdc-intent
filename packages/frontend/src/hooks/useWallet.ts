import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { XDC_NETWORK } from '../utils/contracts';

interface WalletState {
  address: string | null;
  balance: string;
  chainId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    balance: '0',
    chainId: null,
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);

  const checkConnection = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const balance = await provider.getBalance(address);
        const network = await provider.getNetwork();

        setProvider(provider);
        setSigner(signer);
        setState({
          address,
          balance: ethers.formatEther(balance),
          chainId: network.chainId.toString(),
          isConnected: true,
          isConnecting: false,
          error: null,
        });
      }
    } catch (err) {
      console.error('Error checking connection:', err);
    }
  }, []);

  useEffect(() => {
    checkConnection();

    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on('accountsChanged', checkConnection);
      window.ethereum.on('chainChanged', () => window.location.reload());
    }

    return () => {
      if (typeof window !== 'undefined' && window.ethereum) {
        window.ethereum.removeListener('accountsChanged', checkConnection);
      }
    };
  }, [checkConnection]);

  const connect = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setState(prev => ({ ...prev, error: 'No wallet detected. Please install MetaMask or XDC Pay.' }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      // Check if on correct network
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== XDC_NETWORK.chainId) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: XDC_NETWORK.chainId }],
          });
        } catch (switchError: any) {
          // If network doesn't exist, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [XDC_NETWORK],
            });
          } else {
            throw switchError;
          }
        }
      }

      await checkConnection();
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: err.message || 'Failed to connect wallet',
      }));
    }
  };

  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setState({
      address: null,
      balance: '0',
      chainId: null,
      isConnected: false,
      isConnecting: false,
      error: null,
    });
  };

  return {
    ...state,
    provider,
    signer,
    connect,
    disconnect,
  };
}

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
