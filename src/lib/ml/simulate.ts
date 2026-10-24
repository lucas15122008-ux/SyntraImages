/**
 * Simulador de promoção: quanto sobra por venda hoje e na campanha, e quanto a mais
 * é preciso vender para a campanha compensar. Tarifa e frete vêm do próprio ML.
 */
import type { MlOrder } from './revenue';

const cents = (n: number) => Math.round(n * 100) / 100;

// ───────────── Conta por venda ─────────────

export type UnitInput = {
  /** Preço que o comprador paga. */
  price: number;
  /** Parte do desconto que o ML banca e devolve ao vendedor, em R$ por unidade. */
  meliRebate?: number;
  /** Tarifa de venda do ML por unidade. */
  fee: number;
  /** Frete que a loja paga por unidade (inclui o custo fixo das vendas abaixo de R$ 79). */
  shipping: number;
  cost: number;
  /** Imposto sobre a venda, em % do que a loja recebe. */
  taxPct?: number;
};

/** Lucro de uma unidade. */
export function unitProfit(u: UnitInput): number {
  const revenue = u.price + (u.meliRebate ?? 0);
  const tax = (revenue * (u.taxPct ?? 0)) / 100;
  return cents(revenue - u.fee - u.shipping - u.cost - tax);
}

/** Tarifa de venda num preço, a partir do percentual e da parte fixa da categoria. */
export function saleFee(price: number, rule: FeeRule): number {
  return cents((price * rule.pct) / 100 + rule.fixed);
}

export type Verdict =
  | { kind: 'loss' }
  | { kind: 'better' }
  /** extra: quanto a mais é preciso vender (0,25 = 25%) para lucrar o mesmo que hoje. */
  | { kind: 'needs'; extra: number };

/** Compara o lucro por venda de hoje com o da campanha. */
export function verdict(now: number, promo: number): Verdict {
  if (promo <= 0) return { kind: 'loss' };
  if (promo >= now || now <= 0) return { kind: 'better' };
  return { kind: 'needs', extra: now / promo - 1 };
}

/** Lucro do período com e sem a campanha, dado o ritmo atual de vendas e o aumento esperado. */
export function projection(dailyUnits: number, days: number, liftPct: number, now: number, promo: number) {
  const base = dailyUnits * days;
  return { without: cents(base * now), with: cents(base * (1 + liftPct / 100) * promo) };
}

/** Unidades pagas por anúncio. */
export function unitsByItem(orders: MlOrder[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== 'paid' && o.status !== 'partially_refunded') continue;
    for (const l of o.order_items) out.set(l.item.id, (out.get(l.item.id) ?? 0) + l.quantity);
  }
  return out;
}

/** Converte o texto digitado ("29,90", "R$ 1.234,5") em número; null se não der. */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[R$\s]/g, '');
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ───────────── Dados do ML ─────────────

export type Get = <T>(path: string) => Promise<T>;

export type FeeRule = { pct: number; fixed: number };

/** Uma oferta candidata como o ML devolve, tanto na lista da campanha quanto na do anúncio. */
export type RawOffer = {
  id?: string;
  type?: string;
  sub_type?: string;
  status: string;
  name?: string;
  price?: number;
  original_price: number;
  min_discounted_price?: number;
  max_discounted_price?: number;
  suggested_discounted_price?: number;
  meli_percentage?: number;
  finish_date?: string;
  end_date?: string;
};

export type Offer = {
  promotionId: string;
  promotionType: string;
  promotionName: string;
  originalPrice: number;
  /** Preço sugerido (ou o fixo, quando o ML não deixa escolher). */
  price: number;
  /** Faixa permitida quando dá para escolher o preço; null quando o preço é fixo. */
  range: { min: number; max: number } | null;
  /** % do preço original que o ML banca (campanhas com coparticipação). */
  meliPct: number;
  finish: string | null;
};

/** Tipos em que o preço é escolhido pelo vendedor dentro de uma faixa. */
const FLEXIBLE = new Set(['DEAL', 'SELLER_CAMPAIGN', 'LIGHTNING', 'PRICE_DISCOUNT', 'DOD']);

/** Cupons não mudam o preço do anúncio; ficam fora do simulador. */
export const SIMULABLE = (type: string) => type !== 'SELLER_COUPON_CAMPAIGN' && type !== 'VOLUME';

export function normalizeOffer(raw: RawOffer, promo: { id: string; type: string; name: string }): Offer | null {
  const meliPct = raw.meli_percentage ?? 0;
  const price = raw.suggested_discounted_price || raw.price || raw.max_discounted_price || 0;
  if (!price) return null;
  const max = raw.max_discounted_price ?? (promo.type === 'LIGHTNING' ? raw.price : undefined);
  const flexible = FLEXIBLE.has(promo.type) && raw.min_discounted_price !== undefined && max !== undefined;
  return {
    promotionId: promo.id,
    promotionType: promo.type,
    promotionName: promo.name,
    originalPrice: raw.original_price,
    price,
    range: flexible ? { min: raw.min_discounted_price!, max: max! } : null,
    meliPct,
    finish: raw.finish_date ?? raw.end_date ?? null,
  };
}

export type ItemInfo = {
  id: string;
  title: string;
  thumbnail: string | null;
  price: number;
  categoryId: string;
  listingType: string;
  stock: number;
};

type RawItem = {
  id: string;
  title: string;
  thumbnail?: string;
  price: number;
  category_id: string;
  listing_type_id: string;
  available_quantity?: number;
};

