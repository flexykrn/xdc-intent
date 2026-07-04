"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useWallet } from "@/components/providers";
import XDCLogo from "@/components/icons/XDCLogo";
import { truncateAddress } from "@/lib/utils";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Create Intent", href: "/create" },
  { label: "Market", href: "/market" },
  { label: "My Intents", href: "/my-intents" },
  { label: "Agent Demo", href: "/agent-demo" },
  { label: "Explorer", href: "https://testnet.xdcscan.com", external: true },
];

export default function Navbar() {
  const { isConnected, address, connect, disconnect } = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ${
        scrolled ? "bg-[var(--bg)]/90 backdrop-blur-xl border-b border-[var(--border)]" : ""
      }`}
    >
      <nav className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-10 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <XDCLogo size={34} />
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            XDCIntent
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="text-[14px] text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
              >
                {link.label}
              </Link>
            )
          )}
        </div>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <motion.button
              onClick={disconnect}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold surface-subtle text-[var(--ink)] hover:border-[var(--ink-2)] transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
              {truncateAddress(address, 4, 4)}
            </motion.button>
          ) : (
            <motion.button
              onClick={connect}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold btn-primary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Connect Wallet
            </motion.button>
          )}

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-[var(--ink)] hover:bg-black/5"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden bg-[var(--bg)]/95 backdrop-blur-xl border-b border-[var(--border)]"
          >
            <div className="px-5 py-4 space-y-1">
              {navLinks.map((link) =>
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-3 text-sm text-[var(--ink-2)] hover:text-[var(--ink)] rounded-xl hover:bg-black/5"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="block px-4 py-3 text-sm text-[var(--ink-2)] hover:text-[var(--ink)] rounded-xl hover:bg-black/5"
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                )
              )}
              {!isConnected && (
                <button
                  onClick={connect}
                  className="w-full mt-2 px-4 py-3 rounded-full text-sm font-semibold btn-primary"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
