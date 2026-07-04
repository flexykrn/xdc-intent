import { motion } from 'framer-motion';
import { useTheme } from '../contexts/ThemeContext';

interface FloatingOrbProps {
  size: number;
  color: string;
  delay?: number;
  duration?: number;
  x?: string;
  y?: string;
}

export default function FloatingOrb({ 
  size, 
  color, 
  delay = 0, 
  duration = 20,
  x = '50%',
  y = '50%',
}: FloatingOrbProps) {
  const { theme } = useTheme();
  
  return (
    <motion.div
      className="absolute rounded-full blur-3xl pointer-events-none"
      style={{
        width: size,
        height: size,
        background: color,
        left: x,
        top: y,
        opacity: theme === 'dark' ? 0.3 : 0.15,
      }}
      animate={{
        x: [0, 100, -100, 0],
        y: [0, -100, 100, 0],
        scale: [1, 1.2, 0.8, 1],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}
