import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-[var(--border)]">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 lg:px-10 py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-[10px] bg-[var(--ink)]" />
            <span className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              XDCIntent
            </span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/agent" className="text-[13px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
              Agent
            </Link>
            <Link href="/my-intents" className="text-[13px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
              My Intents
            </Link>
            <Link href="/bridge" className="text-[13px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
              Bridge
            </Link>
            <a href="https://testnet.xdcscan.com" target="_blank" rel="noopener noreferrer" className="text-[13px] text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors">
              Explorer
            </a>
          </div>

          <p className="text-[13px] text-[var(--ink-4)] font-mono">
            © 2025 XDCIntent
          </p>
        </div>
      </div>
    </footer>
  );
}
