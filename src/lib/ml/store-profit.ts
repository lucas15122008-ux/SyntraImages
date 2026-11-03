/**
 * Lucro da Loja: do lucro estimado dos produtos ao lucro da loja, descontando os custos fixos do período.
 * Funções puras; a tela junta os pedidos, custos e fretes e chama estas contas.
 */
import { estimateProfit, type ProductSales } from './products';

const cents = (n: number) => Math.round(n * 100) / 100;

export type FixedCost = {
  id: string;
  description: string;
  monthly: number;
  /** Primeiro dia em que o custo vale (AAAA-MM-DD). */
  since: string;
  /** Último dia em que o custo vale; null enquanto continua. */
  until: string | null;
};

/** Quantos dias tem o mês de um dia AAAA-MM-DD. */
export function daysInMonth(day: string): number {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Parte do custo mensal que cai nos dias do período: cada dia vale valor ÷ dias daquele mês. */
export function fixedCostForDays(cost: Pick<FixedCost, 'monthly' | 'since' | 'until'>, days: string[]): number {
  let total = 0;
  for (const d of days) {
    if (d < cost.since || (cost.until !== null && d > cost.until)) continue;
    total += cost.monthly / daysInMonth(d);
  }
  return cents(total);
}

export type ProductPeriod = {
  sales: Pick<ProductSales, 'revenue' | 'units' | 'fees' | 'shipments'>;
  /** Frete que a loja paga por envio; null quando o ML não respondeu. */
  shippingPerShipment: number | null;
  /** Custo por unidade; null quando não foi cadastrado. */
  cost: number | null;
};

export type StoreProfit = {
  revenue: number;
  /** Lucro estimado só dos produtos com custo (e frete) conhecidos. */
  productProfit: number;
  withProfit: number;
  products: number;
  fixed: number;
  store: number;
  /** Lucro da loja sobre a receita toda; null sem receita. */
  margin: number | null;
};

export function storeProfit(products: ProductPeriod[], fixed: number, taxPct = 0): StoreProfit {
  let revenue = 0;
  let productProfit = 0;
  let withProfit = 0;
  for (const p of products) {
    revenue += p.sales.revenue;
    const c = estimateProfit({ ...p.sales, shippingPerShipment: p.shippingPerShipment, cost: p.cost, taxPct });
    if (c) {
      productProfit += c.profit;
      withProfit++;
    }
  }
  revenue = cents(revenue);
  productProfit = cents(productProfit);
  const store = cents(productProfit - fixed);
  return { revenue, productProfit, withProfit, products: products.length, fixed: cents(fixed), store, margin: revenue ? store / revenue : null };
}
