'use client';

import { motion } from 'framer-motion';
import { useId, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/components/motion/presets';
import { dayLabel, moneyShort } from './format';

export type LineSeries = {
  /** Classe de cor (s1, s2…) e nome na legenda. */
  key: 's1' | 's2';
  label: string;
  values: number[];
};

const W = 720;
const H = 220;
const PAD = { top: 14, right: 12, bottom: 26, left: 56 };
const EASE = [0.22, 1, 0.36, 1] as const;

/** Escala "redonda" para o eixo: 1, 2 ou 5 × 10^n. */
function niceMax(max: number): number {
  if (max <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 5, 10].find((m) => m * pow >= max) ?? 10) * pow;
}

/**
 * Curva suave que passa por todos os pontos (cúbica monotônica, de Fritsch-Carlson):
 * entre dois dias ela nunca sobe acima nem desce abaixo deles, então não inventa picos nem valores negativos.
 */
function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px},${py}`).join(' ');
  const dx = pts.slice(1).map(([px], i) => px - pts[i][0]);
  const slope = pts.slice(1).map(([, py], i) => (py - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const a = slope[i - 1];
    const b = slope[i];
    return a * b <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / a + (dx[i] + 2 * dx[i - 1]) / b);
  });
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

/**
 * Gráfico de linha por dia, com área suave embaixo da primeira série.
 * Passar o mouse (ou tocar) num dia mostra a guia vertical, os pontos e o quadro com os valores.
 */
export function LineChart({
  days,
  series,
  label,
  tooltip,
}: {
  days: string[];
  series: LineSeries[];
  label: string;
  tooltip: (i: number) => ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const gradId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const top = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  // Com um dia só, o ponto fica no meio.
  const x = (i: number) => PAD.left + (days.length === 1 ? plotW / 2 : (i / (days.length - 1)) * plotW);
  const y = (v: number) => base - (v / top) * plotH;
  const slot = plotW / Math.max(1, days.length - 1);
  const ticks = [0, top / 2, top];
  const labelEvery = Math.ceil(days.length / 8);

  const line = (values: number[]) => smoothPath(values.map((v, i) => [x(i), y(v)]));
  const area = (values: number[]) => `${line(values)} L${x(values.length - 1)},${base} L${x(0)},${base} Z`;

  return (
    <div className="line-chart" onPointerLeave={() => setHover(null)}>
      {series.length > 1 && (
        <ul className="chart-legend" aria-label="Legenda">
          {series.map((s) => (
            <li key={s.key}>
              <i className={`swatch line ${s.key}`} /> {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="line-chart-plot">
        <svg className="daily-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className={`area-stop ${series[0].key}`} stopOpacity="0.22" />
              <stop offset="100%" className={`area-stop ${series[0].key}`} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {moneyShort(t)}
              </text>
            </g>
          ))}
          {days.map(
            (d, i) =>
              (i === days.length - 1 || (i % labelEvery === 0 && days.length - 1 - i >= labelEvery)) && (
                <text key={d} className="axis" x={x(i)} y={H - 8} textAnchor={i === days.length - 1 && days.length > 1 ? 'end' : i === 0 && days.length > 1 ? 'start' : 'middle'}>
                  {dayLabel(d)}
                </text>
              ),
          )}

          {/* A área aparece suave; as linhas se desenham da esquerda para a direita. */}
          <motion.path
            className="area"
            fill={`url(#${gradId})`}
            d={area(series[0].values)}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.5, ease: EASE }}
          />
          {series.map((s, si) => (
            <motion.path
              key={s.key}
              className={`series ${s.key}`}
              d={line(s.values)}
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduced ? 0 : 0.9, delay: reduced ? 0 : 0.15 + si * 0.15, ease: EASE }}
            />
          ))}

          {hover !== null && (
            <g className="hover" aria-hidden>
              <line className="guide" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={base} />
              {series.map((s) => (
                <circle key={s.key} className={`dot ${s.key}`} cx={x(hover)} cy={y(s.values[hover])} r={4.5} />
              ))}
            </g>
          )}

          {/* Áreas de toque: uma coluna por dia, centrada no ponto. */}
          {days.map((d, i) => (
            <rect
              key={d}
              className="hit"
              x={days.length === 1 ? PAD.left : x(i) - slot / 2}
              y={PAD.top}
              width={days.length === 1 ? plotW : slot}
              height={plotH}
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            />
          ))}
        </svg>
        {hover !== null && (
          <div
            className="chart-tip"
            role="status"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              top: `${(Math.min(...series.map((s) => y(s.values[hover]))) / H) * 100}%`,
              // Perto das bordas, o quadro se apoia para dentro do gráfico.
              translate: hover < days.length * 0.25 ? '-8% -115%' : hover > days.length * 0.75 ? '-92% -115%' : '-50% -115%',
            }}
          >
            <strong>{dayLabel(days[hover])}</strong>
            {tooltip(hover)}
          </div>
        )}
      </div>
    </div>
  );
}
