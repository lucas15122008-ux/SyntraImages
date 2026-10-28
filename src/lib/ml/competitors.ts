/**
 * Radar de concorrentes: para cada anúncio que mais vende, quem vende o mesmo produto (catálogo) ou peça
 * parecida entre os mais vendidos da categoria, por quanto, e em que posição o nosso está.
 *
 * O ML bloqueia título, fotos e estoque de anúncios de terceiros. O que ele libera: o ranking de mais vendidos
 * (/highlights), as ofertas de cada produto (/products/{id}/items, com preço, frete e vendedor), a descrição e
 * o perfil público do vendedor. O "título" do concorrente sai da primeira linha da descrição.
 */
import type { MlOrder } from './revenue';

type Get = <T>(path: string) => Promise<T>;

export type MyItem = {
  id: string;
  title: string;
  price: number;
  original_price?: number | null;
  category_id: string;
  catalog_product_id?: string | null;
  catalog_listing?: boolean;
  user_product_id?: string | null;
  permalink: string;
  status: string;
  shipping?: { free_shipping?: boolean; logistic_type?: string };
};

/** Preço que o comprador paga agora (/items/{id}/sale_price): já com promoção, que o /items não mostra. */
type SalePrice = { amount?: number | null; regular_amount?: number | null };

type Highlight = { id: string; position: number; type: 'USER_PRODUCT' | 'PRODUCT' | 'ITEM' | string };

export type Offer = {
  item_id: string;
  seller_id: number;
  price: number;
  original_price?: number | null;
  listing_type_id?: string;
  official_store_id?: number | null;
  shipping?: { free_shipping?: boolean; logistic_type?: string };
};

type Seller = { nickname?: string; seller_reputation?: { level_id?: string | null; power_seller_status?: string | null } };

export type Rival = {
  itemId: string;
  link: string;
  /** Primeira linha da descrição: o ML não libera o título de anúncio de terceiros. */
  title: string | null;
  price: number;
  originalPrice: number | null;
  freeShipping: boolean;
  full: boolean;
  seller: { id: number; nickname: string | null; medal: string | null };
  /** Posição entre os 20 mais vendidos da categoria; null quando veio só do catálogo. */
  position: number | null;
  /** Quanto a descrição bate com o nosso título (0 a 1); 1 quando é o mesmo produto do catálogo. */
  similarity: number;
  source: 'catalog' | 'category';
};

export type RadarRow = {
  itemId: string;
  title: string;
  link: string;
  /** Preço de venda agora, com promoção. */
  price: number;
  /** Preço cheio quando há promoção ativa; null sem promoção. */
  originalPrice: number | null;
  units: number;
  gross: number;
  active: boolean;
  categoryName: string | null;
  /** Nossa posição entre os 20 mais vendidos da categoria; null quando estamos fora. */
  position: number | null;
  /** Concorrentes de peça parecida (ou do mesmo produto), do mais barato ao mais caro. */
  rivals: Rival[];
  /** Mais vendidos da categoria quando nenhum é parecido: referência de preço, não concorrente direto. */
  others: Rival[];
  cheapest: Rival | null;
  /** Nosso preço contra o mais barato parecido: 0,1 = estamos 10% mais caros. */
  gap: number | null;
};

// ───────────── Anúncios principais ─────────────

export type TopItem = { itemId: string; title: string; units: number; gross: number };

/** Os anúncios que mais faturaram nos pedidos pagos do período. */
export function topItems(orders: MlOrder[], n: number): TopItem[] {
  const acc = new Map<string, TopItem>();
  for (const o of orders) {
    if (o.status !== 'paid' && o.status !== 'partially_refunded') continue;
    for (const l of o.order_items) {
      const cur = acc.get(l.item.id) ?? { itemId: l.item.id, title: l.item.title, units: 0, gross: 0 };
      cur.units += l.quantity;
      cur.gross += l.unit_price * l.quantity;
      acc.set(l.item.id, cur);
    }
  }
  return [...acc.values()]
    .sort((a, b) => b.gross - a.gross)
    .slice(0, n)
    .map((i) => ({ ...i, gross: Math.round(i.gross * 100) / 100 }));
}

// ───────────── Parecido ─────────────

const STOP = new Set(
  'a o as os de da do das dos e em no na nos nas com sem para p pra por ate até kit jogo par peca peça novo nova original compativel compatível marca modelo ano'.split(
    ' ',
  ),
);

/** Palavras que identificam a peça: sem acento, minúsculas, sem palavras vazias. */
export function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    // "1.0" fica junto; ponto solto no fim da palavra sai.
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => (t.length > 1 || /\d/.test(t)) && !STOP.has(t));
}

const singular = (t: string) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);

/**
 * Quanto do nosso título aparece no texto do concorrente. As palavras do nome da categoria ("radiador",
 * "água") não contam: todo mundo na categoria tem. Sobra o que diferencia: carro, motor, anos, código.
 */
export function similarity(myTitle: string, theirText: string, categoryName = ''): number {
  const generic = new Set(tokens(categoryName).map(singular));
  const mine = [...new Set(tokens(myTitle))].filter((t) => !generic.has(singular(t)));
  if (!mine.length) return 0;
  const theirs = new Set(tokens(theirText).map(singular));
  return mine.filter((t) => theirs.has(singular(t))).length / mine.length;
}

/** A partir de quanto o concorrente conta como peça parecida. */
export const SIMILAR = 0.4;

/** Primeira linha útil da descrição, curta, para servir de título. */
export function titleFromDescription(text: string | undefined): string | null {
  const line = (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 8);
  if (!line) return null;
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}

// ───────────── Busca ─────────────

