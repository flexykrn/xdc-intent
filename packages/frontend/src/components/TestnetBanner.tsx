"use client";

import { AlertTriangle } from "lucide-react";

export default function TestnetBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[var(--warning)]/10 border-b border-[var(--warning)]/20">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-10 py-1.5 flex items-center justify-center gap-2 text-[11px] sm:text-xs font-medium text-[var(--warning)]">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>You are on XDC Apothem Testnet. Tokens have no real value.</span>
      </div>
    </div>
  );
}
