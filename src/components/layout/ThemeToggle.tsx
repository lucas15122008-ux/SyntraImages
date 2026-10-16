'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useSyncExternalStore } from 'react';
import { Icon } from '@/components/ui/Icon';
import { applyTheme, readTheme, subscribeTheme, type ThemeChoice } from './theme';

const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];
const LABEL: Record<ThemeChoice, string> = { system: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: escuro' };
const ICON = { system: 'monitor', light: 'sun', dark: 'moon' } as const;

/** Alterna entre automático (segue o sistema), claro e escuro. */
export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as ThemeChoice);

  function next() {
    const value = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    applyTheme(value);
  }

  return (
    <button type="button" className="icon-btn" onClick={next} aria-label={LABEL[choice]} title={LABEL[choice]}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={choice}
          style={{ display: 'grid' }}
          initial={{ opacity: 0, rotate: -60, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 60, scale: 0.6 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <Icon name={ICON[choice]} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
