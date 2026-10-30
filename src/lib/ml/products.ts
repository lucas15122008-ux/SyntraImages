/**
 * Produtos: receita, lucro estimado, margem, pedidos e saúde de cada anúncio num período.
 * O lucro é estimado: tarifa vem dos pedidos, frete da cotação do ML no preço médio vendido, custo da tabela de custos.
 */
import type { MlOrder } from './revenue';
import { pool, type Get } from './simulate';

const cents = (n: number) => Math.round(n * 100) / 100;

export type ProductSales = {
  itemId: string;
  title: string;
  /** Receita das vendas não canceladas (preço × unidades). */
  revenue: number;
  units: number;
  /** Pedidos não cancelados com este anúncio. */
  orders: number;
  /** Envios distintos: pedidos do mesmo carrinho pagam um frete só. */
  shipments: number;
  /** Tarifas de venda do ML. */
  fees: number;
  cancelled: number;
};

/** Junta os pedidos do período por anúncio. Os cancelados só contam em `cancelled`. */
export function salesByProduct(orders: MlOrder[]): Map<string, ProductSales> {
  const out = new Map<string, ProductSales>();
  const ships = new Map<string, Set<number | string>>();
  for (const o of orders) {
    if (o.status !== 'paid' && o.status !== 'partially_refunded' && o.status !== 'cancelled') continue;
    const seen = new Set<string>();
    for (const line of o.order_items) {
      const id = line.item.id;
      const cur = out.get(id) ?? { itemId: id, title: line.item.title, revenue: 0, units: 0, orders: 0, shipments: 0, fees: 0, cancelled: 0 };
      out.set(id, cur);
      if (o.status === 'cancelled') {
        if (!seen.has(id)) cur.cancelled++;
        seen.add(id);
        continue;
      }
      cur.revenue += line.unit_price * line.quantity;
      cur.units += line.quantity;
      // sale_fee vem por unidade.
      cur.fees += (line.sale_fee ?? 0) * line.quantity;
      if (!seen.has(id)) {
        cur.orders++;
        const set = ships.get(id) ?? new Set();
        set.add(o.shipping?.id ?? `pedido-${o.id}`);
        ships.set(id, set);
      }
      seen.add(id);
    }
  }
  for (const p of out.values()) {
    p.revenue = cents(p.revenue);
    p.fees = cents(p.fees);
    p.shipments = ships.get(p.itemId)?.size ?? 0;
  }
  return out;
}

export type ProfitInput = {
  revenue: number;
  units: number;
  fees: number;
  shipments: number;
  /** Frete que a loja paga por envio; null quando o ML não respondeu. */
  shippingPerShipment: number | null;
  /** Custo do produto por unidade; null quando não foi informado. */
  cost: number | null;
  /** Imposto em % da receita. */
  taxPct?: number;
};

/** Lucro e margem estimados. null quando falta o custo ou o frete. */
export function estimateProfit(p: ProfitInput): { profit: number; margin: number | null } | null {
  if (p.cost === null || p.shippingPerShipment === null) return null;
  const tax = (p.revenue * (p.taxPct ?? 0)) / 100;
  const profit = cents(p.revenue - p.fees - p.shippingPerShipment * p.shipments - p.cost * p.units - tax);
  return { profit, margin: p.revenue ? profit / p.revenue : null };
}

export type HealthLevel = 'good' | 'medium' | 'bad';

export type ListingHealth = {
  /** Nota de 0 a 100 que o ML dá ao anúncio; null quando o ML não calcula. */
  score: number | null;
  level: HealthLevel | null;
  /** Situação do anúncio em palavras ("Ativo", "Pausado sem estoque"...). */
  status: string;
  active: boolean;
  stock: number;
};

const STATUS: Record<string, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  closed: 'Encerrado',
  under_review: 'Em revisão',
  inactive: 'Inativo',
  payment_required: 'Pagamento pendente',
};

/** Faixas parecidas com as do ML: até 59 ruim, até 79 média, 80+ boa. */
export function healthLevel(score: number | null): HealthLevel | null {
  if (score === null) return null;
  return score >= 80 ? 'good' : score >= 60 ? 'medium' : 'bad';
}

export type RawListing = {
  id: string;
  title?: string;
  thumbnail?: string;
  permalink?: string;
  status?: string;
  sub_status?: string[];
  health?: number | null;
  available_quantity?: number;
};

export function listingHealth(raw: RawListing): ListingHealth {
  const score = typeof raw.health === 'number' ? Math.round(raw.health * 100) : null;
  const base = STATUS[raw.status ?? ''] ?? raw.status ?? 'Desconhecido';
  const outOfStock = raw.sub_status?.includes('out_of_stock') || (raw.status === 'active' && raw.available_quantity === 0);
  return {
    score,
    level: healthLevel(score),
    status: outOfStock ? `${base} sem estoque` : base,
    active: raw.status === 'active',
    stock: raw.available_quantity ?? 0,
  };
}

export type Listing = { id: string; title: string | null; thumbnail: string | null; permalink: string | null; health: ListingHealth };

/** Situação e saúde dos anúncios, de 20 em 20 (limite do ML). */
export async function fetchListings(ids: string[], get: Get): Promise<Map<string, Listing>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
  const pages = await pool(chunks, 6, (c) =>
    get<{ code: number; body: RawListing }[]>(
      `/items?ids=${c.join(',')}&attributes=id,title,thumbnail,permalink,status,sub_status,health,available_quantity`,
    ),
  );
  const out = new Map<string, Listing>();
  for (const r of pages.flat()) {
    if (r.code !== 200) continue;
    const b = r.body;
    out.set(b.id, {
      id: b.id,
      title: b.title ?? null,
      thumbnail: b.thumbnail?.replace(/^http:/, 'https:') ?? null,
      permalink: b.permalink ?? null,
      health: listingHealth(b),
    });
  }
  return out;
}
