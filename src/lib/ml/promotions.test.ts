import { describe, expect, test, vi } from 'vitest';
import { fetchPromotions, promotionKind, summarizeDiscounts, type PromoOrder } from './promotions';

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
    ]);
    expect(r.withDiscount).toEqual({ sales: 2, gross: 109.43, units: 4, avgTicket: 54.72 });
    expect(r.withoutDiscount).toEqual({ sales: 1, gross: 120, units: 2, avgTicket: 120 });
    expect(r.discountGiven).toBe(16.03);
    expect(r.share).toBeCloseTo(109.43 / 229.43);
    expect(r.top).toEqual([{ itemId: 'MLB1', title: 'Retentor', units: 4, gross: 109.43, discount: 16.03 }]);
  });

  test('pedido com a etiqueta de desconto conta mesmo sem preço cheio (ex.: cupom)', () => {
    const r = summarizeDiscounts([order({ id: 1, order_items: [{ item: { id: 'MLB1', title: 'x' }, quantity: 1, unit_price: 10, sale_fee: 1 }] })]);
    expect(r.withDiscount.sales).toBe(1);
    expect(r.discountGiven).toBe(0);
  });

  test('sem vendas não divide por zero', () => {
    expect(summarizeDiscounts([]).share).toBe(0);
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
      if (path.includes('/C-1/items')) return { paging: { total: 616 } };
      if (path.includes('/C-2/items')) throw new Error('404');
      if (path.includes('/C-9?')) return { budget: 82, remaining_budget: 2, used_coupons: 20 };
      throw new Error(`inesperado: ${path}`);
    });
    const rows = await fetchPromotions(42, get as never);
    expect(rows.map((r) => r.id)).toEqual(['C-1', 'C-9', 'C-2']);
    expect(rows[0]).toMatchObject({ name: 'Geral Outubro', kind: 'Campanha própria', activeItems: 616, coupon: null });
    expect(rows[1].coupon).toEqual({ label: 'R$ 4,00 de desconto acima de R$ 40,00', used: 20, budget: 82, remaining: 2 });
    expect(rows[2].activeItems).toBeNull();
    expect(get).toHaveBeenCalledWith('/seller-promotions/promotions/C-1/items?promotion_type=SELLER_CAMPAIGN&app_version=v2&status=started&limit=1');
  });

  test('tipo desconhecido aparece com o código do ML', () => {
    expect(promotionKind('DEAL')).toBe('Campanha do ML');
    expect(promotionKind('NOVO_TIPO')).toBe('NOVO_TIPO');
  });
});
