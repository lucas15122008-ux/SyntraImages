'use client';

import { LineChart } from './LineChart';
import { money } from './format';

type Point = { day: string; gross: number; sales: number };

/** Faturamento por dia em linha (uma série: o título da seção já diz o que é). */
export function DailyChart({ data }: { data: Point[] }) {
  return (
    <LineChart
      label="Faturamento por dia"
      days={data.map((d) => d.day)}
      series={[{ key: 's1', label: 'Faturamento', values: data.map((d) => d.gross) }]}
      tooltip={(i) => (
        <span>
          {money(data[i].gross)} em {data[i].sales} {data[i].sales === 1 ? 'venda' : 'vendas'}
        </span>
      )}
    />
  );
}
