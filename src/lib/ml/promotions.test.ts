import { describe, expect, test, vi } from 'vitest';
import { fetchPromotions, promotionKind, splitPromotions, summarizeDiscounts, type PromoOrder, type PromotionRow } from './promotions';
import { periodRanges } from './revenue';

const range = periodRanges(7, new Date('2026-10-23T18:00:00Z')).current;

const order = (o: Partial<PromoOrder> & { id: number }): PromoOrder => ({
  status: 'paid',
  date_created: '2026-10-23T14:00:00.000-04:00',
  total_amount: 19.43,
  pack_id: null,
  tags: ['order_has_discount', 'paid'],
  order_items: [{ item: { id: 'MLB1', title: 'Retentor' }, quantity: 1, unit_price: 19.43, gross_price: 20.46, sale_fee: 2.33 }],
  ...o,
});

describe('vendas com desconto', () => {
  test('separa com e sem desconto e soma o desconto dado (preço cheio menos pago)', () => {
    const r = summarizeDiscounts([
      order({ id: 1 }),
      order({
        id: 2,
        total_amount: 120,
        tags: ['paid'],
        order_items: [{ item: { id: 'MLB2', title: 'Diafragma' }, quantity: 2, unit_price: 60, gross_price: 60, sale_fee: 7 }],
      }),
      order({
        id: 3,
        total_amount: 90,
        order_items: [{ item: { id: 'MLB1', title: 'Retentor' }, quantity: 3, unit_price: 30, gross_price: 35, sale_fee: 3 }],
      }),
      order({ id: 4, status: 'cancelled', total_amount: 500 }),
    ], range);
    expect(r.withDiscount).toEqual({ sales: 2, gross: 109.43, units: 4, avgTicket: 54.72 });
    expect(r.withoutDiscount).toEqual({ sales: 1, gross: 120, units: 2, avgTicket: 120 });
    expect(r.discountGiven).toBe(16.03);
    expect(r.share).toBeCloseTo(109.43 / 229.43);
    expect(r.top).toEqual([{ itemId: 'MLB1', title: 'Retentor', units: 4, gross: 109.43, discount: 16.03 }]);
  });

  test('pedido com a etiqueta de desconto conta mesmo sem preço cheio (ex.: cupom)', () => {
    const r = summarizeDiscounts([order({ id: 1, order_items: [{ item: { id: 'MLB1', title: 'x' }, quantity: 1, unit_price: 10, sale_fee: 1 }] })], range);
    expect(r.withDiscount.sales).toBe(1);
    expect(r.discountGiven).toBe(0);
  });

  test('sem vendas não divide por zero', () => {
    expect(summarizeDiscounts([], range).share).toBe(0);
  });

  test('por dia: separa o valor com e sem desconto, um ponto por dia do período', () => {
    const r = summarizeDiscounts(
      [order({ id: 1 }), order({ id: 2, tags: ['paid'], total_amount: 50, order_items: [{ item: { id: 'MLB2', title: 'y' }, quantity: 1, unit_price: 50, gross_price: 50, sale_fee: 5 }] })],
      range,
    );
    expect(r.daily).toHaveLength(8);
    expect(r.daily.at(-1)).toEqual({ day: '2026-10-23', withDiscount: 19.43, withoutDiscount: 50, discountedSales: 1, sales: 2 });
    expect(r.daily[0]).toEqual({ day: '2026-10-16', withDiscount: 0, withoutDiscount: 0, discountedSales: 0, sales: 0 });
  });
});

describe('campanhas', () => {
  test('lista as no ar e agendadas, com anúncios participando e uso do cupom', async () => {
    const get = vi.fn(async (path: string): Promise<unknown> => {
      if (path.startsWith('/seller-promotions/users/')) {
        return {
          results: [
            { id: 'C-2', type: 'SELLER_CAMPAIGN', status: 'pending', name: 'Geral Novembro', finish_date: '2026-12-01T02:59:59Z' },
            { id: 'C-1', type: 'SELLER_CAMPAIGN', status: 'started', name: 'Geral Outubro', finish_date: '2026-11-01T02:59:59Z' },
            { id: 'C-9', type: 'SELLER_COUPON_CAMPAIGN', status: 'started', name: 'seguidores', fixed_amount: 4, min_purchase_amount: 40 },
            { id: 'P-0', type: 'DEAL', status: 'finished', name: 'Antiga' },
          ],
        };
      }
      if (path.includes('/C-1/items')) return { paging: { total: path.includes('status=started') ? 616 : 181 } };
      if (path.includes('/C-2/items')) throw new Error('404');
      if (path.includes('/C-9?')) return { budget: 82, remaining_budget: 2, used_coupons: 20 };
      throw new Error(`inesperado: ${path}`);
    });
    const rows = await fetchPromotions(42, get as never);
    expect(rows.map((r) => r.id)).toEqual(['C-1', 'C-9', 'C-2']);
    expect(rows[0]).toMatchObject({ name: 'Geral Outubro', kind: 'Campanha própria', activeItems: 616, candidateItems: 181, coupon: null });
    expect(rows[1].coupon).toEqual({ label: 'R$ 4,00 de desconto acima de R$ 40,00', used: 20, budget: 82, remaining: 2 });
    expect(rows[2]).toMatchObject({ activeItems: null, candidateItems: null });
    expect(get).toHaveBeenCalledWith('/seller-promotions/promotions/C-1/items?promotion_type=SELLER_CAMPAIGN&app_version=v2&status=started&limit=1');
  });

  test('tipo desconhecido aparece com o código do ML', () => {
    expect(promotionKind('DEAL')).toBe('Campanha do ML');
    expect(promotionKind('NOVO_TIPO')).toBe('NOVO_TIPO');
  });
});

describe('participando x elegíveis', () => {
  const row = (r: Partial<PromotionRow> & { id: string }): PromotionRow => ({
    name: r.id, kind: 'x', status: 'started', start: null, finish: null, activeItems: 0, candidateItems: 0, coupon: null, ...r,
  });

  test('participa quem tem anúncio dentro ou é cupom; elegível quem tem candidatos, mais candidatos primeiro', () => {
    const { joined, eligible } = splitPromotions([
      row({ id: 'geral', activeItems: 616, candidateItems: 181 }),
      row({ id: 'black', activeItems: 2, candidateItems: 649 }),
      row({ id: 'smart', activeItems: 0, candidateItems: 71 }),
      row({ id: 'cupom', activeItems: null, candidateItems: null, coupon: { label: 'R$ 4', used: 20, budget: 82, remaining: 2 } }),
      row({ id: 'vazia' }),
    ]);
    expect(joined.map((r) => r.id)).toEqual(['geral', 'black', 'cupom']);
    expect(eligible.map((r) => r.id)).toEqual(['black', 'geral', 'smart']);
  });
});
