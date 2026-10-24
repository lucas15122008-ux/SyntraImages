/** Métricas de promoções: o que as vendas do período tiveram de desconto e quais campanhas estão no ar. */
import { brtDay, daysInRange, type MlOrder, type Range } from './revenue';

export type PromoOrder = MlOrder & {
  tags?: string[];
  order_items: (MlOrder['order_items'][number] & { gross_price?: number | null })[];
};

const COUNTED = new Set(['paid', 'partially_refunded']);
const cents = (n: number) => Math.round(n * 100) / 100;

export type DiscountSummary = {
  withDiscount: { sales: number; gross: number; units: number; avgTicket: number };
  withoutDiscount: { sales: number; gross: number; units: number; avgTicket: number };
  /** Quanto as vendas deixaram de cobrar: preço cheio menos preço pago, somando as unidades. */
  discountGiven: number;
  /** Parte das vendas pagas que saiu com desconto (0 a 1). */
  share: number;
  top: { itemId: string; title: string; units: number; gross: number; discount: number }[];
  daily: { day: string; withDiscount: number; withoutDiscount: number; discountedSales: number; sales: number }[];
};

/** Desconto de uma linha do pedido; o ML manda o preço cheio em gross_price. */
function lineDiscount(line: PromoOrder['order_items'][number]): number {
  const full = line.gross_price ?? line.unit_price;
  return Math.max(0, full - line.unit_price) * line.quantity;
}

/** Só pedidos pagos: venda cancelada não teve desconto de verdade. */
export function summarizeDiscounts(orders: PromoOrder[], range: Range, topN = 10): DiscountSummary {
  const acc = {
    with: { sales: 0, gross: 0, units: 0 },
    without: { sales: 0, gross: 0, units: 0 },
  };
  let discountGiven = 0;
  const daily = new Map(daysInRange(range).map((d) => [d, { day: d, withDiscount: 0, withoutDiscount: 0, discountedSales: 0, sales: 0 }]));
  const items = new Map<string, DiscountSummary['top'][number]>();

  for (const o of orders) {
    if (!COUNTED.has(o.status)) continue;
    const discount = o.order_items.reduce((s, l) => s + lineDiscount(l), 0);
    const discounted = discount > 0 || (o.tags ?? []).includes('order_has_discount');
    const bucket = discounted ? acc.with : acc.without;
    bucket.sales++;
    bucket.gross += o.total_amount;
    discountGiven += discount;
    const day = daily.get(brtDay(o.date_created));
    if (day) {
      day.sales++;
      if (discounted) {
        day.withDiscount += o.total_amount;
        day.discountedSales++;
      } else day.withoutDiscount += o.total_amount;
    }
    for (const line of o.order_items) {
      bucket.units += line.quantity;
      if (!discounted) continue;
      const cur = items.get(line.item.id) ?? { itemId: line.item.id, title: line.item.title, units: 0, gross: 0, discount: 0 };
      cur.units += line.quantity;
      cur.gross += line.unit_price * line.quantity;
      cur.discount += lineDiscount(line);
      items.set(line.item.id, cur);
    }
  }

  const finish = (b: { sales: number; gross: number; units: number }) => ({
    ...b,
    gross: cents(b.gross),
    avgTicket: b.sales ? cents(b.gross / b.sales) : 0,
  });
  const total = acc.with.gross + acc.without.gross;
  return {
    withDiscount: finish(acc.with),
    withoutDiscount: finish(acc.without),
    discountGiven: cents(discountGiven),
    share: total ? acc.with.gross / total : 0,
    top: [...items.values()]
      .sort((a, b) => b.gross - a.gross)
      .slice(0, topN)
      .map((i) => ({ ...i, gross: cents(i.gross), discount: cents(i.discount) })),
    daily: [...daily.values()].map((d) => ({ ...d, withDiscount: cents(d.withDiscount), withoutDiscount: cents(d.withoutDiscount) })),
  };
}

// ───────────── Campanhas do vendedor ─────────────

export type MlPromotion = {
  id: string;
  type: string;
  sub_type?: string;
  status: string;
  name?: string;
  start_date?: string;
  finish_date?: string;
  fixed_amount?: number;
  fixed_percentage?: number;
  min_purchase_amount?: number;
};

export type CouponDetail = { budget?: number; remaining_budget?: number; used_coupons?: number };

export type PromotionRow = {
  id: string;
  name: string;
  kind: string;
  status: 'started' | 'pending' | string;
  start: string | null;
  finish: string | null;
  /** Anúncios participando agora (null quando o ML não informa). */
  activeItems: number | null;
  /** Anúncios que podem entrar e ainda não entraram. */
  candidateItems: number | null;
  coupon: { label: string; used: number | null; budget: number | null; remaining: number | null } | null;
};