/** Dados dos anúncios, de 20 em 20 (limite do ML). */
export async function fetchItems(ids: string[], get: Get): Promise<Map<string, ItemInfo>> {
  const out = new Map<string, ItemInfo>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const pages = await Promise.all(
    chunks.map((c) =>
      get<{ code: number; body: RawItem }[]>(
        `/items?ids=${c.join(',')}&attributes=id,title,thumbnail,price,category_id,listing_type_id,available_quantity`,
      ),
    ),
  );
  for (const r of pages.flat()) {
    if (r.code !== 200) continue;
    const b = r.body;
    out.set(b.id, {
      id: b.id,
      title: b.title,
      thumbnail: b.thumbnail?.replace(/^http:/, 'https:') ?? null,
      price: b.price,
      categoryId: b.category_id,
      listingType: b.listing_type_id,
      stock: b.available_quantity ?? 0,
    });
  }
  return out;
}

type ListingPrice = { sale_fee_amount: number; sale_fee_details?: { percentage_fee?: number; fixed_fee?: number } };

/** Regra de tarifa por categoria e tipo de anúncio; uma chamada por combinação. */
export async function fetchFeeRules(items: ItemInfo[], get: Get): Promise<Map<string, FeeRule>> {
  const keys = new Map<string, ItemInfo>();
  for (const it of items) keys.set(feeKey(it), it);
  const out = new Map<string, FeeRule>();
  await Promise.all(
    [...keys].map(async ([key, it]) => {
      const r = await get<ListingPrice>(`/sites/MLB/listing_prices?price=${it.price}&listing_type_id=${it.listingType}&category_id=${it.categoryId}`);
      const pct = r.sale_fee_details?.percentage_fee ?? (it.price ? (r.sale_fee_amount / it.price) * 100 : 0);
      out.set(key, { pct, fixed: r.sale_fee_details?.fixed_fee ?? 0 });
    }),
  );
  return out;
}

export const feeKey = (it: Pick<ItemInfo, 'categoryId' | 'listingType'>) => `${it.categoryId}|${it.listingType}`;

type FreeShipping = { coverage?: { all_country?: { list_cost?: number } } };

/** Frete que a loja paga por envio, num preço. Abaixo de R$ 79 o ML cobra um valor menor no lugar do frete. */
export async function fetchShipping(sellerId: number, itemId: string, price: number, get: Get): Promise<number> {
  const r = await get<FreeShipping>(`/users/${sellerId}/shipping_options/free?item_id=${itemId}&item_price=${price}&verbose=true`);
  return r.coverage?.all_country?.list_cost ?? 0;
}

/** Roda tarefas assíncronas poucas por vez. */
export async function pool<T, R>(list: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

export type SimRow = {
  item: ItemInfo;
  offer: Offer;
  fee: FeeRule;
  /** Frete hoje e no preço sugerido da campanha (null se o ML não respondeu). */
  shippingNow: number | null;
  shippingPromo: number | null;
  /** Unidades pagas nos últimos 30 dias. */
  units30: number;
};

/** Junta anúncio, oferta, tarifa e frete nos dois preços. Anúncios que o ML não devolve ficam de fora. */
export async function buildRows(
  sellerId: number,
  offers: { itemId: string; offer: Offer }[],
  units: Map<string, number>,
  get: Get,
): Promise<SimRow[]> {
  const items = await fetchItems([...new Set(offers.map((o) => o.itemId))], get);
  const rules = await fetchFeeRules([...items.values()], get);
  const ship = (id: string, price: number) => fetchShipping(sellerId, id, price, get).catch(() => null);
  const rows = await pool(offers, 8, async ({ itemId, offer }): Promise<SimRow | null> => {
    const item = items.get(itemId);
    const fee = item && rules.get(feeKey(item));
    if (!item || !fee) return null;
    const [shippingNow, shippingPromo] = await Promise.all([ship(itemId, item.price), ship(itemId, offer.price)]);
    return { item, offer, fee, shippingNow, shippingPromo, units30: units.get(itemId) ?? 0 };
  });
  return rows.filter((r): r is SimRow => r !== null);
}

export type CampaignPage = { offers: { itemId: string; offer: Offer }[]; total: number; next: string | null };

/** Anúncios candidatos de uma campanha, uma página por vez. */
export async function fetchCampaignOffers(
  promo: { id: string; type: string; name: string },
  get: Get,
  after: string | null,
  limit = 40,
): Promise<CampaignPage> {
  const page = await get<{ results: (RawOffer & { id: string })[]; paging?: { total?: number; searchAfter?: string } }>(
    `/seller-promotions/promotions/${promo.id}/items?promotion_type=${promo.type}&app_version=v2&status=candidate&limit=${limit}` +
      (after ? `&searchAfter=${encodeURIComponent(after)}` : ''),
  );
  const offers = (page.results ?? []).flatMap((r) => {
    const offer = normalizeOffer(r, promo);
    return offer ? [{ itemId: r.id, offer }] : [];
  });
  const total = page.paging?.total ?? offers.length;
  const next = page.paging?.searchAfter && (page.results?.length ?? 0) === limit ? page.paging.searchAfter : null;
  return { offers, total, next };
}

/** Campanhas em que um anúncio pode entrar, e em qual ele já está. */
export async function fetchItemOffers(itemId: string, get: Get): Promise<{ offers: Offer[]; activeName: string | null }> {
  const list = await get<RawOffer[]>(`/seller-promotions/items/${itemId}?app_version=v2`);
  let activeName: string | null = null;
  const offers: Offer[] = [];
  for (const raw of list ?? []) {
    const type = raw.type ?? '';
    if (raw.status === 'started' && SIMULABLE(type)) activeName = raw.name || type;
    if (raw.status !== 'candidate' || !SIMULABLE(type)) continue;
    const offer = normalizeOffer(raw, { id: raw.id ?? type, type, name: raw.name || type });
    if (offer) offers.push(offer);
  }
  return { offers, activeName };
}
