"use client";

import Link from "next/link";
import { useWallet } from "@/components/providers";
import { Home, PlusCircle, List, Globe, Cpu, Wallet } from "lucide-react";

export function Navbar() {
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">X</span>
            </div>
            <span className="text-xl font-bold text-gray-900 hidden sm:block">XDC Intent</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink href="/" icon={<Home className="w-5 h-5" />} label="Home" />
            <NavLink href="/create" icon={<PlusCircle className="w-5 h-5" />} label="Create" />
            <NavLink href="/my-intents" icon={<List className="w-5 h-5" />} label="My Intents" />
            <NavLink href="/explorer" icon={<Globe className="w-5 h-5" />} label="Explorer" />
            <NavLink href="/solver" icon={<Cpu className="w-5 h-5" />} label="Solver" />
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => isConnected ? disconnect() : connect()}
              disabled={isConnecting}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isConnected
                  ? "bg-green-50 text-green-700 hover:bg-green-100"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              <Wallet className="w-4 h-4" />
              {isConnecting ? "Connecting..." : isConnected ? `${address?.slice(0, 6)}...${address?.slice(-4)}` : "Connect Wallet"}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}
