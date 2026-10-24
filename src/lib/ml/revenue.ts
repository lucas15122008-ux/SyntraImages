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

/**
 * Período atual e o anterior, do mesmo tamanho. Como no painel do ML, "últimos N dias" são os N dias
 * completos antes de hoje mais o dia de hoje até agora (7 dias em 23/10 vai de 16/10 a 23/10).
 */
export function periodRanges(days: Period, now = new Date()): { current: Range; previous: Range } {
  const back = days === 1 ? 0 : days;
  const from = new Date(brtMidnight(brtDay(now)).getTime() - back * DAY_MS);
  const span = (back + 1) * DAY_MS;
  return {
    current: { from, to: now },
    previous: { from: new Date(from.getTime() - span), to: new Date(now.getTime() - span) },
  };
}

/** Maior intervalo personalizado aceito: acima disso a busca de pedidos fica lenta demais. */
export const MAX_CUSTOM_DAYS = 180;

export type Selection = { kind: 'preset'; days: Period } | { kind: 'custom'; from: string; to: string };
export type ResolvedPeriod = { selection: Selection; current: Range; previous: Range; dayCount: number; error: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string | undefined): d is string => !!d && DATE.test(d) && brtDay(brtMidnight(d)) === d;

/**
 * Lê o período da URL: ?dias=7 (atalho) ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD (personalizado, dias de Brasília).
 * O período anterior do personalizado é o mesmo número de dias logo antes. Inválido volta para 30 dias com aviso.
 */
export function resolvePeriod(params: { dias?: string; de?: string; ate?: string }, now = new Date()): ResolvedPeriod {
  const preset = (days: Period, error: string | null = null): ResolvedPeriod => {
    const { current, previous } = periodRanges(days, now);
    return { selection: { kind: 'preset', days }, current, previous, dayCount: daysInRange(current).length, error };
  };

  if (params.de === undefined && params.ate === undefined) {
    const dias = Number(params.dias);
    return preset(PERIODS.includes(dias as Period) ? (dias as Period) : 30);
  }

  const today = brtDay(now);
  const { de, ate } = params;
  if (!validDay(de) || !validDay(ate)) return preset(30, 'Escolha as duas datas do período.');
  if (de > ate) return preset(30, 'A data inicial precisa vir antes da final.');
  if (de > today) return preset(30, 'O período não pode começar no futuro.');
  const to = ate > today ? today : ate;
  const from = brtMidnight(de);
  const end = to === today ? now : new Date(brtMidnight(to).getTime() + DAY_MS - 1);
  const current = { from, to: end };
  const dayCount = daysInRange(current).length;
  if (dayCount > MAX_CUSTOM_DAYS) return preset(30, `Escolha no máximo ${MAX_CUSTOM_DAYS} dias.`);
  const span = dayCount * DAY_MS;
  return {
    selection: { kind: 'custom', from: de, to },
    current,
    previous: { from: new Date(from.getTime() - span), to: new Date(from.getTime() - 1) },
    dayCount,
    error: null,
  };
}

/** Formato que a busca do ML aceita: horário de Brasília com o fuso explícito. */
export function mlDate(date: Date): string {
  return new Date(date.getTime() + BRT_MS).toISOString().replace('Z', BRT_OFFSET);
}

export type Revenue = {
  /** Vendas brutas, como no painel do ML: todos os pedidos do período, inclusive os cancelados depois. */
  gross: number;
  sales: number;
  units: number;
  avgTicket: number;
  avgUnitPrice: number;
  cancelled: { sales: number; amount: number };
  /** Só os pedidos pagos (bruto menos cancelados). */
  paid: number;
  fees: number;
  /** Pagos menos as tarifas de venda do ML. */
  net: number;
  daily: { day: string; gross: number; sales: number }[];
  top: { itemId: string; title: string; gross: number; units: number }[];
};

const cents = (n: number) => Math.round(n * 100) / 100;
/** Pedidos que entram nas vendas brutas; os de pagamento pendente ainda não são venda. */
const COUNTED = new Set(['paid', 'cancelled', 'partially_refunded']);

/** Os dias (AAAA-MM-DD, Brasília) cobertos pelo intervalo, do primeiro ao último. */
export function daysInRange(range: Range): string[] {
  const days: string[] = [];
  for (let d = brtDay(range.from); d <= brtDay(range.to); d = brtDay(new Date(brtMidnight(d).getTime() + DAY_MS))) days.push(d);
  return days;
}

export function summarizeRevenue(orders: MlOrder[], range: Range, topN = 10): Revenue {
  const daily = new Map(daysInRange(range).map((d) => [d, { day: d, gross: 0, sales: 0 }]));
  const items = new Map<string, { itemId: string; title: string; gross: number; units: number }>();
  let gross = 0;
  let sales = 0;
  let units = 0;
  let fees = 0;
  let cancelledSales = 0;
  let cancelledAmount = 0;

  for (const o of orders) {
    if (!COUNTED.has(o.status)) continue;
    // O ML conta cada pedido como uma venda, mesmo os de um mesmo carrinho.
    sales++;
    gross += o.total_amount;
    const bucket = daily.get(brtDay(o.date_created));
    if (bucket) {
      bucket.gross += o.total_amount;
      bucket.sales++;
    }
    const cancelled = o.status === 'cancelled';
    if (cancelled) {
      cancelledSales++;
      cancelledAmount += o.total_amount;
    }
    for (const line of o.order_items) {
      units += line.quantity;
      if (cancelled) continue;
      // sale_fee vem por unidade.
      fees += (line.sale_fee ?? 0) * line.quantity;
      const cur = items.get(line.item.id) ?? { itemId: line.item.id, title: line.item.title, gross: 0, units: 0 };
      cur.gross += line.unit_price * line.quantity;
      cur.units += line.quantity;
      items.set(line.item.id, cur);
    }
  }

  const paid = gross - cancelledAmount;
  return {
    gross: cents(gross),
    sales,
    units,
    avgTicket: sales ? cents(gross / sales) : 0,
    avgUnitPrice: units ? cents(gross / units) : 0,
    cancelled: { sales: cancelledSales, amount: cents(cancelledAmount) },
    paid: cents(paid),
    fees: cents(fees),
    net: cents(paid - fees),
    daily: [...daily.values()].map((b) => ({ ...b, gross: cents(b.gross) })),
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
