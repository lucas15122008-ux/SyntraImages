/**
 * Foto x venda: compara um anúncio antes e depois de receber as fotos do Syntra.
 * As janelas têm o mesmo número de dias dos dois lados da troca; o dia da troca fica de fora
 * (metade dele ainda era a foto antiga) e o dia de hoje também (ainda não terminou).
 */
import { brtDay, type MlOrder } from './revenue';

export const IMPACT_PATH = '/foto-x-venda';

const DAY_MS = 86_400_000;
/** Até quantos dias de cada lado comparar. */
export const MAX_WINDOW_DAYS = 30;
/** Abaixo disso a comparação ainda não diz nada. */
export const MIN_WINDOW_DAYS = 3;
/** Visitas mínimas em cada janela para dar um veredito. */
export const MIN_VISITS = 30;

/** Intervalo de dias de Brasília; `to` não entra. */
export type DayRange = { from: string; to: string };

export function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS);
}

export function impactWindows(
  switchedOn: string,
  today: string,
  maxDays = MAX_WINDOW_DAYS,
): { days: number; before: DayRange; after: DayRange } {
  const afterStart = addDays(switchedOn, 1);
  const days = Math.max(0, Math.min(maxDays, daysBetween(afterStart, today)));
  return {
    days,
    before: { from: addDays(switchedOn, -days), to: switchedOn },
    after: { from: afterStart, to: addDays(afterStart, days) },
  };
}

export type ParsedItem = { ok: true; itemId: string } | { ok: false; error: string };

/** Aceita "MLB123", "MLB-123" ou o link do anúncio. Link de catálogo (/p/MLB…) só serve se tiver o wid. */
export function parseItemId(input: string): ParsedItem {
  const text = input.trim();
  const wid = /[?&#]wid=(MLB)-?(\d+)/i.exec(text);
  if (wid) return { ok: true, itemId: `MLB${wid[2]}` };
  if (/\/p\/MLB/i.test(text)) {
    return { ok: false, error: 'Esse é o link da página de catálogo, não do seu anúncio. Cole o código MLB do anúncio (está no painel de anúncios do ML).' };
  }
  const m = /MLB-?(\d{6,})/i.exec(text);
  if (!m) return { ok: false, error: 'Não encontrei um código de anúncio (MLB…) no que você colou.' };
  return { ok: true, itemId: `MLB${m[1]}` };
}

export type WindowSales = { sales: number; units: number; gross: number };

/** Pedidos pagos do anúncio dentro da janela. Cancelado não conta: a venda não aconteceu. */
export function salesInWindow(orders: MlOrder[], itemId: string, range: DayRange): WindowSales {
  let sales = 0;
  let units = 0;
  let gross = 0;
  for (const o of orders) {
    if (o.status !== 'paid' && o.status !== 'partially_refunded') continue;
    const day = brtDay(o.date_created);
    if (day < range.from || day >= range.to) continue;
    const lines = o.order_items.filter((l) => l.item.id === itemId);
    if (!lines.length) continue;
    sales++;
    for (const l of lines) {
      units += l.quantity;
      gross += l.unit_price * l.quantity;
    }
  }
  return { sales, units, gross: Math.round(gross * 100) / 100 };
}

export type Side = WindowSales & { visits: number; conversion: number | null };

export function side(sales: WindowSales, visits: number): Side {
  return { ...sales, visits, conversion: visits ? sales.sales / visits : null };
}

export type Verdict = 'up' | 'down' | 'same' | 'little_data' | 'waiting';

/**
 * Melhorou, piorou ou não dá para dizer. Usa um teste de duas proporções (90% de confiança),
 * porque com poucas visitas uma venda a mais já parece um salto enorme.
 */
export function verdict(before: Side, after: Side, days: number): Verdict {
  if (days < MIN_WINDOW_DAYS) return 'waiting';
  if (before.visits < MIN_VISITS || after.visits < MIN_VISITS) return 'little_data';
  const p1 = before.sales / before.visits;
  const p2 = after.sales / after.visits;
  const pooled = (before.sales + after.sales) / (before.visits + after.visits);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / before.visits + 1 / after.visits));
  if (!se) return 'same';
  const z = (p2 - p1) / se;
  if (z >= 1.645) return 'up';
  if (z <= -1.645) return 'down';
  return 'same';
}

export type Impact = { days: number; before: Side; after: Side; verdict: Verdict };

export type ImpactTotals = { listings: number; before: Side; after: Side; improved: number; worsened: number };

/** Soma só os anúncios que já têm dias para comparar. */
export function totalImpact(impacts: Impact[]): ImpactTotals {
  const ready = impacts.filter((i) => i.days >= MIN_WINDOW_DAYS);
  const sum = (pick: (i: Impact) => Side) =>
    side(
      {
        sales: ready.reduce((s, i) => s + pick(i).sales, 0),
        units: ready.reduce((s, i) => s + pick(i).units, 0),
        gross: Math.round(ready.reduce((s, i) => s + pick(i).gross, 0) * 100) / 100,
      },
      ready.reduce((s, i) => s + pick(i).visits, 0),
    );
  return {
    listings: ready.length,
    before: sum((i) => i.before),
    after: sum((i) => i.after),
    improved: ready.filter((i) => i.verdict === 'up').length,
    worsened: ready.filter((i) => i.verdict === 'down').length,
  };
}
