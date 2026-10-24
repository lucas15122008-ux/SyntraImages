import { describe, expect, test, vi } from 'vitest';
import {
  buildRows,
  fetchCampaignOffers,
  fetchItemOffers,
  normalizeOffer,
  parseMoney,
  projection,
  saleFee,
  unitProfit,
  unitsByItem,
  verdict,
  type Get,
} from './simulate';

describe('conta por venda', () => {
  test('lucro = preço + parte do ML − tarifa − frete − custo − imposto', () => {
    expect(unitProfit({ price: 100, fee: 17, shipping: 20, cost: 40 })).toBe(23);
    expect(unitProfit({ price: 100, meliRebate: 3, fee: 17, shipping: 20, cost: 40, taxPct: 10 })).toBe(15.7);
  });

  test('tarifa usa o percentual e a parte fixa', () => {
    expect(saleFee(273.96, { pct: 17, fixed: 0 })).toBe(46.57);
    expect(saleFee(50, { pct: 12, fixed: 1.5 })).toBe(7.5);
  });

  test('veredito: prejuízo, melhor ou quanto a mais vender', () => {
    expect(verdict(20, -1)).toEqual({ kind: 'loss' });
    expect(verdict(20, 0)).toEqual({ kind: 'loss' });
    expect(verdict(-5, 3)).toEqual({ kind: 'better' });
    expect(verdict(20, 25)).toEqual({ kind: 'better' });
    const v = verdict(20, 16);
    expect(v.kind).toBe('needs');
    if (v.kind === 'needs') expect(v.extra).toBeCloseTo(0.25);
  });

  test('projeção até o fim da campanha', () => {
    expect(projection(1, 10, 30, 20, 16)).toEqual({ without: 200, with: 208 });
  });

  test('lê valores digitados em reais', () => {
    expect(parseMoney('29,90')).toBe(29.9);
    expect(parseMoney('R$ 1.234,50')).toBe(1234.5);
    expect(parseMoney('12.5')).toBe(12.5);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('-3')).toBeNull();
  });

  test('conta só unidades de pedidos pagos', () => {
    const line = (id: string, quantity: number) => ({ item: { id, title: id }, quantity, unit_price: 10, sale_fee: 1 });
    const base = { date_created: '2026-10-20T10:00:00-03:00', total_amount: 10, pack_id: null };
    const u = unitsByItem([
      { ...base, id: 1, status: 'paid', order_items: [line('A', 2), line('B', 1)] },
      { ...base, id: 2, status: 'cancelled', order_items: [line('A', 5)] },
      { ...base, id: 3, status: 'partially_refunded', order_items: [line('A', 1)] },
    ]);
    expect(u.get('A')).toBe(3);
    expect(u.get('B')).toBe(1);
  });
});

describe('ofertas do ML', () => {
  const deal = { id: 'P-1', type: 'DEAL', name: '11.11' };

  test('campanha com faixa de preço usa o sugerido e guarda a faixa', () => {
    const o = normalizeOffer(
      { status: 'candidate', original_price: 50.73, min_discounted_price: 10.15, max_discounted_price: 44.28, suggested_discounted_price: 39.2 },
      deal,
    );
    expect(o).toMatchObject({ price: 39.2, range: { min: 10.15, max: 44.28 }, meliPct: 0 });
  });

  test('campanha com coparticipação tem preço fixo e a parte do ML', () => {
    const o = normalizeOffer(
      { status: 'candidate', price: 273.96, original_price: 303.69, meli_percentage: 2.3, end_date: '2026-12-14T17:46:46Z' },
      { id: 'P-2', type: 'SMART', name: 'Impulsione' },
    );
    expect(o).toMatchObject({ price: 273.96, range: null, meliPct: 2.3, finish: '2026-12-14T17:46:46Z' });
  });

  test('relâmpago usa o preço do ML como teto da faixa', () => {
    const o = normalizeOffer(
      { status: 'candidate', price: 34.02, original_price: 35.07, min_discounted_price: 10.52 },
      { id: 'LGH', type: 'LIGHTNING', name: 'Relâmpago' },
    );
    expect(o).toMatchObject({ price: 34.02, range: { min: 10.52, max: 34.02 } });
  });

  test('página da campanha e próxima página', async () => {
    const get = vi.fn(async () => ({
      results: [{ id: 'MLB1', status: 'candidate', original_price: 10, max_discounted_price: 9, min_discounted_price: 2, suggested_discounted_price: 8 }],
      paging: { total: 5, searchAfter: 'abc' },
    })) as unknown as Get;
    const p = await fetchCampaignOffers(deal, get, 'x/y', 1);
    expect(p.offers).toHaveLength(1);
    expect(p.next).toBe('abc');
    expect(p.total).toBe(5);
    expect((get as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toContain('status=candidate&limit=1&searchAfter=x%2Fy');
  });

  test('ofertas de um anúncio: ignora cupons e diz em qual já está', async () => {
    const get = (async () => [
      { id: 'C-1', type: 'SELLER_CAMPAIGN', status: 'started', price: 282.43, original_price: 303.69, name: 'Geral Outubro' },
      { id: 'C-2', type: 'SELLER_COUPON_CAMPAIGN', status: 'candidate', price: 0, original_price: 303.69, name: 'seguidores' },
      { id: 'P-1', type: 'DEAL', status: 'candidate', price: 0, original_price: 303.69, min_discounted_price: 60, max_discounted_price: 273.96, suggested_discounted_price: 243.59, name: '11.11' },
    ]) as unknown as Get;
    const r = await fetchItemOffers('MLB1', get);
    expect(r.activeName).toBe('Geral Outubro');
    expect(r.offers.map((o) => o.promotionId)).toEqual(['P-1']);
  });

  test('monta as linhas com tarifa e frete nos dois preços', async () => {
    const get = (async (path: string) => {
      if (path.startsWith('/items?')) return [{ code: 200, body: { id: 'MLB1', title: 'Radiador', price: 303.69, category_id: 'C', listing_type_id: 'gold_pro', available_quantity: 8 } }];
      if (path.startsWith('/sites/MLB/listing_prices')) return { sale_fee_amount: 51.63, sale_fee_details: { percentage_fee: 17, fixed_fee: 0 } };
      if (path.includes('shipping_options')) return { coverage: { all_country: { list_cost: path.includes('item_price=303.69') ? 49.35 : 40 } } };
      throw new Error(path);
    }) as Get;
    const offer = normalizeOffer({ status: 'candidate', price: 273.96, original_price: 303.69, meli_percentage: 2.3 }, { id: 'P', type: 'SMART', name: 'x' })!;
    const rows = await buildRows(1, [{ itemId: 'MLB1', offer }], new Map([['MLB1', 4]]), get);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ shippingNow: 49.35, shippingPromo: 40, units30: 4, fee: { pct: 17, fixed: 0 } });
  });
});
