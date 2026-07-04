import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative w-14 h-8 rounded-full transition-colors duration-300"
      style={{
        background: theme === 'dark' 
          ? 'linear-gradient(135deg, #1a1a2e, #16213e)' 
          : 'linear-gradient(135deg, #f0f0f0, #e0e0e0)',
        border: theme === 'dark' 
          ? '1px solid rgba(255,255,255,0.1)' 
          : '1px solid rgba(0,0,0,0.1)',
      }}
    >
      <motion.div
        className="absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center"
        animate={{ x: theme === 'dark' ? 0 : 24 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          background: theme === 'dark' 
            ? 'linear-gradient(135deg, #2449D8, #00D4FF)' 
            : 'linear-gradient(135deg, #FFD700, #FFA500)',
        }}
      >
        {theme === 'dark' ? (
          <Moon size={14} className="text-white" />
        ) : (
          <Sun size={14} className="text-white" />
        )}
      </motion.div>
    </button>
  );
}