/** Executa com no máximo `limit` chamadas ao mesmo tempo, mantendo a ordem. */
export async function mapLimit<T, R>(list: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

const link = (itemId: string) => `https://produto.mercadolivre.com.br/${itemId.replace(/^MLB/, 'MLB-')}`;

function rival(o: Offer, extra: Pick<Rival, 'title' | 'position' | 'similarity' | 'source'>, seller?: Seller | null): Rival {
  return {
    itemId: o.item_id,
    link: link(o.item_id),
    price: o.price,
    originalPrice: o.original_price && o.original_price > o.price ? o.original_price : null,
    freeShipping: Boolean(o.shipping?.free_shipping),
    full: o.shipping?.logistic_type === 'fulfillment',
    seller: { id: o.seller_id, nickname: seller?.nickname ?? null, medal: seller?.seller_reputation?.power_seller_status ?? null },
    ...extra,
  };
}

/** Oferta mais barata de um produto ou anúncio de usuário (/products/{id}/items aceita os dois). */
async function cheapestOffer(get: Get, productId: string): Promise<Offer[]> {
  const r = await get<{ results?: Offer[] }>(`/products/${productId}/items`).catch(() => null);
  return (r?.results ?? []).sort((a, b) => a.price - b.price);
}

/**
 * Monta a linha do radar de um anúncio nosso. Cada chamada ao ML que falhar só tira aquele pedaço;
 * se o nosso anúncio não puder ser lido, a linha inteira falha.
 */
export async function radarFor(
  top: TopItem,
  sellerId: number,
  get: Get,
  opts: { concurrency?: number; maxRivals?: number } = {},
): Promise<RadarRow> {
  const concurrency = opts.concurrency ?? 6;
  const maxRivals = opts.maxRivals ?? 5;
  const me = await get<MyItem>(
    `/items/${top.itemId}?attributes=id,title,price,original_price,category_id,catalog_product_id,catalog_listing,user_product_id,permalink,status,shipping`,
  );

  const [salePrice, category, highlights, catalogOffers] = await Promise.all([
    // O /items devolve o preço cheio mesmo com o anúncio em promoção (campanha do vendedor, oferta do dia).
    get<SalePrice>(`/items/${me.id}/sale_price?context=channel_marketplace`).catch(() => null),
    get<{ name?: string }>(`/categories/${me.category_id}`).catch(() => null),
    get<{ content?: Highlight[] }>(`/highlights/MLB/category/${me.category_id}`).catch(() => null),
    me.catalog_product_id ? cheapestOffer(get, me.catalog_product_id) : Promise.resolve([]),
  ]);
  const categoryName = category?.name ?? null;
  const price = salePrice?.amount || me.price;
  const regular = salePrice?.regular_amount || me.original_price || null;
  const originalPrice = regular && regular > price ? regular : null;
  const ranking = highlights?.content ?? [];

  const mine = new Set([me.id, me.user_product_id, me.catalog_listing ? me.catalog_product_id : null].filter(Boolean));
  const position = ranking.find((h) => mine.has(h.id))?.position ?? null;

  // Mesmo produto do catálogo: concorrente direto, sem precisar adivinhar pela descrição.
  const fromCatalog = catalogOffers.filter((o) => o.seller_id !== sellerId);

  // Mais vendidos da categoria: a oferta mais barata de cada um, e o quanto a descrição bate com o nosso título.
  const candidates = ranking.filter((h) => !mine.has(h.id) && h.type !== 'ITEM' && h.id !== me.catalog_product_id);
  const fromRanking = (
    await mapLimit(candidates, concurrency, async (h) => {
      const offer = (await cheapestOffer(get, h.id)).find((o) => o.seller_id !== sellerId);
      if (!offer) return null;
      const desc = await get<{ plain_text?: string }>(`/items/${offer.item_id}/description`).catch(() => null);
      return {
        offer,
        position: h.position,
        title: titleFromDescription(desc?.plain_text),
        similarity: similarity(me.title, desc?.plain_text ?? '', categoryName ?? ''),
      };
    })
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  const seen = new Set(fromCatalog.map((o) => o.item_id));
  const similar = fromRanking.filter((r) => r.similarity >= SIMILAR && !seen.has(r.offer.item_id));
  const picked = [
    ...fromCatalog.slice(0, maxRivals).map((o) => ({ offer: o, title: null, position: null, similarity: 1, source: 'catalog' as const })),
    ...similar.map((r) => ({ ...r, source: 'category' as const })),
  ]
    .sort((a, b) => a.offer.price - b.offer.price)
    .slice(0, maxRivals);
  const others = picked.length ? [] : fromRanking.slice(0, 3).map((r) => ({ ...r, source: 'category' as const }));

  // Perfil público só de quem vai aparecer na tela.
  const shown = [...picked, ...others];
  const sellers = new Map<number, Seller | null>();
  await mapLimit([...new Set(shown.map((s) => s.offer.seller_id))], concurrency, async (id) => {
    sellers.set(id, await get<Seller>(`/users/${id}`).catch(() => null));
  });
  const toRival = (s: (typeof shown)[number]) =>
    rival(s.offer, { title: s.title, position: s.position, similarity: s.similarity, source: s.source }, sellers.get(s.offer.seller_id));

  const rivals = picked.map(toRival);
  const cheapest = rivals[0] ?? null;
  return {
    itemId: me.id,
    title: me.title,
    link: me.permalink,
    price,
    originalPrice,
    units: top.units,
    gross: top.gross,
    active: me.status === 'active',
    categoryName,
    position,
    rivals,
    others: others.map(toRival),
    cheapest,
    gap: cheapest ? (price - cheapest.price) / cheapest.price : null,
  };
}
