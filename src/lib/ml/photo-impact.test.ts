import { describe, expect, test } from 'vitest';
import { impactWindows, parseItemId, salesInWindow, side, totalImpact, verdict, type Impact } from './photo-impact';
import type { MlOrder } from './revenue';

const order = (o: Partial<MlOrder> & { id: number }): MlOrder => ({
  status: 'paid',
  date_created: '2026-10-10T14:00:00.000-03:00',
  total_amount: 50,
  pack_id: null,
  order_items: [{ item: { id: 'MLB1', title: 'Retentor' }, quantity: 1, unit_price: 50, sale_fee: 6 }],
  ...o,
});

describe('janelas antes e depois', () => {
  test('mesmo tamanho dos dois lados, sem o dia da troca e sem hoje', () => {
    const w = impactWindows('2026-10-10', '2026-10-24');
    expect(w.days).toBe(13);
    expect(w.before).toEqual({ from: '2026-09-27', to: '2026-10-10' });
    expect(w.after).toEqual({ from: '2026-10-11', to: '2026-10-24' });
  });

  test('no máximo 30 dias de cada lado', () => {
    const w = impactWindows('2026-08-01', '2026-10-24');
    expect(w.days).toBe(30);
    expect(w.after).toEqual({ from: '2026-08-02', to: '2026-09-01' });
    expect(w.before).toEqual({ from: '2026-07-02', to: '2026-08-01' });
  });

  test('trocou hoje ou ontem: ainda não há dias para comparar', () => {
    expect(impactWindows('2026-10-24', '2026-10-24').days).toBe(0);
    expect(impactWindows('2026-10-23', '2026-10-24').days).toBe(0);
    expect(impactWindows('2026-10-22', '2026-10-24').days).toBe(1);
  });
});

describe('código do anúncio', () => {
  test('código puro, com hífen ou dentro do link', () => {
    expect(parseItemId(' mlb7457810918 ')).toEqual({ ok: true, itemId: 'MLB7457810918' });
    expect(parseItemId('MLB-7457810918')).toEqual({ ok: true, itemId: 'MLB7457810918' });
    expect(parseItemId('https://produto.mercadolivre.com.br/MLB-7457810918-retentor-da-polia-_JM')).toEqual({ ok: true, itemId: 'MLB7457810918' });
  });

  test('link de catálogo usa o wid; sem wid, pede o código', () => {
    expect(parseItemId('https://www.mercadolivre.com.br/retentor/p/MLB123456789?pdp_filters=item_id&wid=MLB7457810918')).toEqual({ ok: true, itemId: 'MLB7457810918' });
    expect(parseItemId('https://www.mercadolivre.com.br/retentor/p/MLB123456789').ok).toBe(false);
    expect(parseItemId('retentor fiesta').ok).toBe(false);
  });
});

describe('vendas na janela', () => {
  test('só pedidos pagos do anúncio, pelo dia de Brasília, sem o último dia', () => {
    const orders = [
      order({ id: 1 }),
      order({ id: 2, status: 'cancelled' }),
      order({ id: 3, order_items: [{ item: { id: 'MLB2', title: 'Outro' }, quantity: 1, unit_price: 80, sale_fee: 9 }] }),
      // 23h30 de 14/10 em Brasília já é 15/10 em UTC; conta no dia 14.
      order({ id: 4, date_created: '2026-10-15T02:30:00Z', order_items: [{ item: { id: 'MLB1', title: 'Retentor' }, quantity: 2, unit_price: 45, sale_fee: 6 }] }),
      order({ id: 5, date_created: '2026-10-15T12:00:00.000-03:00' }),
    ];
    expect(salesInWindow(orders, 'MLB1', { from: '2026-10-10', to: '2026-10-15' })).toEqual({ sales: 2, units: 3, gross: 140 });
  });
});

describe('veredito', () => {
  const s = (sales: number, visits: number) => side({ sales, units: sales, gross: sales * 50 }, visits);

  test('conversão sobe com visitas suficientes: melhorou', () => {
    expect(verdict(s(5, 500), s(20, 500), 30)).toBe('up');
    expect(verdict(s(20, 500), s(5, 500), 30)).toBe('down');
  });

  test('diferença pequena não é sinal', () => {
    expect(verdict(s(10, 500), s(12, 500), 30)).toBe('same');
  });

  test('poucas visitas ou poucos dias: não dá veredito', () => {
    expect(verdict(s(0, 10), s(3, 12), 30)).toBe('little_data');
    expect(verdict(s(5, 500), s(20, 500), 2)).toBe('waiting');
  });

  test('sem visitas, conversão fica vazia', () => {
    expect(s(0, 0).conversion).toBeNull();
  });
});

test('total soma só os anúncios com dias para comparar', () => {
  const s = (sales: number, visits: number) => side({ sales, units: sales, gross: sales * 50 }, visits);
  const impacts: Impact[] = [
    { days: 30, before: s(5, 500), after: s(20, 500), verdict: 'up' },
    { days: 10, before: s(2, 100), after: s(2, 120), verdict: 'same' },
    { days: 1, before: s(9, 90), after: s(0, 5), verdict: 'waiting' },
  ];
  const t = totalImpact(impacts);
  expect(t.listings).toBe(2);
  expect(t.before).toMatchObject({ sales: 7, visits: 600, gross: 350 });
  expect(t.after).toMatchObject({ sales: 22, visits: 620 });
  expect(t.improved).toBe(1);
  expect(t.worsened).toBe(0);
});
