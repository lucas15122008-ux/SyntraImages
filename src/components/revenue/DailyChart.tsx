'use client';

import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { dayLabel, money, moneyShort } from './format';

type Point = { day: string; gross: number; sales: number };

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 56 };

/** Escala "redonda" para o eixo: 1, 2 ou 5 × 10^n. */
function niceMax(max: number): number {
  if (max <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 5, 10].find((m) => m * pow >= max) ?? 10) * pow;
}

/** Faturamento por dia em barras (uma série: o título da seção já diz o que é). */
export function DailyChart({ data }: { data: Point[] }) {
  const reduced = usePrefersReducedMotion();
  const top = niceMax(Math.max(...data.map((d) => d.gross)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <svg className="daily-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Faturamento por dia">
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text className="axis" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
            {moneyShort(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = PAD.left + i * slot + (slot - barW) / 2;
        const h = Math.max(0, y(0) - y(d.gross));
        const r = Math.min(4, barW / 2, h);
        return (
          <g key={d.day} className="bar">
            <title>{`${dayLabel(d.day)}: ${money(d.gross)} em ${d.sales} ${d.sales === 1 ? 'venda' : 'vendas'}`}</title>
            {/* Área de toque maior que a barra. */}
            <rect className="hit" x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} />
            {h > 0 && (
              // As barras crescem a partir da linha de base, em cascata da esquerda para a direita.
              <motion.path
                initial={{ scaleY: reduced ? 1 : 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.15 + i * (0.6 / data.length), ease: [0.22, 1, 0.36, 1] }}
                style={{ transformBox: 'fill-box', originY: 1 }}
                d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
              />
            )}
            {(i === data.length - 1 || (i % labelEvery === 0 && data.length - 1 - i >= labelEvery / 2 + 1)) && (
              <text className="axis" x={PAD.left + i * slot + slot / 2} y={H - 8} textAnchor="middle">
                {dayLabel(d.day)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
