import { describe, expect, test, vi } from 'vitest';
import { brtDay, change, fetchOrders, mlDate, periodRanges, summarizeRevenue, type MlOrder } from './revenue';

const order = (o: Partial<MlOrder> & { id: number }): MlOrder => ({
  status: 'paid',
  date_created: '2026-10-23T14:00:00.000-04:00',
  total_amount: 100,
  pack_id: null,
  order_items: [{ item: { id: 'MLB1', title: 'Retentor' }, quantity: 1, unit_price: 100, sale_fee: 12 }],
  ...o,
});

describe('períodos em horário de Brasília', () => {
  test('dia de Brasília vira à meia-noite de -03:00', () => {
    expect(brtDay('2026-10-24T02:30:00Z')).toBe('2026-10-23');
    expect(brtDay('2026-10-24T03:00:00Z')).toBe('2026-10-24');
  });

  test('7 dias, como no ML: os 7 dias antes de hoje mais hoje; o anterior tem o mesmo tamanho', () => {
    const now = new Date('2026-10-23T18:00:00Z'); // 15h em Brasília
    const { current, previous } = periodRanges(7, now);
    expect(mlDate(current.from)).toBe('2026-10-16T00:00:00.000-03:00');
    expect(current.to).toEqual(now);
    expect(mlDate(previous.from)).toBe('2026-10-08T00:00:00.000-03:00');
    expect(mlDate(previous.to)).toBe('2026-10-15T15:00:00.000-03:00');
  });

  test('hoje: só desde a meia-noite', () => {
    const { current } = periodRanges(1, new Date('2026-10-23T18:00:00Z'));
    expect(mlDate(current.from)).toBe('2026-10-23T00:00:00.000-03:00');
  });
});

describe('resumo do faturamento', () => {
  const range = periodRanges(7, new Date('2026-10-23T18:00:00Z')).current;

  test('vendas brutas incluem as canceladas, como no ML; tarifa por unidade só nas pagas', () => {
    const r = summarizeRevenue(
      [
        order({ id: 1 }),
        order({
          id: 2,
          total_amount: 60,
          order_items: [{ item: { id: 'MLB2', title: 'Diafragma' }, quantity: 3, unit_price: 20, sale_fee: 2.5 }],
        }),
        order({ id: 3, status: 'cancelled', total_amount: 40 }),
        order({ id: 4, status: 'payment_in_process', total_amount: 999 }),
      ],
      range,
    );
    expect(r.gross).toBe(200);
    expect(r.sales).toBe(3);
    expect(r.units).toBe(5);
    expect(r.avgTicket).toBe(66.67);
    expect(r.avgUnitPrice).toBe(40);
    expect(r.cancelled).toEqual({ sales: 1, amount: 40 });
    expect(r.paid).toBe(160);
    expect(r.fees).toBe(19.5);
    expect(r.net).toBe(140.5);
    expect(r.top.map((t) => t.itemId)).toEqual(['MLB1', 'MLB2']);
    expect(r.top[1]).toEqual({ itemId: 'MLB2', title: 'Diafragma', gross: 60, units: 3 });
  });

  test('cada pedido conta como uma venda, mesmo do mesmo carrinho (como no ML)', () => {
    const r = summarizeRevenue([order({ id: 1, pack_id: 9 }), order({ id: 2, pack_id: 9 })], range);
    expect(r.sales).toBe(2);
    expect(r.avgTicket).toBe(100);
  });

  test('um ponto por dia do período, inclusive os sem venda', () => {
    const r = summarizeRevenue([order({ id: 1, date_created: '2026-10-23T01:00:00.000-03:00' }), order({ id: 2, date_created: '2026-10-22T23:30:00.000-03:00' })], range);
    expect(r.daily.map((d) => d.day)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    expect(r.daily.at(-1)).toEqual({ day: '2026-10-23', gross: 100, sales: 1 });
    expect(r.daily.at(-2)).toEqual({ day: '2026-10-22', gross: 100, sales: 1 });
  });

  test('sem vendas não divide por zero', () => {
    expect(summarizeRevenue([], range).avgTicket).toBe(0);
    expect(change(10, 0)).toBeNull();
    expect(change(150, 100)).toBe(0.5);
  });
});

describe('busca de pedidos', () => {
  test('pagina de 51 em 51 e não repete pedido que mudou de página', async () => {
    const get = vi.fn(async (path: string) => {
      const offset = Number(new URL(path, 'https://x').searchParams.get('offset'));
      const ids = offset === 0 ? [1, 2] : offset === 51 ? [2, 3] : [4];
      return { results: ids.map((id) => order({ id })), paging: { total: 120 } };
    });
    const range = periodRanges(7, new Date('2026-10-23T18:00:00Z')).current;
    const orders = await fetchOrders(42, range, get);
    expect(orders.map((o) => o.id)).toEqual([1, 2, 3, 4]);
    expect(get).toHaveBeenCalledTimes(3);
    const url = new URL(get.mock.calls[0][0], 'https://x');
    expect(url.searchParams.get('seller')).toBe('42');
    expect(url.searchParams.get('order.date_created.from')).toBe('2026-10-16T00:00:00.000-03:00');
    expect(url.searchParams.get('limit')).toBe('51');
  });
});
