'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useMotionPresets } from '@/components/motion/presets';

/** O template remonta a cada navegação, então cada tela entra com a transição suave. */
export default function Template({ children }: { children: ReactNode }) {
  const { screenTransition } = useMotionPresets();
  return (
    <motion.div className="screen" variants={screenTransition} initial="hidden" animate="visible">
      {children}
    </motion.div>
  );
}
