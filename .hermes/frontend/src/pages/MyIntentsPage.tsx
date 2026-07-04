import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  XCircle,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  Inbox,
  Filter,
} from 'lucide-react';
import Card3D from '../components/Card3D';
import { useTheme } from '../contexts/ThemeContext';
import { mockIntents } from '../lib/mockData';
import { Intent } from '../lib/types';

const statusConfig = {
  pending: {
    icon: <Clock size={14} />,
    label: 'Pending',
    color: '#FBBF24',
    bg: 'rgba(251, 191, 36, 0.1)',
    border: 'rgba(251, 191, 36, 0.2)',
  },
  filled: {
    icon: <CheckCircle size={14} />,
    label: 'Filled',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.1)',
    border: 'rgba(16, 185, 129, 0.2)',
  },
  expired: {
    icon: <AlertTriangle size={14} />,
    label: 'Expired',
    color: '#6B7280',
    bg: 'rgba(107, 114, 128, 0.1)',
    border: 'rgba(107, 114, 128, 0.2)',
  },
  cancelled: {
    icon: <XCircle size={14} />,
    label: 'Cancelled',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.2)',
  },
};

type FilterType = 'all' | 'pending' | 'filled' | 'expired' | 'cancelled';

export default function MyIntentsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [intents, setIntents] = useState<Intent[]>(mockIntents);
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredIntents = filter === 'all' ? intents : intents.filter((i) => i.status === filter);

  const handleCancel = (id: string) => {
    setIntents((prev) =>
      prev.map((intent) =>
        intent.id === id ? { ...intent, status: 'cancelled' as const } : intent
      )
    );
  };

  const filterOptions: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Filled', value: 'filled' },
    { label: 'Expired', value: 'expired' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  return (
    <div className="relative z-10 min-h-screen pt-32 pb-20 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10"
        >
          <div>
            <h1 className={`text-4xl sm:text-5xl font-black mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              My Intents
            </h1>
            <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Track and manage your swap intents
            </p>
          </div>
          <Link to="/swap">
            <motion.button
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{
                background: 'linear-gradient(135deg, #2449D8, #00D4FF)',
                boxShadow: '0 4px 20px rgba(36, 73, 216, 0.4)',
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              New Intent
              <ArrowRight size={16} />
            </motion.button>
          </Link>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-2 mb-8 overflow-x-auto pb-2"
        >
          <Filter size={16} className={isDark ? 'text-gray-500' : 'text-gray-500'} />
          {filterOptions.map((option) => (
            <motion.button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                filter === option.value
                  ? isDark ? 'text-white bg-white/10' : 'text-gray-900 bg-gray-900/10'
                  : isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-900/5'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {option.label}
            </motion.button>
          ))}
        </motion.div>

        {/* Table / Cards */}
        {filteredIntents.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {/* Desktop Table */}
            <div className="hidden lg:block">
              <Card3D intensity={4}>
                <div
                  className="rounded-3xl overflow-hidden"
                  style={{
                    background: isDark
                      ? 'rgba(10, 10, 15, 0.85)'
                      : 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                    boxShadow: isDark ? '0 20px 80px rgba(0,0,0,0.5)' : '0 20px 80px rgba(0,0,0,0.15)',
                  }}
                >
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}>
                        <th className={`text-left px-8 py-5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Intent ID
                        </th>
                        <th className={`text-left px-8 py-5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Swap
                        </th>
                        <th className={`text-left px-8 py-5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Amount
                        </th>
                        <th className={`text-left px-8 py-5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Min Output
                        </th>
                        <th className={`text-left px-8 py-5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Status
                        </th>
                        <th className={`text-left px-8 py-5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Created
                        </th>
                        <th className={`text-right px-8 py-5 text-xs font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIntents.map((intent, i) => {
                        const sc = statusConfig[intent.status];
                        return (
                          <tr
                            key={intent.id}
                            className={`transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-black/[0.02]'}`}
                            style={{ borderBottom: i < filteredIntents.length - 1 ? (isDark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)') : 'none' }}
                          >
                            <td className="px-8 py-5">
                              <span className={`font-mono text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{intent.id}</span>
                            </td>
                            <td className="px-8 py-5">
                              <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {intent.tokenFrom} → {intent.tokenTo}
                              </span>
                            </td>
                            <td className="px-8 py-5">
                              <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {intent.amountFrom.toLocaleString()} {intent.tokenFrom}
                              </span>
                            </td>
                            <td className="px-8 py-5">
                              <span className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {intent.minAmountTo.toLocaleString()} {intent.tokenTo}
                              </span>
                            </td>
                            <td className="px-8 py-5">
                              <span
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                                style={{
                                  background: sc.bg,
                                  border: `1px solid ${sc.border}`,
                                  color: sc.color,
                                }}
                              >
                                {sc.icon}
                                {sc.label}
                              </span>
                            </td>
                            <td className="px-8 py-5">
                              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{intent.createdAt}</span>
                            </td>
                            <td className="px-8 py-5 text-right">
                              {intent.status === 'pending' ? (
                                <motion.button
                                  onClick={() => handleCancel(intent.id)}
                                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-red-400 transition-all hover:bg-red-500/10"
                                  style={{ border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  Cancel
                                </motion.button>
                              ) : (
                                <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card3D>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-4">
              {filteredIntents.map((intent, i) => {
                const sc = statusConfig[intent.status];
                return (
                  <motion.div
                    key={intent.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card3D intensity={6}>
                      <div
                        className="p-6 rounded-3xl"
                        style={{
                          background: isDark
                            ? 'rgba(10, 10, 15, 0.85)'
                            : 'rgba(255, 255, 255, 0.95)',
                          backdropFilter: 'blur(20px)',
                          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.08)',
                        }}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span className={`font-mono text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{intent.id}</span>
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                            style={{
                              background: sc.bg,
                              border: `1px solid ${sc.border}`,
                              color: sc.color,
                            }}
                          >
                            {sc.icon}
                            {sc.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Swap</div>
                            <div className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {intent.tokenFrom} → {intent.tokenTo}
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Amount</div>
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {intent.amountFrom.toLocaleString()} {intent.tokenFrom}
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Min Output</div>
                            <div className={`text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {intent.minAmountTo.toLocaleString()} {intent.tokenTo}
                            </div>
                          </div>
                          <div>
                            <div className={`text-xs mb-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Created</div>
                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{intent.createdAt}</div>
                          </div>
                        </div>
                        {intent.status === 'pending' && (
                          <motion.button
                            onClick={() => handleCancel(intent.id)}
                            className="w-full px-5 py-3 rounded-xl text-sm font-bold text-red-400 transition-all hover:bg-red-500/10"
                            style={{ border: '1px solid rgba(239, 68, 68, 0.2)' }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Cancel Intent
                          </motion.button>
                        )}
                      </div>
                    </Card3D>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center py-24"
          >
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8"
              style={{
                background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                border: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <Inbox size={36} className={isDark ? 'text-gray-600' : 'text-gray-400'} />
            </div>
            <h3 className={`text-2xl font-bold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>No intents found</h3>
            <p className={`mb-8 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {filter === 'all'
                ? "You haven't created any intents yet"
                : `No ${filter} intents`}
            </p>
            <Link to="/swap">
              <motion.button
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-white font-bold text-base"
                style={{
                  background: 'linear-gradient(135deg, #2449D8, #00D4FF)',
                  boxShadow: '0 10px 40px rgba(36, 73, 216, 0.4)',
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Create Your First Intent
                <ArrowRight size={18} />
              </motion.button>
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
