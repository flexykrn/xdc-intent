"use client";

import { createContext, useContext, ReactNode } from "react";
import { useWallet } from "@/hooks/useWallet";

const WalletContext = createContext<ReturnType<typeof useWallet> | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  return (
    <WalletContext.Provider value={wallet}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used within WalletProvider");
  }
  return context;
}
