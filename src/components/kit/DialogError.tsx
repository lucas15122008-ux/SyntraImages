'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon } from '@/components/ui/Icon';

/** Erro dentro de um pop-up: abre a altura com suavidade em vez de pular. */
export function DialogError({ error }: { error: string | null }) {
  const reduced = usePrefersReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {error && (
        <motion.p
          className="alert confirm-error"
          role="alert"
          initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <Icon name="alert" size={16} /> {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
