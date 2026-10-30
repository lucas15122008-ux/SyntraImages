import { describe, expect, test } from 'vitest';
import { estimateProfit, fetchListings, healthLevel, listingHealth, salesByProduct } from './products';
import type { MlOrder } from './revenue';

const order = (o: Partial<MlOrder> & { id: number }): MlOrder => ({
  status: 'paid',
  date_created: '2026-10-23T14:00:00.000-04:00',
  total_amount: 100,
  pack_id: null,
  shipping: { id: o.id * 10 },
  order_items: [{ item: { id: 'MLB1', title: 'Retentor' }, quantity: 1, unit_price: 100, sale_fee: 12 }],
  ...o,
});

describe('vendas por produto', () => {
  test('soma receita, unidades, pedidos e tarifa; canceladas ficam à parte', () => {
    const m = salesByProduct([
      order({ id: 1 }),
      order({ id: 2, order_items: [{ item: { id: 'MLB1', title: 'Retentor' }, quantity: 2, unit_price: 90, sale_fee: 10 }] }),
      order({ id: 3, status: 'cancelled' }),
      order({ id: 4, status: 'payment_required' }),
    ]);
    expect(m.get('MLB1')).toEqual({ itemId: 'MLB1', title: 'Retentor', revenue: 280, units: 3, orders: 2, shipments: 2, fees: 32, cancelled: 1 });
  });

  test('pedidos do mesmo carrinho contam um envio só', () => {
    const m = salesByProduct([order({ id: 1, shipping: { id: 99 } }), order({ id: 2, shipping: { id: 99 } })]);
    expect(m.get('MLB1')?.orders).toBe(2);
    expect(m.get('MLB1')?.shipments).toBe(1);
  });

  test('pedido sem envio conta como um envio próprio', () => {
    const m = salesByProduct([order({ id: 1, shipping: null }), order({ id: 2, shipping: null })]);
    expect(m.get('MLB1')?.shipments).toBe(2);
  });
});

describe('lucro estimado', () => {
  test('receita − tarifa − frete por envio − custo por unidade − imposto', () => {
    const r = estimateProfit({ revenue: 300, units: 3, fees: 36, shipments: 2, shippingPerShipment: 20, cost: 40, taxPct: 10 });
    // 300 − 36 − 40 − 120 − 30
    expect(r).toEqual({ profit: 74, margin: 74 / 300 });
  });

  test('sem custo ou sem frete não dá para estimar', () => {
    expect(estimateProfit({ revenue: 100, units: 1, fees: 12, shipments: 1, shippingPerShipment: 20, cost: null })).toBeNull();
    expect(estimateProfit({ revenue: 100, units: 1, fees: 12, shipments: 1, shippingPerShipment: null, cost: 10 })).toBeNull();
  });
});

describe('saúde do anúncio', () => {
  test('faixas da nota', () => {
    expect(healthLevel(85)).toBe('good');
    expect(healthLevel(70)).toBe('medium');
    expect(healthLevel(40)).toBe('bad');
    expect(healthLevel(null)).toBeNull();
  });

  test('nota do ML vem de 0 a 1; pausado sem estoque aparece em palavras', () => {
    expect(listingHealth({ id: 'MLB1', health: 0.77, status: 'paused', sub_status: ['out_of_stock'], available_quantity: 0 })).toEqual({
      score: 77,
      level: 'medium',
      status: 'Pausado sem estoque',
      active: false,
      stock: 0,
    });
    expect(listingHealth({ id: 'MLB1', status: 'active', available_quantity: 3 }).score).toBeNull();
  });

  test('busca de 20 em 20 e ignora os que o ML não devolve', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `MLB${i}`);
    const paths: string[] = [];
    const get = async <T,>(path: string) => {
      paths.push(path);
      const chunk = decodeURIComponent(path).match(/ids=([^&]+)/)![1].split(',');
      return chunk.map((id) => (id === 'MLB3' ? { code: 404, body: { id } } : { code: 200, body: { id, status: 'active', health: 0.9 } })) as T;
    };
    const m = await fetchListings(ids, get);
    expect(paths).toHaveLength(2);
    expect(m.size).toBe(24);
    expect(m.get('MLB0')?.health.level).toBe('good');
  });
});
