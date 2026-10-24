'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useState } from 'react';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { Icon } from '@/components/ui/Icon';
import type { Selection } from '@/lib/ml/revenue';
import { dayLabel } from './format';

type Props = {
  basePath: string;
  presets: { value: number; label: string }[];
  selection: Selection;
  /** Hoje em Brasília (AAAA-MM-DD): limite dos campos de data. */
  today: string;
  maxDays: number;
};

const spring = { type: 'spring', stiffness: 420, damping: 36 } as const;

/** Atalhos de período e um intervalo personalizado (de/até), que vai na URL como ?de=&ate=. */
export function PeriodPicker({ basePath, presets, selection, today, maxDays }: Props) {
  const reduced = usePrefersReducedMotion();
  const custom = selection.kind === 'custom';
  const [open, setOpen] = useState(custom);
  const [from, setFrom] = useState(custom ? selection.from : '');
  const [to, setTo] = useState(custom ? selection.to : '');
  const pill = (
    <motion.span layoutId={`period-pill-${basePath}`} className="segmented-pill" transition={reduced ? { duration: 0 } : spring} />
  );

  return (
    <div className="period-picker">
      <nav className="segmented" aria-label="Período">
        {presets.map((p) => {
          const active = selection.kind === 'preset' && selection.days === p.value;
          return (
            <Link key={p.value} href={`${basePath}?dias=${p.value}`} aria-current={active ? 'page' : undefined}>
              {active && pill}
              <span className="segmented-text">{p.label}</span>
            </Link>
          );
        })}
        <button type="button" aria-expanded={open} aria-current={custom ? 'page' : undefined} onClick={() => setOpen((o) => !o)}>
          {custom && pill}
          <span className="segmented-text">
            <Icon name="clock" size={14} /> {custom ? `${dayLabel(selection.from)} a ${dayLabel(selection.to)}` : 'Personalizado'}
          </span>
        </button>
      </nav>

      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            key="range"
            method="get"
            action={basePath}
            className="date-range panel"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, height: 'auto' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <label>
              <span>De</span>
              <input type="date" name="de" required value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              <span>Até</span>
              <input type="date" name="ate" required value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button type="submit" className="btn">
              Aplicar
            </button>
            <span className="hint">Até {maxDays} dias. O período é comparado com os mesmos dias logo antes.</span>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
