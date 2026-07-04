import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useRef } from 'react';
import {
  ArrowRight,
  Zap,
  Shield,
  Globe,
  Clock,
  Users,
  TrendingUp,
  CheckCircle,
  Layers,
  Send,
  Search,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import Card3D from '../components/Card3D';
import FloatingOrb from '../components/FloatingOrb';
import { useTheme } from '../contexts/ThemeContext';
import { mockStats } from '../lib/mockData';

const steps = [
  {
    num: '01',
    icon: <Send size={28} />,
    title: 'Create Intent',
    description: 'Define your swap parameters — tokens, amounts, expiry. Your intent is broadcast to the solver network.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    num: '02',
    icon: <Search size={28} />,
    title: 'Solvers Compete',
    description: 'Professional solvers find the best execution path across all available liquidity sources.',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    num: '03',
    icon: <CheckCircle size={28} />,
    title: 'Intent Fulfilled',
    description: 'The winning solver executes your swap at the best rate. You receive your tokens instantly.',
    gradient: 'from-green-500 to-emerald-500',
  },
];

const features = [
  {
    icon: <Zap size={28} />,
    title: 'Lightning Fast',
    description: 'Average fill time under 5 seconds. No waiting for block confirmations across chains.',
    color: '#FFD700',
  },
  {
    icon: <Shield size={28} />,
    title: 'MEV Protected',
    description: 'Intent-based execution prevents front-running and sandwich attacks on your trades.',
    color: '#00D4FF',
  },
  {
    icon: <Globe size={28} />,
    title: 'Cross-Chain Ready',
    description: 'Access liquidity from any chain. Solvers bridge the gap so you don\'t have to.',
    color: '#A855F7',
  },
  {
    icon: <Layers size={28} />,
    title: 'Deep Liquidity',
    description: 'Aggregated liquidity from DEXs, CEXs, and private market makers in one interface.',
    color: '#10B981',
  },
];

export default function HomePage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -100]);

  return (
    <div ref={containerRef} className="relative z-10 overflow-hidden">
      {/* Floating Orbs Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <FloatingOrb size={400} color="radial-gradient(circle, rgba(36, 73, 216, 0.4), transparent)" x="10%" y="20%" delay={0} />
        <FloatingOrb size={350} color="radial-gradient(circle, rgba(0, 212, 255, 0.3), transparent)" x="70%" y="30%" delay={2} />
        <FloatingOrb size={300} color="radial-gradient(circle, rgba(168, 85, 247, 0.3), transparent)" x="40%" y="60%" delay={4} />
      </div>

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center pt-32 pb-20 px-4 relative">
        <motion.div style={{ y: heroY }} className="max-w-6xl mx-auto text-center relative z-10">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full mb-8"
            style={{
              background: isDark ? 'rgba(36, 73, 216, 0.15)' : 'rgba(36, 73, 216, 0.08)',
              border: isDark ? '1px solid rgba(36, 73, 216, 0.3)' : '1px solid rgba(36, 73, 216, 0.2)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <Sparkles size={16} style={{ color: '#00D4FF' }} />
            <span className="text-sm font-semibold" style={{ color: isDark ? '#00D4FF' : '#2449D8' }}>
              Live on XDC Network
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-6xl sm:text-7xl lg:text-8xl font-black leading-[1.05] mb-8 tracking-tight"
          >
            <span className={isDark ? 'text-white' : 'text-gray-900'}>Universal</span>
            <br />
            <span
              className="bg-clip-text text-transparent inline-block"
              style={{
                backgroundImage: 'linear-gradient(135deg, #2449D8 0%, #00D4FF 50%, #A855F7 100%)',
                backgroundSize: '200% auto',
              }}
            >
              liquidity
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className={`text-xl sm:text-2xl max-w-3xl mx-auto mb-12 leading-relaxed font-medium ${
              isDark ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            Intent-based swaps that find the best rates across all liquidity sources.
            <br className="hidden sm:block" />
            No slippage. No MEV. Just perfect execution.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <Link to="/swap">
              <motion.button
                className="group flex items-center gap-3 px-10 py-5 rounded-2xl text-white font-bold text-lg"
                style={{
                  background: 'linear-gradient(135deg, #2449D8, #00D4FF)',
                  boxShadow: '0 10px 50px rgba(36, 73, 216, 0.5)',
                }}
                whileHover={{ scale: 1.05, boxShadow: '0 15px 60px rgba(36, 73, 216, 0.6)' }}
                whileTap={{ scale: 0.95 }}
              >
                Start Swapping
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </Link>
            <Link to="/intents">
              <motion.button
                className={`flex items-center gap-3 px-10 py-5 rounded-2xl font-bold text-lg transition-all ${
                  isDark ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'
                }`}
                style={{
                  border: isDark ? '2px solid rgba(255,255,255,0.1)' : '2px solid rgba(0,0,0,0.1)',
                  background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  backdropFilter: 'blur(10px)',
                }}
                whileHover={{ scale: 1.05, borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }}
                whileTap={{ scale: 0.95 }}
              >
                View My Intents
                <ArrowUpRight size={20} />
              </motion.button>
            </Link>
          </motion.div>

          {/* 3D Network Visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="relative"
          >
            <Card3D intensity={8}>
              <div className="relative rounded-3xl overflow-hidden" style={{
                background: isDark 
                  ? 'linear-gradient(135deg, rgba(36, 73, 216, 0.1), rgba(0, 212, 255, 0.05))'
                  : 'linear-gradient(135deg, rgba(36, 73, 216, 0.05), rgba(0, 212, 255, 0.02))',
                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
                padding: '2px',
              }}>
                <img
                  src="/images/network-glow.png"
                  alt="XDC Network"
                  className="w-full max-w-4xl mx-auto rounded-3xl"
                  style={{ opacity: isDark ? 0.8 : 0.6 }}
                />
                <div
                  className="absolute inset-0 rounded-3xl"
                  style={{
                    background: isDark
                      ? 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.8) 90%)'
                      : 'radial-gradient(ellipse at center, transparent 30%, rgba(255,255,255,0.8) 90%)',
                  }}
                />
              </div>
            </Card3D>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats Section */}
      <section className="py-24 px-4 relative">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <TrendingUp size={24} />, label: 'Total Intents', value: mockStats.totalIntents.toLocaleString(), color: '#00D4FF' },
              { icon: <Users size={24} />, label: 'Active Solvers', value: mockStats.activeSolvers.toString(), color: '#A855F7' },
              { icon: <CheckCircle size={24} />, label: 'Success Rate', value: mockStats.successRate.toString(), suffix: '%', color: '#10B981' },
              { icon: <Clock size={24} />, label: 'Avg Fill Time', value: mockStats.avgFillTime, color: '#FFD700' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <Card3D intensity={10}>
                  <div
                    className="p-8 rounded-3xl h-full"
                    style={{
                      background: isDark 
                        ? 'rgba(255,255,255,0.03)' 
                        : 'rgba(255,255,255,0.8)',
                      backdropFilter: 'blur(20px)',
                      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.08)',
                    }}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ 
                          background: `${stat.color}15`,
                          color: stat.color,
                        }}
                      >
                        {stat.icon}
                      </div>
                      <span className={`text-sm font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {stat.label}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {stat.value}
                      </span>
                      {stat.suffix && (
                        <span className={`text-2xl font-bold ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                          {stat.suffix}
                        </span>
                      )}
                    </div>
                  </div>
                </Card3D>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className={`text-5xl sm:text-6xl font-black mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              How It Works
            </h2>
            <p className={`text-xl max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Three simple steps to access the best rates in DeFi
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
              >
                <Card3D intensity={12}>
                  <div
                    className="p-10 rounded-3xl h-full relative overflow-hidden"
                    style={{
                      background: isDark 
                        ? 'rgba(255,255,255,0.02)' 
                        : 'rgba(255,255,255,0.9)',
                      backdropFilter: 'blur(20px)',
                      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.08)',
                    }}
                  >
                    {/* Gradient overlay */}
                    <div 
                      className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${step.gradient} opacity-10 blur-3xl`}
                    />
                    
                    <div className="relative z-10">
                      <div className="flex items-start justify-between mb-6">
                        <span
                          className="text-6xl font-black opacity-20"
                          style={{ color: isDark ? '#00D4FF' : '#2449D8' }}
                        >
                          {step.num}
                        </span>
                        <div
                          className="w-16 h-16 rounded-2xl flex items-center justify-center"
                          style={{ 
                            background: isDark ? 'rgba(36, 73, 216, 0.15)' : 'rgba(36, 73, 216, 0.1)',
                            color: isDark ? '#00D4FF' : '#2449D8',
                          }}
                        >
                          {step.icon}
                        </div>
                      </div>
                      <h3 className={`text-2xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {step.title}
                      </h3>
                      <p className={`leading-relaxed text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                </Card3D>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-20"
          >
            <h2 className={`text-5xl sm:text-6xl font-black mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Built for the Future
            </h2>
            <p className={`text-xl max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Advanced protocol design meets seamless user experience
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                <Card3D intensity={10}>
                  <div
                    className="p-10 rounded-3xl h-full relative overflow-hidden group"
                    style={{
                      background: isDark 
                        ? 'rgba(255,255,255,0.02)' 
                        : 'rgba(255,255,255,0.9)',
                      backdropFilter: 'blur(20px)',
                      border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.08)',
                    }}
                  >
                    {/* Hover glow */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-3xl"
                      style={{ background: `radial-gradient(circle at center, ${feature.color}15, transparent 70%)` }}
                    />
                    
                    <div className="relative z-10">
                      <motion.div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
                        style={{ 
                          background: `${feature.color}15`,
                          color: feature.color,
                        }}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: 'spring', stiffness: 400 }}
                      >
                        {feature.icon}
                      </motion.div>
                      <h3 className={`text-2xl font-bold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {feature.title}
                      </h3>
                      <p className={`leading-relaxed text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </Card3D>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-4 relative">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <Card3D intensity={6}>
              <div
                className="relative rounded-[2.5rem] p-16 sm:p-20 text-center overflow-hidden"
                style={{
                  background: isDark
                    ? 'linear-gradient(135deg, rgba(10, 10, 15, 0.9), rgba(36, 73, 216, 0.1))'
                    : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(36, 73, 216, 0.05))',
                  border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
                  boxShadow: isDark ? '0 20px 80px rgba(0,0,0,0.5)' : '0 20px 80px rgba(0,0,0,0.15)',
                }}
              >
                {/* Background gradient */}
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    background: 'radial-gradient(ellipse at top, rgba(36, 73, 216, 0.4), transparent 60%)',
                  }}
                />
                
                {/* Floating orbs */}
                <FloatingOrb size={200} color="radial-gradient(circle, rgba(0, 212, 255, 0.4), transparent)" x="20%" y="30%" duration={15} />
                <FloatingOrb size={180} color="radial-gradient(circle, rgba(168, 85, 247, 0.3), transparent)" x="70%" y="60%" duration={18} />
                
                <div className="relative z-10">
                  <h2 className={`text-4xl sm:text-5xl font-black mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Ready to Swap Smarter?
                  </h2>
                  <p className={`text-xl mb-10 max-w-2xl mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Join thousands of traders using intent-based swaps to get the best rates on XDC Network.
                  </p>
                  <Link to="/swap">
                    <motion.button
                      className="inline-flex items-center gap-3 px-12 py-6 rounded-2xl text-white font-bold text-lg"
                      style={{
                        background: 'linear-gradient(135deg, #2449D8, #00D4FF)',
                        boxShadow: '0 15px 60px rgba(36, 73, 216, 0.5)',
                      }}
                      whileHover={{ scale: 1.05, boxShadow: '0 20px 70px rgba(36, 73, 216, 0.6)' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Launch App
                      <ArrowRight size={22} />
                    </motion.button>
                  </Link>
                </div>
              </div>
            </Card3D>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
