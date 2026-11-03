import { describe, expect, test } from 'vitest';
import { daysInMonth, fixedCostForDays, storeProfit } from './store-profit';

const range = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};

describe('custos fixos no período', () => {
  test('dias do mês', () => {
    expect(daysInMonth('2026-09-10')).toBe(30);
    expect(daysInMonth('2026-10-01')).toBe(31);
    expect(daysInMonth('2028-02-03')).toBe(29);
  });

  test('rateia por dia, cada mês com o seu tamanho', () => {
    const days = range('2026-09-08', '2026-10-07');
    // 23 dias de setembro (1800/30) + 7 de outubro (1800/31)
    expect(fixedCostForDays({ monthly: 1800, since: '2026-01-01', until: null }, days)).toBe(1786.45);
    // Começou no meio do período: só conta de 15/09 em diante.
    expect(fixedCostForDays({ monthly: 2200, since: '2026-09-15', until: null }, days)).toBe(1670.11);
  });

  test('custo encerrado para de contar depois do último dia', () => {
    const days = range('2026-09-01', '2026-09-30');
    expect(fixedCostForDays({ monthly: 300, since: '2026-01-01', until: '2026-09-10' }, days)).toBe(100);
    expect(fixedCostForDays({ monthly: 300, since: '2026-10-01', until: null }, days)).toBe(0);
  });
});

describe('lucro da loja', () => {
  test('soma o lucro dos produtos com custo, tira os fixos e calcula a margem sobre a receita toda', () => {
    const r = storeProfit(
      [
        { sales: { revenue: 1000, units: 10, fees: 120, shipments: 10 }, shippingPerShipment: 20, cost: 50 },
        { sales: { revenue: 500, units: 5, fees: 60, shipments: 5 }, shippingPerShipment: 20, cost: null },
      ],
      100,
    );
    // 1000 − 120 − 200 − 500 = 180
    expect(r).toMatchObject({ revenue: 1500, productProfit: 180, withProfit: 1, products: 2, fixed: 100, store: 80 });
    expect(r.margin).toBeCloseTo(80 / 1500);
  });

  test('aplica o imposto e devolve margem nula sem receita', () => {
    const r = storeProfit([{ sales: { revenue: 1000, units: 1, fees: 0, shipments: 1 }, shippingPerShipment: 0, cost: 0 }], 0, 10);
    expect(r.productProfit).toBe(900);
    expect(storeProfit([], 50).margin).toBeNull();
  });
});
