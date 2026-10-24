'use client';

import { animate, motion, useMotionValue, useMotionValueEvent } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useMotionPresets, usePrefersReducedMotion } from '@/components/motion/presets';
import { count, money, percent, share } from './format';

const EASE = [0.22, 1, 0.36, 1] as const;
const FORMAT = { money, count, percent, share } as const;
export type NumberFormat = keyof typeof FORMAT;

/** Grupo cujos filhos (StaggerItem) entram em cascata. */
export function Stagger({ children, className, gap = 0.06, label }: { children: ReactNode; className?: string; gap?: number; label?: string }) {
  const { reduced } = useMotionPresets();
  return (
    <motion.section
      className={className}
      aria-label={label}
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: reduced ? 0 : gap } } }}
    >
      {children}
    </motion.section>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const { listItem } = useMotionPresets();
  return (
    <motion.div className={className} variants={listItem}>
      {children}
    </motion.div>
  );
}

/** Número que conta de 0 até o valor ao aparecer (ou mostra direto, para quem prefere menos movimento). */
export function CountUp({ value, format, delay = 0 }: { value: number; format: NumberFormat; delay?: number }) {
  const reduced = usePrefersReducedMotion();
  const mv = useMotionValue(0);
  const [shown, setShown] = useState(0);
  useMotionValueEvent(mv, 'change', setShown);

  useEffect(() => {
    if (reduced) return;
    const controls = animate(mv, value, { duration: 1.1, delay, ease: EASE });
    return () => controls.stop();
  }, [mv, value, delay, reduced]);

  const fmt = FORMAT[format];
  const current = reduced ? value : format === 'count' ? Math.round(shown) : shown;
  return (
    <>
      {/* Leitores de tela recebem o valor final, sem a contagem. */}
      <span aria-hidden="true">{fmt(current)}</span>
      <span className="sr-only">{fmt(value)}</span>
    </>
  );
}

/** Seletor de período com a pílula deslizando até o escolhido, como na navegação. */
export function PeriodTabs({ items, current, basePath }: { items: { value: number; label: string }[]; current: number; basePath: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <nav className="segmented" aria-label="Período">
      {items.map((p) => (
        <Link key={p.value} href={`${basePath}?dias=${p.value}`} aria-current={p.value === current ? 'page' : undefined}>
          {p.value === current && (
            <motion.span
              layoutId="period-pill"
              className="segmented-pill"
              transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
            />
          )}
          <span className="segmented-text">{p.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Barra de participação (anúncios que mais faturaram) que cresce da esquerda. */
export function ShareBar({ share, index }: { share: number; index: number }) {
  const reduced = usePrefersReducedMotion();
  return (
    <span className="share-bar" aria-hidden="true">
      <motion.span
        initial={{ scaleX: reduced ? 1 : 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.3 + index * 0.05, ease: EASE }}
        style={{ width: `${Math.max(2, share * 100)}%` }}
      />
    </span>
  );
}

/** Linhas de tabela em cascata. */
export function StaggerRows({ children }: { children: ReactNode }) {
  const { reduced } = useMotionPresets();
  return (
    <motion.tbody initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: reduced ? 0 : 0.04, delayChildren: reduced ? 0 : 0.2 } } }}>
      {children}
    </motion.tbody>
  );
}

export function StaggerRow({ children }: { children: ReactNode }) {
  const { listItem } = useMotionPresets();
  return <motion.tr variants={listItem}>{children}</motion.tr>;
}
