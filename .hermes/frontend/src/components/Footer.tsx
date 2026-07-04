import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

export default function Footer() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <footer className="relative z-10" style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #2449D8, #00D4FF)' }}
              >
                <Zap size={20} className="text-white" />
              </div>
              <span className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                XDC<span style={{ color: '#00D4FF' }}>Intent</span>
              </span>
            </Link>
            <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
              Intent-based swap protocol on XDC Network. Universal liquidity, minimal slippage, maximum efficiency.
            </p>
          </div>

          {/* Protocol */}
          <div>
            <h4 className={`font-bold text-sm mb-5 ${isDark ? 'text-white' : 'text-gray-900'}`}>Protocol</h4>
            <ul className="space-y-3">
              {['Swap', 'My Intents', 'Explorer', 'Governance'].map((item) => (
                <li key={item}>
                  <a href="#" className={`text-sm transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}>
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className={`font-bold text-sm mb-5 ${isDark ? 'text-white' : 'text-gray-900'}`}>Resources</h4>
            <ul className="space-y-3">
              {['Documentation', 'API Reference', 'GitHub', 'Bug Bounty'].map((item) => (
                <li key={item}>
                  <a href="#" className={`text-sm transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}>
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className={`font-bold text-sm mb-5 ${isDark ? 'text-white' : 'text-gray-900'}`}>Community</h4>
            <ul className="space-y-3">
              {['Twitter / X', 'Discord', 'Telegram', 'Forum'].map((item) => (
                <li key={item}>
                  <a href="#" className={`text-sm transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'}`}>
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={`mt-16 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 ${isDark ? 'border-t border-white/5' : 'border-t border-black/5'}`}>
          <p className={`text-sm ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>
            © 2025 XDCIntent. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className={`text-sm transition-colors ${isDark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-500 hover:text-gray-700'}`}>
              Terms
            </a>
            <a href="#" className={`text-sm transition-colors ${isDark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-500 hover:text-gray-700'}`}>
              Privacy
            </a>
            <a href="#" className={`text-sm transition-colors ${isDark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-500 hover:text-gray-700'}`}>
              Security
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
