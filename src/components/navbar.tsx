"use client";

import Link from "next/link";
import { Home, PlusCircle, List, Globe, Cpu, Award, Puzzle, TrendingDown, Link2 } from "lucide-react";
import WalletButton from "./WalletButton";

export function Navbar() {
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
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <NavLink href="/solver-incentives" icon={<Award className="w-5 h-5" />} label="Incentives" />
            <NavLink href="/partial-fill" icon={<Puzzle className="w-5 h-5" />} label="Partial" />
            <NavLink href="/dutch-auction" icon={<TrendingDown className="w-5 h-5" />} label="Auction" />
            <NavLink href="/cross-chain" icon={<Link2 className="w-5 h-5" />} label="Bridge" />
          </nav>

          <div className="flex items-center gap-3">
            <WalletButton />
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
