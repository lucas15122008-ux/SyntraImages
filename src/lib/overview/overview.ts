/** Resumo: junta numa tela só os números essenciais das outras páginas. Funções puras, sem rede. */
import type { KitSummary } from '@/lib/kit/summary';
import { monthRange } from '@/lib/ml/goal';
import { periodRanges, summarizeRevenue, type MlOrder, type Range, type Revenue } from '@/lib/ml/revenue';

export type OverviewRanges = {
  /** Um intervalo só que cobre todos os outros: os pedidos são buscados uma vez e separados depois. */
  fetch: Range;
  today: Range;
  /** Ontem até a mesma hora de agora, para comparar com hoje de forma justa. */
  yesterday: Range;
  week: Range;
  prevWeek: Range;
  month: Range;
};

export function overviewRanges(now = new Date()): OverviewRanges {
  const day = periodRanges(1, now);
  const week = periodRanges(7, now);
  const month = monthRange(now);
  const from = new Date(Math.min(week.previous.from.getTime(), month.from.getTime()));
  return { fetch: { from, to: now }, today: day.current, yesterday: day.previous, week: week.current, prevWeek: week.previous, month };
}

/** Pedidos criados dentro do intervalo (início e fim inclusos). */
export function ordersIn(orders: MlOrder[], range: Range): MlOrder[] {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return orders.filter((o) => {
    const t = new Date(o.date_created).getTime();
    return t >= from && t <= to;
  });
}

export type SalesOverview = { today: Revenue; yesterday: Revenue; week: Revenue; prevWeek: Revenue; month: Revenue };

export function summarizeSales(orders: MlOrder[], r: OverviewRanges): SalesOverview {
  const sum = (range: Range, topN = 0) => summarizeRevenue(ordersIn(orders, range), range, topN);
  return { today: sum(r.today), yesterday: sum(r.yesterday), week: sum(r.week, 3), prevWeek: sum(r.prevWeek), month: sum(r.month) };
}

export type KitAttention<T> = { kit: T; reason: string };

/** Kits que pedem ação: fotos que falharam ou ângulos que talvez não existam na foto original. */
export function kitsNeedingAttention<T extends { summary: KitSummary }>(kits: T[]): KitAttention<T>[] {
  const out: KitAttention<T>[] = [];
  for (const kit of kits) {
    const { failed, warnings } = kit.summary;
    const parts: string[] = [];
    if (failed) parts.push(failed === 1 ? '1 foto falhou' : `${failed} fotos falharam`);
    if (warnings) parts.push(warnings === 1 ? '1 aviso de ângulo' : `${warnings} avisos de ângulo`);
    if (parts.length) out.push({ kit, reason: parts.join(' · ') });
  }
  return out;
}
