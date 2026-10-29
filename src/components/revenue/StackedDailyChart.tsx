'use client';

import { LineChart } from './LineChart';
import { money } from './format';

export type StackedPoint = { day: string; withDiscount: number; withoutDiscount: number; discountedSales: number; sales: number };

/** Vendas por dia em duas linhas no mesmo eixo: com desconto (o destaque) e sem desconto. */
export function StackedDailyChart({ data }: { data: StackedPoint[] }) {
  return (
    <LineChart
      label="Vendas por dia, com e sem desconto"
      days={data.map((d) => d.day)}
      series={[
        { key: 's1', label: 'Com desconto', values: data.map((d) => d.withDiscount) },
        { key: 's2', label: 'Sem desconto', values: data.map((d) => d.withoutDiscount) },
      ]}
      tooltip={(i) => {
        const d = data[i];
        return (
          <>
            <span>
              {money(d.withDiscount + d.withoutDiscount)} em {d.sales} {d.sales === 1 ? 'venda' : 'vendas'}
            </span>
            <span>
              <i className="swatch line s1" /> Com desconto {money(d.withDiscount)} ({d.discountedSales})
            </span>
            <span>
              <i className="swatch line s2" /> Sem desconto {money(d.withoutDiscount)}
            </span>
          </>
        );
      }}
    />
  );
}
