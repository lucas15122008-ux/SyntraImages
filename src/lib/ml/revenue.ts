/** Faturamento a partir dos pedidos do Mercado Livre. Dias contados no horário de Brasília. */

const BRT_OFFSET = '-03:00';
const BRT_MS = -3 * 3600_000;
const DAY_MS = 86_400_000;
/** Máximo que a busca de pedidos do ML devolve por página. */
const PAGE = 51;

export type MlOrder = {
  id: number;
  status: string;
  date_created: string;
  total_amount: number;
  pack_id: number | null;
  order_items: { item: { id: string; title: string }; quantity: number; unit_price: number; sale_fee: number | null }[];
};

export type Period = 1 | 7 | 30 | 90;
export const PERIODS: Period[] = [1, 7, 30, 90];

export type Range = { from: Date; to: Date };

/** Dia (AAAA-MM-DD) em Brasília de um instante. */
export function brtDay(date: Date | string): string {
  return new Date(new Date(date).getTime() + BRT_MS).toISOString().slice(0, 10);
}

function brtMidnight(day: string): Date {
  return new Date(`${day}T00:00:00.000${BRT_OFFSET}`);
}

/** Período atual (desde a meia-noite de N-1 dias atrás até agora) e o anterior, do mesmo tamanho. */
export function periodRanges(days: Period, now = new Date()): { current: Range; previous: Range } {
  const from = new Date(brtMidnight(brtDay(now)).getTime() - (days - 1) * DAY_MS);
  const span = days * DAY_MS;
  return {
    current: { from, to: now },
    previous: { from: new Date(from.getTime() - span), to: new Date(now.getTime() - span) },
  };
}

/** Formato que a busca do ML aceita: horário de Brasília com o fuso explícito. */
export function mlDate(date: Date): string {
  return new Date(date.getTime() + BRT_MS).toISOString().replace('Z', BRT_OFFSET);
}

export type Revenue = {
  gross: number;
  fees: number;
  net: number;
  sales: number;
  orders: number;
  units: number;
  avgTicket: number;
  cancelled: { sales: number; amount: number };
  daily: { day: string; gross: number; sales: number }[];
  top: { itemId: string; title: string; gross: number; units: number }[];
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** Pedido pago conta como faturado; cancelado vai à parte; o resto (pagamento pendente etc.) fica de fora. */
export function summarizeRevenue(orders: MlOrder[], range: Range, topN = 10): Revenue {
  const days: string[] = [];
  for (let d = brtDay(range.from); d <= brtDay(range.to); d = brtDay(new Date(brtMidnight(d).getTime() + DAY_MS))) days.push(d);
  const daily = new Map(days.map((d) => [d, { day: d, gross: 0, sales: new Set<number>() }]));
  const items = new Map<string, { itemId: string; title: string; gross: number; units: number }>();
  const salesSet = new Set<number>();
  const cancelledSet = new Set<number>();
  let gross = 0;
  let fees = 0;
  let units = 0;
  let paidOrders = 0;
  let cancelledAmount = 0;

  for (const o of orders) {
    const sale = o.pack_id ?? o.id;
    if (o.status === 'cancelled') {
      cancelledSet.add(sale);
      cancelledAmount += o.total_amount;
      continue;
    }
    if (o.status !== 'paid') continue;
    paidOrders++;
    salesSet.add(sale);
    gross += o.total_amount;
    const bucket = daily.get(brtDay(o.date_created));
    if (bucket) {
      bucket.gross += o.total_amount;
      bucket.sales.add(sale);
    }
    for (const line of o.order_items) {
      // sale_fee vem por unidade.
      fees += (line.sale_fee ?? 0) * line.quantity;
      units += line.quantity;
      const cur = items.get(line.item.id) ?? { itemId: line.item.id, title: line.item.title, gross: 0, units: 0 };
      cur.gross += line.unit_price * line.quantity;
      cur.units += line.quantity;
      items.set(line.item.id, cur);
    }
  }

  return {
    gross: cents(gross),
    fees: cents(fees),
    net: cents(gross - fees),
    sales: salesSet.size,
    orders: paidOrders,
    units,
    avgTicket: salesSet.size ? cents(gross / salesSet.size) : 0,
    cancelled: { sales: cancelledSet.size, amount: cents(cancelledAmount) },
    daily: [...daily.values()].map((b) => ({ day: b.day, gross: cents(b.gross), sales: b.sales.size })),
    top: [...items.values()]
      .sort((a, b) => b.gross - a.gross)
      .slice(0, topN)
      .map((i) => ({ ...i, gross: cents(i.gross) })),
  };
}

export type SearchPage = { results: MlOrder[]; paging: { total: number } };

/** Todos os pedidos criados no intervalo, buscando as páginas em paralelo (poucas por vez). */
export async function fetchOrders(
  sellerId: number,
  range: Range,
  get: (path: string) => Promise<SearchPage>,
  concurrency = 4,
): Promise<MlOrder[]> {
  const path = (offset: number) =>
    `/orders/search?seller=${sellerId}&order.date_created.from=${encodeURIComponent(mlDate(range.from))}` +
    `&order.date_created.to=${encodeURIComponent(mlDate(range.to))}&sort=date_asc&limit=${PAGE}&offset=${offset}`;

  const first = await get(path(0));
  const offsets: number[] = [];
  for (let off = PAGE; off < first.paging.total; off += PAGE) offsets.push(off);

  const pages: MlOrder[][] = [first.results];
  for (let i = 0; i < offsets.length; i += concurrency) {
    const batch = await Promise.all(offsets.slice(i, i + concurrency).map((off) => get(path(off))));
    pages.push(...batch.map((p) => p.results));
  }
  // Um pedido pode mudar de página entre as chamadas; não conta duas vezes.
  const seen = new Map<number, MlOrder>();
  for (const o of pages.flat()) seen.set(o.id, o);
  return [...seen.values()];
}

/** Variação percentual; null quando não há base para comparar. */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}
