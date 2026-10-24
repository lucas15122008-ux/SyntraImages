'use client';

import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { dayLabel, money, moneyShort } from './format';

export type StackedPoint = { day: string; withDiscount: number; withoutDiscount: number; discountedSales: number; sales: number };

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 56 };
/** Fresta entre os dois pedaços da barra, na cor do fundo. */
const GAP = 2;

function niceMax(max: number): number {
  if (max <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 5, 10].find((m) => m * pow >= max) ?? 10) * pow;
}

/** Barra com só a ponta de cima arredondada. */
function bar(x: number, base: number, h: number, w: number, round: boolean): string {
  const r = round ? Math.min(4, w / 2, h) : 0;
  const top = base - h;
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

/** Vendas por dia empilhadas: com desconto embaixo (o destaque), sem desconto em cima. */
export function StackedDailyChart({ data }: { data: StackedPoint[] }) {
  const reduced = usePrefersReducedMotion();
  const top = niceMax(Math.max(...data.map((d) => d.withDiscount + d.withoutDiscount)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const scale = (v: number) => (v / top) * plotH;
  const base = PAD.top + plotH;
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <div className="stacked-chart">
      <ul className="chart-legend" aria-label="Legenda">
        <li>
          <i className="swatch s1" /> Com desconto
        </li>
        <li>
          <i className="swatch s2" /> Sem desconto
        </li>
      </ul>
      <svg className="daily-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vendas por dia, com e sem desconto">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={base - scale(t)} y2={base - scale(t)} />
            <text className="axis" x={PAD.left - 8} y={base - scale(t)} dy="0.32em" textAnchor="end">
              {moneyShort(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h1 = scale(d.withDiscount);
          const h2 = scale(d.withoutDiscount);
          // A fresta só existe quando há os dois pedaços; o de cima perde a altura dela.
          const gap = h1 > 0 && h2 > GAP ? GAP : 0;
          const total = d.withDiscount + d.withoutDiscount;
          return (
            <g key={d.day} className="bar">
              <title>{`${dayLabel(d.day)}: ${money(total)} em ${d.sales} ${d.sales === 1 ? 'venda' : 'vendas'}; com desconto ${money(d.withDiscount)} (${d.discountedSales}), sem desconto ${money(d.withoutDiscount)}`}</title>
              <rect className="hit" x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} />
              {total > 0 && (
                // A pilha cresce a partir da linha de base, em cascata da esquerda para a direita.
                <motion.g
                  initial={{ scaleY: reduced ? 1 : 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.15 + i * (0.6 / data.length), ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformBox: 'fill-box', originY: 1 }}
                >
                  {h1 > 0 && <path className="s1" d={bar(x, base, h1, barW, h2 <= GAP)} />}
                  {h2 > GAP && <path className="s2" d={bar(x, base - h1 - gap, h2 - gap, barW, true)} />}
                </motion.g>
              )}
              {(i === data.length - 1 || (i % labelEvery === 0 && data.length - 1 - i >= labelEvery)) && (
                <text className="axis" x={PAD.left + i * slot + slot / 2} y={H - 8} textAnchor="middle">
                  {dayLabel(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
