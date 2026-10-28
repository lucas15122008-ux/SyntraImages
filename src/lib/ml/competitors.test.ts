import { describe, expect, test, vi } from 'vitest';
import { mapLimit, radarFor, similarity, titleFromDescription, tokens, topItems } from './competitors';
import type { MlOrder } from './revenue';

const UP = 'Radiador De Água Vw Up 12v 1.0 2014 A 2019 Com Ar Ra32529';
const CAT = 'Radiadores de Água';

describe('parecido', () => {
  test('palavras sem acento, minúsculas, sem palavras vazias, com "1.0" inteiro', () => {
    expect(tokens('Radiador De Água Vw Up 1.0 Com Ar.')).toEqual(['radiador', 'agua', 'vw', 'up', '1.0', 'ar']);
  });

  test('o mesmo carro e anos contam; o nome da categoria não', () => {
    const upRival = 'Radiador Volkswagen Up 1.0 12v 2014 2015 2016 2017 2018 2019 com ar condicionado';
    const gol = 'Radiador P/ Gol G5 G6 G7 com Ar Condicionado IRB IR48109\nVolkswagen Gol 1.0 1.6';
    expect(similarity(UP, upRival, CAT)).toBeGreaterThanOrEqual(0.6);
    expect(similarity(UP, gol, CAT)).toBeLessThan(0.4);
  });

  test('título só com palavras da categoria não dá para comparar', () => {
    expect(similarity('Radiador de água', 'qualquer coisa', CAT)).toBe(0);
  });

  test('título do concorrente vem da primeira linha útil da descrição', () => {
    expect(titleFromDescription('\n\nok\nRadiador P/ Gol G5 G6 G7\nresto')).toBe('Radiador P/ Gol G5 G6 G7');
    expect(titleFromDescription('')).toBeNull();
    expect(titleFromDescription('x'.repeat(120))).toHaveLength(88);
  });
});

describe('anúncios principais', () => {
  test('soma pedidos pagos por anúncio e ordena pelo faturamento', () => {
    const o = (id: number, item: string, qty: number, price: number, status = 'paid'): MlOrder => ({
      id,
      status,
      date_created: '2026-10-23T12:00:00.000-04:00',
      total_amount: qty * price,
      pack_id: null,
      order_items: [{ item: { id: item, title: item }, quantity: qty, unit_price: price, sale_fee: 1 }],
    });
    expect(topItems([o(1, 'A', 1, 10), o(2, 'B', 1, 50), o(3, 'A', 5, 10), o(4, 'C', 9, 99, 'cancelled')], 5)).toEqual([
      { itemId: 'A', title: 'A', units: 6, gross: 60 },
      { itemId: 'B', title: 'B', units: 1, gross: 50 },
    ]);
  });
});

test('mapLimit mantém a ordem e respeita o limite', async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return n * 2;
  });
  expect(out).toEqual([2, 4, 6, 8, 10]);
  expect(peak).toBe(2);
});

