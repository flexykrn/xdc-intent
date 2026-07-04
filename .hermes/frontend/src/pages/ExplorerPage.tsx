import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  ArrowUpRight,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import Card3D from '../components/Card3D';
import { useTheme } from '../contexts/ThemeContext';

const recentActivity = [
  { type: 'fill', solver: 'SolverAlpha', intent: '0x2c1d...a4f7', time: '2 min ago', amount: '1,000 USDC → 19,800 XDC' },
  { type: 'fill', solver: 'FastFill', intent: '0x9e4b...c1d3', time: '15 min ago', amount: '0.5 ETH → 48,500 XDC' },
  { type: 'create', solver: '—', intent: '0x7a3f...e8b2', time: '22 min ago', amount: '5,000 XDC → 248.5 USDT' },
  { type: 'create', solver: '—', intent: '0x3d2c...f7a8', time: '1 hr ago', amount: '0.05 WBTC → 85,000 XDC' },
  { type: 'expire', solver: '—', intent: '0x5f8a...b9e1', time: '2 hr ago', amount: '10,000 XDC → 495 USDC' },
  { type: 'fill', solver: 'QuickSwap Solver', intent: '0x8b3f...c2e9', time: '3 hr ago', amount: '2,500 USDT → 50,250 XDC' },
  { type: 'fill', solver: 'MEVGuard', intent: '0x1a7d...f4b6', time: '4 hr ago', amount: '1.2 ETH → 116,400 XDC' },
  { type: 'create', solver: '—', intent: '0x4e9c...d8a1', time: '5 hr ago', amount: '750 USDC → 14,925 XDC' },
];

const topSolvers = [
  { name: 'SolverAlpha', filled: 12450, successRate: 99.8, avgTime: '3.1s' },
  { name: 'FastFill', filled: 9830, successRate: 99.5, avgTime: '2.8s' },
  { name: 'QuickSwap Solver', filled: 7620, successRate: 99.1, avgTime: '4.5s' },
  { name: 'MEVGuard', filled: 6540, successRate: 99.9, avgTime: '5.2s' },
  { name: 'XDCBridge Pro', filled: 4210, successRate: 98.7, avgTime: '6.1s' },
];

const activityIcon = {
  fill: <CheckCircle size={16} className="text-emerald-400" />,
  create: <ArrowUpRight size={16} className="text-blue-400" />,
  expire: <AlertTriangle size={16} className="text-gray-500" />,
  cancel: <XCircle size={16} className="text-red-400" />,
};

const activityLabel = {
  fill: 'Filled',
  create: 'Created',
  expire: 'Expired',
  cancel: 'Cancelled',
};

export default function ExplorerPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="relative z-10 min-h-screen pt-32 pb-20 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className={`text-4xl sm:text-5xl font-black mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Explorer
          </h1>
          <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Browse all intents, solvers, and protocol activity
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-10"
        >
          <Card3D intensity={4}>
            <div
              className="flex items-center gap-4 px-6 py-5 rounded-2xl"
              style={{
                background: isDark
                  ? 'rgba(10, 10, 15, 0.85)'
                  : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.08)',
              }}
            >
              <Search size={22} className={isDark ? 'text-gray-500' : 'text-gray-500'} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by intent ID, solver, or token..."
                className={`flex-1 bg-transparent outline-none text-base ${
                  isDark ? 'text-white placeholder:text-gray-600' : 'text-gray-900 placeholder:text-gray-400'
                }`}
              />
            </div>
          </Card3D>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
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
                <div
                  className="px-8 py-6 flex items-center justify-between"
                  style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}
                >
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Recent Activity</h2>
                  <span className={`text-xs font-semibold ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {recentActivity.length} events
                  </span>
                </div>
                <div className={isDark ? 'divide-y divide-white/[0.04]' : 'divide-y divide-black/[0.04]'}>
                  {recentActivity.map((activity, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.05 }}
                      className={`flex items-center gap-4 px-8 py-5 transition-colors ${
                        isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-black/[0.02]'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                      >
                        {activityIcon[activity.type as keyof typeof activityIcon]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {activityLabel[activity.type as keyof typeof activityLabel]}
                          </span>
                          <span className={`text-xs font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                            {activity.intent}
                          </span>
                        </div>
                        <div className={`text-xs mt-1 truncate ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {activity.amount}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs flex items-center gap-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          <Clock size={12} />
                          {activity.time}
                        </div>
                        {activity.solver !== '—' && (
                          <div className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                            {activity.solver}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </Card3D>
          </motion.div>

          {/* Top Solvers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card3D intensity={6}>
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
                <div
                  className="px-8 py-6"
                  style={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)' }}
                >
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Top Solvers</h2>
                </div>
                <div className={isDark ? 'divide-y divide-white/[0.04]' : 'divide-y divide-black/[0.04]'}>
                  {topSolvers.map((solver, i) => (
                    <motion.div
                      key={solver.name}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className={`px-8 py-5 transition-colors ${isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-black/[0.02]'}`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <span className={`text-xs font-black w-6 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          #{i + 1}
                        </span>
                        <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {solver.name}
                        </span>
                        <ExternalLink size={14} className={`ml-auto ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
                      </div>
                      <div className="flex items-center gap-4 pl-9">
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {solver.filled.toLocaleString()} fills
                        </span>
                        <span className="text-xs font-bold text-emerald-400">
                          {solver.successRate}%
                        </span>
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                          {solver.avgTime}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </Card3D>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
