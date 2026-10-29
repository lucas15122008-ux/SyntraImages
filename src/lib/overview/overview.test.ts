import { describe, expect, test } from 'vitest';
import type { KitSummary } from '@/lib/kit/summary';
import type { MlOrder } from '@/lib/ml/revenue';
import { kitsNeedingAttention, ordersIn, overviewRanges, summarizeSales } from './overview';

const at = (iso: string) => new Date(iso);

function order(id: number, date: string, amount: number, status = 'paid'): MlOrder {
  return {
    id,
    status,
    date_created: date,
    total_amount: amount,
    pack_id: null,
    order_items: [{ item: { id: `MLB${id}`, title: `Peça ${id}` }, quantity: 1, unit_price: amount, sale_fee: 0 }],
  };
}

describe('intervalos do resumo', () => {
  test('a busca cobre a semana anterior e o mês inteiro', () => {
    // 29/10 12h em Brasília: semana anterior começa em 14/10; o mês em 01/10, que é antes.
    const r = overviewRanges(at('2026-10-29T15:00:00Z'));
    expect(r.today.from).toEqual(at('2026-10-29T03:00:00Z'));
    expect(r.yesterday).toEqual({ from: at('2026-10-28T03:00:00Z'), to: at('2026-10-28T15:00:00Z') });
    expect(r.week.from).toEqual(at('2026-10-22T03:00:00Z'));
    expect(r.prevWeek.from).toEqual(at('2026-10-14T03:00:00Z'));
    expect(r.fetch.from).toEqual(at('2026-10-01T03:00:00Z'));
  });

  test('no começo do mês a semana anterior começa antes do mês', () => {
    const r = overviewRanges(at('2026-11-03T15:00:00Z'));
    expect(r.month.from).toEqual(at('2026-11-01T03:00:00Z'));
    expect(r.fetch.from).toEqual(r.prevWeek.from);
    expect(r.fetch.from.getTime()).toBeLessThan(r.month.from.getTime());
  });
});

describe('vendas do resumo', () => {
  const now = at('2026-10-29T15:00:00Z');
  const orders = [
    order(1, '2026-10-29T10:00:00.000-03:00', 100), // hoje
    order(2, '2026-10-28T11:00:00.000-03:00', 50), // ontem antes da mesma hora
    order(3, '2026-10-28T20:00:00.000-03:00', 70), // ontem depois da mesma hora: não entra em "ontem"
    order(4, '2026-10-15T09:00:00.000-03:00', 30), // semana anterior
  ];

  test('separa os pedidos em cada intervalo', () => {
    const r = overviewRanges(now);
    expect(ordersIn(orders, r.today).map((o) => o.id)).toEqual([1]);
    const s = summarizeSales(orders, r);
    expect(s.today.gross).toBe(100);
    expect(s.yesterday.gross).toBe(50);
    expect(s.week.gross).toBe(220);
    expect(s.prevWeek.gross).toBe(30);
    expect(s.month.gross).toBe(250);
    expect(s.week.top.map((t) => t.itemId)).toEqual(['MLB1', 'MLB3', 'MLB2']);
  });
});

describe('kits que pedem atenção', () => {
  const summary = (failed: number, warnings: number): KitSummary => ({ total: 6, ready: 6 - failed, warnings, failed, state: failed ? 'attention' : 'ready', coverPath: null });

  test('lista só os kits com falha ou aviso, explicando o motivo', () => {
    const kits = [
      { id: 'a', summary: summary(0, 0) },
      { id: 'b', summary: summary(2, 0) },
      { id: 'c', summary: summary(1, 1) },
      { id: 'd', summary: summary(0, 3) },
    ];
    expect(kitsNeedingAttention(kits).map((k) => [k.kit.id, k.reason])).toEqual([
      ['b', '2 fotos falharam'],
      ['c', '1 foto falhou · 1 aviso de ângulo'],
      ['d', '3 avisos de ângulo'],
    ]);
  });
});