const KIND: Record<string, string> = {
  DEAL: 'Campanha do ML',
  MARKETPLACE_CAMPAIGN: 'Campanha com coparticipação',
  SELLER_CAMPAIGN: 'Campanha própria',
  SMART: 'Campanha automática',
  PRICE_MATCHING: 'Preço competitivo',
  PRICE_MATCHING_MELI_ALL: 'Preço competitivo',
  LIGHTNING: 'Oferta relâmpago',
  SMART_LIGHTNING: 'Oferta relâmpago',
  DOD: 'Oferta do dia',
  PRICE_DISCOUNT: 'Desconto no anúncio',
  VOLUME: 'Desconto por quantidade',
  PRE_NEGOTIATED: 'Desconto pré-acordado',
  UNHEALTHY_STOCK: 'Liquidação de estoque Full',
  SELLER_COUPON_CAMPAIGN: 'Cupom',
};

export const promotionKind = (type: string) => KIND[type] ?? type;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function couponLabel(p: MlPromotion): string {
  const off = p.fixed_amount ? `${brl.format(p.fixed_amount)} de desconto` : p.fixed_percentage ? `${p.fixed_percentage}% de desconto` : 'Desconto';
  return p.min_purchase_amount ? `${off} acima de ${brl.format(p.min_purchase_amount)}` : off;
}

type ItemsPage = { paging?: { total?: number } };

/**
 * Campanhas ativas e agendadas, com quantos anúncios participam (ou o uso do cupom).
 * Uma chamada por campanha, poucas por vez; se uma falhar, mostra o resto.
 */
export async function fetchPromotions(
  sellerId: number,
  get: <T>(path: string) => Promise<T>,
  concurrency = 4,
): Promise<PromotionRow[]> {
  const list = await get<{ results: MlPromotion[] | null }>(`/seller-promotions/users/${sellerId}?app_version=v2`);
  const promos = (list.results ?? []).filter((p) => p.status === 'started' || p.status === 'pending');

  const rows: PromotionRow[] = [];
  for (let i = 0; i < promos.length; i += concurrency) {
    const batch = await Promise.all(
      promos.slice(i, i + concurrency).map(async (p): Promise<PromotionRow> => {
        const base = {
          id: p.id,
          name: p.name ?? promotionKind(p.type),
          kind: promotionKind(p.type),
          status: p.status,
          start: p.start_date ?? null,
          finish: p.finish_date ?? null,
        };
        if (p.type === 'SELLER_COUPON_CAMPAIGN') {
          const d = await get<CouponDetail>(`/seller-promotions/promotions/${p.id}?promotion_type=${p.type}&app_version=v2`).catch(() => ({}) as CouponDetail);
          return {
            ...base,
            activeItems: null,
            candidateItems: null,
            coupon: { label: couponLabel(p), used: d.used_coupons ?? null, budget: d.budget ?? null, remaining: d.remaining_budget ?? null },
          };
        }
        const total = (status?: string) =>
          get<ItemsPage>(`/seller-promotions/promotions/${p.id}/items?promotion_type=${p.type}&app_version=v2${status ? `&status=${status}` : ''}&limit=1`)
            .then((r) => r.paging?.total ?? 0)
            .catch(() => null);
        const [activeItems, candidates, all] = await Promise.all([total('started'), total('candidate'), total()]);
        // Em algumas campanhas (ex.: SELLER_CAMPAIGN) o ML devolve no total de "candidate" o total geral,
        // ignorando o filtro; os elegíveis não passam de "todos menos os que já participam".
        const candidateItems = candidates === null ? null : all === null ? candidates : Math.min(candidates, Math.max(0, all - (activeItems ?? 0)));
        return { ...base, activeItems, candidateItems, coupon: null };
      }),
    );
    rows.push(...batch);
  }
  // No ar primeiro, depois as agendadas; dentro de cada grupo, a que termina antes vem antes.
  return rows.sort(
    (a, b) =>
      Number(a.status !== 'started') - Number(b.status !== 'started') ||
      (a.finish ?? '9999').localeCompare(b.finish ?? '9999'),
  );
}

/** Onde cada campanha aparece: as que já têm anúncio seu (ou cupom) e as que têm anúncios elegíveis. */
export function splitPromotions(rows: PromotionRow[]): { joined: PromotionRow[]; eligible: PromotionRow[] } {
  return {
    joined: rows.filter((r) => r.coupon || (r.activeItems ?? 0) > 0),
    eligible: rows.filter((r) => (r.candidateItems ?? 0) > 0).sort((a, b) => (b.candidateItems ?? 0) - (a.candidateItems ?? 0)),
  };
}
