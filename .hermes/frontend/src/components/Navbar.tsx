import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Wallet, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../contexts/ThemeContext';

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Swap', path: '/swap' },
  { label: 'My Intents', path: '/intents' },
  { label: 'Explorer', path: '/explorer' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const location = useLocation();
  const { theme } = useTheme();

  const isDark = theme === 'dark';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between h-16 px-6 rounded-2xl"
          style={{
            background: isDark ? 'rgba(10, 10, 15, 0.7)' : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(20px)',
            border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)',
            boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.1)',
          }}
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <motion.div 
              className="relative w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #2449D8, #00D4FF)' }}
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              <Zap size={20} className="text-white" />
            </motion.div>
            <span className={`font-bold text-lg tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
              XDC<span style={{ color: '#00D4FF' }}>Intent</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  location.pathname === link.path
                    ? isDark ? 'text-white bg-white/10' : 'text-gray-900 bg-gray-900/10'
                    : isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-900/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            
            <motion.button
              onClick={() => setWalletConnected(!walletConnected)}
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                background: walletConnected
                  ? isDark ? 'rgba(0, 212, 255, 0.15)' : 'rgba(36, 73, 216, 0.1)'
                  : 'linear-gradient(135deg, #2449D8, #00D4FF)',
                border: walletConnected 
                  ? isDark ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid rgba(36, 73, 216, 0.2)'
                  : 'none',
                color: walletConnected 
                  ? isDark ? '#00D4FF' : '#2449D8'
                  : '#ffffff',
                boxShadow: walletConnected ? 'none' : '0 4px 20px rgba(36, 73, 216, 0.4)',
              }}
            >
              <Wallet size={16} />
              {walletConnected ? '0x7a3f...e8b2' : 'Connect Wallet'}
            </motion.button>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`md:hidden transition-colors p-2 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </motion.div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="md:hidden mt-2 rounded-2xl overflow-hidden"
              style={{
                background: isDark ? 'rgba(10, 10, 15, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)',
              }}
            >
              <div className="p-4 space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      location.pathname === link.path
                        ? isDark ? 'text-white bg-white/10' : 'text-gray-900 bg-gray-900/10'
                        : isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-900/5'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <motion.button
                  onClick={() => {
                    setWalletConnected(!walletConnected);
                    setMobileOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold mt-2"
                  whileTap={{ scale: 0.95 }}
                  style={{
                    background: 'linear-gradient(135deg, #2449D8, #00D4FF)',
                    color: '#ffffff',
                  }}
                >
                  <Wallet size={16} />
                  {walletConnected ? '0x7a3f...e8b2' : 'Connect Wallet'}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
