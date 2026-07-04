import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownUp,
  ChevronDown,
  Clock,
  AlertCircle,
  CheckCircle,
  Info,
  Zap,
  Wallet,
} from 'lucide-react';
import Card3D from '../components/Card3D';
import FloatingOrb from '../components/FloatingOrb';
import { useTheme } from '../contexts/ThemeContext';
import { mockTokens } from '../lib/mockData';

const expiryOptions = [
  { label: '1 Hour', value: '1h' },
  { label: '6 Hours', value: '6h' },
  { label: '24 Hours', value: '24h' },
  { label: '3 Days', value: '3d' },
];

export default function SwapPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  const [fromToken, setFromToken] = useState(mockTokens[0]);
  const [toToken, setToToken] = useState(mockTokens[2]);
  const [fromAmount, setFromAmount] = useState('');
  const [minOutput, setMinOutput] = useState('');
  const [expiry, setExpiry] = useState('24h');
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [showExpiryDropdown, setShowExpiryDropdown] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateIntent = () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setStatus('success');
      setFromAmount('');
      setMinOutput('');
      setTimeout(() => setStatus('idle'), 4000);
    }, 1500);
  };

  return (
    <div className="relative z-10 min-h-screen pt-32 pb-20 px-4 overflow-hidden">
      {/* Floating Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <FloatingOrb size={350} color="radial-gradient(circle, rgba(36, 73, 216, 0.3), transparent)" x="15%" y="25%" delay={0} />
        <FloatingOrb size={300} color="radial-gradient(circle, rgba(0, 212, 255, 0.25), transparent)" x="75%" y="40%" delay={3} />
      </div>

      <div className="max-w-lg mx-auto relative z-10">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className={`text-4xl sm:text-5xl font-black mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Create Intent
          </h1>
          <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Define your swap parameters and let solvers find the best rate
          </p>
        </motion.div>

        {/* Swap Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card3D intensity={8}>
            <div
              className="rounded-3xl p-8 sm:p-10 relative overflow-hidden"
              style={{
                background: isDark
                  ? 'rgba(10, 10, 15, 0.85)'
                  : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                boxShadow: isDark ? '0 20px 80px rgba(0,0,0,0.5)' : '0 20px 80px rgba(0,0,0,0.15)',
              }}
            >
              {/* Background gradient */}
              <div
                className="absolute top-0 right-0 w-64 h-64 opacity-20 blur-3xl"
                style={{
                  background: 'radial-gradient(circle, rgba(36, 73, 216, 0.4), transparent)',
                }}
              />

              <div className="relative z-10">
                {/* From Token */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className={`text-sm font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      From
                    </label>
                    <span className={`text-xs flex items-center gap-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      <Wallet size={12} />
                      Balance: {fromToken.balance.toLocaleString()} {fromToken.symbol}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-3 p-5 rounded-2xl"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                    }}
                  >
                    <div className="relative">
                      <motion.button
                        onClick={() => {
                          setShowFromDropdown(!showFromDropdown);
                          setShowToDropdown(false);
                          setShowExpiryDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors ${
                          isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="text-xl">{fromToken.icon}</span>
                        <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {fromToken.symbol}
                        </span>
                        <ChevronDown size={14} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
                      </motion.button>
                      <AnimatePresence>
                        {showFromDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            className="absolute top-full left-0 mt-2 w-56 rounded-2xl overflow-hidden z-50"
                            style={{
                              background: isDark ? 'rgba(15, 15, 20, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                              backdropFilter: 'blur(20px)',
                              border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                            }}
                          >
                            {mockTokens.map((token) => (
                              <button
                                key={token.symbol}
                                onClick={() => {
                                  setFromToken(token);
                                  setShowFromDropdown(false);
                                }}
                                className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left ${
                                  isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                                }`}
                              >
                                <span className="text-xl">{token.icon}</span>
                                <div>
                                  <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {token.symbol}
                                  </div>
                                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                    {token.name}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <input
                      type="number"
                      value={fromAmount}
                      onChange={(e) => setFromAmount(e.target.value)}
                      placeholder="0.00"
                      className={`flex-1 bg-transparent text-2xl font-bold text-right outline-none ${
                        isDark ? 'text-white placeholder:text-gray-600' : 'text-gray-900 placeholder:text-gray-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Swap Direction */}
                <div className="flex justify-center my-4">
                  <motion.button
                    onClick={() => {
                      const temp = fromToken;
                      setFromToken(toToken);
                      setToToken(temp);
                    }}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{
                      background: isDark ? 'rgba(36, 73, 216, 0.2)' : 'rgba(36, 73, 216, 0.1)',
                      border: isDark ? '1px solid rgba(36, 73, 216, 0.3)' : '1px solid rgba(36, 73, 216, 0.2)',
                    }}
                    whileHover={{ scale: 1.1, rotate: 180 }}
                    whileTap={{ scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    <ArrowDownUp size={20} style={{ color: '#00D4FF' }} />
                  </motion.button>
                </div>

                {/* To Token */}
                <div className="mb-7">
                  <div className="flex items-center justify-between mb-3">
                    <label className={`text-sm font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      To (Minimum Output)
                    </label>
                  </div>
                  <div
                    className="flex items-center gap-3 p-5 rounded-2xl"
                    style={{
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                    }}
                  >
                    <div className="relative">
                      <motion.button
                        onClick={() => {
                          setShowToDropdown(!showToDropdown);
                          setShowFromDropdown(false);
                          setShowExpiryDropdown(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors ${
                          isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'
                        }`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <span className="text-xl">{toToken.icon}</span>
                        <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {toToken.symbol}
                        </span>
                        <ChevronDown size={14} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
                      </motion.button>
                      <AnimatePresence>
                        {showToDropdown && (
                          <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            className="absolute top-full left-0 mt-2 w-56 rounded-2xl overflow-hidden z-50"
                            style={{
                              background: isDark ? 'rgba(15, 15, 20, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                              backdropFilter: 'blur(20px)',
                              border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                            }}
                          >
                            {mockTokens.map((token) => (
                              <button
                                key={token.symbol}
                                onClick={() => {
                                  setToToken(token);
                                  setShowToDropdown(false);
                                }}
                                className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left ${
                                  isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                                }`}
                              >
                                <span className="text-xl">{token.icon}</span>
                                <div>
                                  <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {token.symbol}
                                  </div>
                                  <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                    {token.name}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <input
                      type="number"
                      value={minOutput}
                      onChange={(e) => setMinOutput(e.target.value)}
                      placeholder="0.00"
                      className={`flex-1 bg-transparent text-2xl font-bold text-right outline-none ${
                        isDark ? 'text-white placeholder:text-gray-600' : 'text-gray-900 placeholder:text-gray-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Expiry */}
                <div className="mb-7">
                  <label className={`text-sm font-semibold flex items-center gap-2 mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <Clock size={14} />
                    Intent Expiry
                  </label>
                  <div className="relative">
                    <motion.button
                      onClick={() => {
                        setShowExpiryDropdown(!showExpiryDropdown);
                        setShowFromDropdown(false);
                        setShowToDropdown(false);
                      }}
                      className="w-full flex items-center justify-between p-5 rounded-2xl transition-colors"
                      style={{
                        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                        border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {expiryOptions.find((o) => o.value === expiry)?.label}
                      </span>
                      <ChevronDown size={18} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
                    </motion.button>
                    <AnimatePresence>
                      {showExpiryDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-50"
                          style={{
                            background: isDark ? 'rgba(15, 15, 20, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                            backdropFilter: 'blur(20px)',
                            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                          }}
                        >
                          {expiryOptions.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setExpiry(option.value);
                                setShowExpiryDropdown(false);
                              }}
                              className={`w-full flex items-center px-5 py-4 transition-colors text-left ${
                                isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                              } ${expiry === option.value ? (isDark ? 'bg-white/5' : 'bg-black/5') : ''}`}
                            >
                              <span
                                className={`text-sm font-semibold ${
                                  expiry === option.value
                                    ? 'text-[#00D4FF]'
                                    : isDark ? 'text-white' : 'text-gray-900'
                                }`}
                              >
                                {option.label}
                              </span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Info Box */}
                <div
                  className="flex items-start gap-3 p-5 rounded-2xl mb-7"
                  style={{
                    background: isDark ? 'rgba(36, 73, 216, 0.08)' : 'rgba(36, 73, 216, 0.05)',
                    border: isDark ? '1px solid rgba(36, 73, 216, 0.2)' : '1px solid rgba(36, 73, 216, 0.15)',
                  }}
                >
                  <Info size={18} className="text-[#00D4FF] mt-0.5 shrink-0" />
                  <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Your intent will be broadcast to the solver network. Solvers compete to fill your order at the best rate. No gas fees until execution.
                  </p>
                </div>

                {/* Status Messages */}
                <AnimatePresence>
                  {status === 'success' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="flex items-center gap-3 p-5 rounded-2xl mb-7"
                      style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                      }}
                    >
                      <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                      <span className="text-emerald-400 text-sm font-semibold">
                        Intent created successfully! Solvers are now competing to fill your order.
                      </span>
                    </motion.div>
                  )}
                  {status === 'error' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      className="flex items-center gap-3 p-5 rounded-2xl mb-7"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                      }}
                    >
                      <AlertCircle size={20} className="text-red-400 shrink-0" />
                      <span className="text-red-400 text-sm font-semibold">
                        Please enter a valid amount greater than 0.
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit Button */}
                <motion.button
                  onClick={handleCreateIntent}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-3 px-8 py-5 rounded-2xl text-white font-bold text-lg disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, #2449D8, #00D4FF)',
                    boxShadow: '0 10px 50px rgba(36, 73, 216, 0.4)',
                  }}
                  whileHover={!isSubmitting ? { scale: 1.02, boxShadow: '0 15px 60px rgba(36, 73, 216, 0.5)' } : {}}
                  whileTap={!isSubmitting ? { scale: 0.98 } : {}}
                >
                  {isSubmitting ? (
                    <>
                      <motion.div
                        className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                      Broadcasting Intent...
                    </>
                  ) : (
                    <>
                      <Zap size={20} />
                      Create Intent
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </Card3D>
        </motion.div>

        {/* Additional Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 grid grid-cols-3 gap-4"
        >
          {[
            { label: 'Gas Fee', value: '~0 XDC' },
            { label: 'Protocol Fee', value: '0.05%' },
            { label: 'Slippage', value: '0%' },
          ].map((item) => (
            <div
              key={item.label}
              className="p-4 rounded-2xl text-center"
              style={{
                background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <div className={`text-xs mb-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{item.label}</div>
              <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.value}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