describe('radar de um anúncio', () => {
  const ME = 213514959;
  const offer = (item_id: string, seller_id: number, price: number, extra = {}) => ({
    item_id,
    seller_id,
    price,
    shipping: { free_shipping: true, logistic_type: 'cross_docking' },
    ...extra,
  });

  const api: Record<string, unknown> = {
    '/items/MLB1': {
      id: 'MLB1',
      title: UP,
      price: 264.3,
      category_id: 'MLB193399',
      catalog_product_id: 'MLB70175633',
      catalog_listing: false,
      user_product_id: 'MLBU-ME',
      permalink: 'https://produto.mercadolivre.com.br/MLB-1',
      status: 'active',
    },
    '/categories/MLB193399': { name: CAT },
    '/highlights/MLB/category/MLB193399': {
      content: [
        { id: 'MLBU-GOL', position: 1, type: 'USER_PRODUCT' },
        { id: 'MLBU-UP', position: 2, type: 'USER_PRODUCT' },
        { id: 'MLBU-ME', position: 3, type: 'USER_PRODUCT' },
        { id: 'MLB999', position: 4, type: 'ITEM' },
        { id: 'MLBU-UP2', position: 5, type: 'USER_PRODUCT' },
      ],
    },
    '/products/MLB70175633/items': { results: [offer('MLB-ME', ME, 264.3), offer('MLB-CAT', 50, 255, { original_price: 300 })] },
    '/products/MLBU-GOL/items': { results: [offer('MLB-GOL', 10, 162.84)] },
    '/products/MLBU-UP/items': { results: [offer('MLB-UP', 20, 240, { shipping: { free_shipping: true, logistic_type: 'fulfillment' } })] },
    '/products/MLBU-UP2/items': { results: [offer('MLB-UP2', 30, 280)] },
    '/items/MLB-GOL/description': { plain_text: 'Radiador P/ Gol G5 G6 G7 com Ar Condicionado\nVolkswagen Gol 1.0 1.6' },
    '/items/MLB-UP/description': { plain_text: 'Radiador VW Up 1.0 12v 2014 a 2019 com ar\nAplicação: Up' },
    '/items/MLB-UP2/description': { plain_text: 'Radiador Up 1.0 2015 2016 2017 2018 ar condicionado' },
    '/users/20': { nickname: 'RIVALUP', seller_reputation: { power_seller_status: 'platinum' } },
  };
  const get = vi.fn(async (path: string) => {
    const key = path.split('?')[0];
    if (key in api) return api[key];
    throw new Error(`404 ${key}`);
  }) as unknown as <T>(path: string) => Promise<T>;

  test('acha nossa posição, junta catálogo e parecidos do ranking e calcula a diferença', async () => {
    const row = await radarFor({ itemId: 'MLB1', title: UP, units: 14, gross: 3500 }, ME, get);
    expect(row.position).toBe(3);
    expect(row.categoryName).toBe(CAT);
    expect(row.rivals.map((r) => [r.itemId, r.source, r.position])).toEqual([
      ['MLB-UP', 'category', 2],
      ['MLB-CAT', 'catalog', null],
      ['MLB-UP2', 'category', 5],
    ]);
    expect(row.rivals[0]).toMatchObject({ full: true, seller: { id: 20, nickname: 'RIVALUP', medal: 'platinum' }, title: 'Radiador VW Up 1.0 12v 2014 a 2019 com ar' });
    expect(row.rivals[1]).toMatchObject({ originalPrice: 300, seller: { nickname: null } });
    expect(row.others).toEqual([]);
    expect(row.cheapest?.price).toBe(240);
    expect(row.gap).toBeCloseTo((264.3 - 240) / 240);
  });

  test('sem nenhum parecido, mostra os mais vendidos só como referência', async () => {
    const only = { ...api, '/items/MLB1': { ...(api['/items/MLB1'] as object), catalog_product_id: null, title: 'Radiador de água Fiat Uno Mille' } };
    const g = (async (path: string) => {
      const key = path.split('?')[0];
      if (key in only) return only[key as keyof typeof only];
      throw new Error('404');
    }) as <T>(path: string) => Promise<T>;
    const row = await radarFor({ itemId: 'MLB1', title: 'x', units: 1, gross: 1 }, ME, g);
    expect(row.rivals).toEqual([]);
    expect(row.gap).toBeNull();
    expect(row.others.map((r) => r.itemId)).toEqual(['MLB-GOL', 'MLB-UP', 'MLB-UP2']);
  });

  test('usa o preço da promoção do nosso anúncio, não o preço cheio do /items', async () => {
    const promo = { ...api, '/items/MLB1/sale_price': { amount: 238, regular_amount: 264.3 } };
    const g = (async (path: string) => {
      const key = path.split('?')[0];
      if (key in promo) return promo[key as keyof typeof promo];
      throw new Error('404');
    }) as <T>(path: string) => Promise<T>;
    const row = await radarFor({ itemId: 'MLB1', title: UP, units: 1, gross: 1 }, ME, g);
    expect(row.price).toBe(238);
    expect(row.originalPrice).toBe(264.3);
    expect(row.gap).toBeCloseTo((238 - 240) / 240);
  });

  test('sem promoção (ou sale_price fora do ar), fica o preço do anúncio', async () => {
    const row = await radarFor({ itemId: 'MLB1', title: UP, units: 1, gross: 1 }, ME, get);
    expect(row.price).toBe(264.3);
    expect(row.originalPrice).toBeNull();
  });
});
