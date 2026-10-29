import type { ReactNode } from 'react';
import { change, type Period } from '@/lib/ml/revenue';
import { percent } from './format';
import { CountUp, StaggerItem, type NumberFormat } from './RevenueMotion';

export const PERIOD_LABEL: Record<Period, string> = { 1: 'Hoje', 7: '7 dias', 30: '30 dias', 90: '90 dias' };

/** Cartão de métrica: rótulo, número que conta até o valor e uma linha de apoio. */
export function Kpi({ label, value, format, hero = false, children }: { label: string; value: number; format: NumberFormat; hero?: boolean; children: ReactNode }) {
  return (
    <StaggerItem className={`kpi panel${hero ? ' hero' : ''}`}>
      <span className="label">{label}</span>
      <strong>
        <CountUp value={value} format={format} delay={0.1} />
      </strong>
      {children}
    </StaggerItem>
  );
}

export function Delta({ now, before, invert = false, versus = 'vs. período anterior' }: { now: number; before: number; invert?: boolean; versus?: string }) {
  const c = change(now, before);
  if (c === null) return <span className="delta">sem base para comparar</span>;
  const good = invert ? c < 0 : c > 0;
  return (
    <span className={`delta ${c === 0 ? '' : good ? 'up' : 'down'}`}>
      {percent(c)} <span className="muted">{versus}</span>
    </span>
  );
}
