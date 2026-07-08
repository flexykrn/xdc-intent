"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Copy, LogOut, AlertTriangle } from "lucide-react";
import { useWallet } from "@/components/providers";
import XDCLogo from "@/components/icons/XDCLogo";
import { truncateAddress } from "@/lib/utils";
import toast from "react-hot-toast";

const appLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Create", href: "/create" },
  { label: "Market", href: "/market" },
  { label: "My Intents", href: "/my-intents" },
  { label: "Bridge", href: "/bridge" },
  { label: "Agent", href: "/agent-demo" },
];

const externalLinks = [
  { label: "Explorer", href: "https://testnet.xdcscan.com" },
];

export default function Navbar() {
  const { isConnected, address, connect, disconnect, switchChain, isCorrectChain, isConnecting } = useWallet();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <header
      className={`fixed top-7 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-[var(--bg)]/95 backdrop-blur-xl border-b border-[var(--border)] shadow-sm" : "bg-transparent"
      }`}
    >
      <nav className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-10 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <XDCLogo size={30} />
          <span className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            XDCIntent
          </span>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] text-[10px] font-semibold border border-[var(--warning)]/20">
            Testnet
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {appLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${
                isActive(link.href)
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--bg-3)]"
              }`}
            >
              {link.label}
            </Link>
          ))}
          {externalLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-full text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--bg-3)] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="hidden sm:flex items-center gap-2">
              {!isCorrectChain ? (
                <motion.button
                  onClick={switchChain}
                  disabled={isConnecting}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-semibold bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20 hover:bg-[var(--error)]/20 transition-colors disabled:opacity-50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {isConnecting ? "Switching..." : "Switch to Apothem"}
                </motion.button>
              ) : (
                <>
                  <motion.button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-full text-[12px] font-semibold surface-subtle text-[var(--ink)] hover:border-[var(--ink-2)] transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    title="Copy address"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                    {truncateAddress(address, 4, 4)}
                    <Copy className="w-3.5 h-3.5 text-[var(--ink-3)]" />
                  </motion.button>
                  <motion.button
                    onClick={disconnect}
                    className="p-2 rounded-full surface-subtle text-[var(--ink-3)] hover:text-[var(--error)] hover:border-[var(--error)]/30 transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    title="Disconnect"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </motion.button>
                </>
              )}
            </div>
          ) : (
            <motion.button
              onClick={connect}
              disabled={isConnecting}
              className="px-4 py-2 rounded-full text-[12px] font-semibold btn-primary disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
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
            className="md:hidden overflow-hidden bg-[var(--bg)]/98 backdrop-blur-xl border-b border-[var(--border)]"
          >
            <div className="px-5 py-4 space-y-1">
              {appLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`block px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                    isActive(link.href)
                      ? "bg-[var(--ink)] text-[var(--bg)]"
                      : "text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--bg-3)]"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {externalLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:text-[var(--ink)] rounded-xl hover:bg-[var(--bg-3)]"
                >
                  {link.label}
                </a>
              ))}
              {isConnected ? (
                <div className="pt-2 space-y-2">
                  {!isCorrectChain ? (
                    <button
                      onClick={switchChain}
                      disabled={isConnecting}
                      className="w-full px-4 py-3 rounded-full text-sm font-semibold bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20 disabled:opacity-50"
                    >
                      {isConnecting ? "Switching..." : "Switch to Apothem"}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleCopy}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-semibold surface-subtle text-[var(--ink)]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                        {truncateAddress(address, 4, 4)}
                        <Copy className="w-3.5 h-3.5 text-[var(--ink-3)]" />
                      </button>
                      <button
                        onClick={disconnect}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full text-sm font-semibold surface-subtle text-[var(--error)]"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="w-full mt-2 px-4 py-3 rounded-full text-sm font-semibold btn-primary disabled:opacity-50"
                >
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
