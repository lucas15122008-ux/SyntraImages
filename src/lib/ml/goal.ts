/** Meta do mês: progresso e previsão de fechamento a partir do faturamento diário (horário de Brasília). */
import { brtDay, type Range, type Revenue } from './revenue';

const BRT_OFFSET = '-03:00';
const DAY_MS = 86_400_000;

/** Primeiro dia do mês de um instante, em Brasília (AAAA-MM-01). */
export function monthKey(now = new Date()): string {
  return `${brtDay(now).slice(0, 7)}-01`;
}

/** Do primeiro dia do mês, 00:00 em Brasília, até agora. */
export function monthRange(now = new Date()): Range {
  return { from: new Date(`${monthKey(now)}T00:00:00.000${BRT_OFFSET}`), to: now };
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-10-01" → "outubro". */
export function monthName(month: string): string {
  return new Date(`${month}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
}

/** Valor digitado ("50.000", "R$ 48.500,50", "50000") em reais; null se não for um valor válido. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/R\$|\s/gi, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  // Só pontos: "50.000" é milhar; "50.5" (uma ou duas casas) é decimal.
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export type GoalProgress = {
  goal: number;
  /** Vendas brutas do mês até agora. */
  done: number;
  /** done / goal (pode passar de 1). */
  ratio: number;
  /** Quanto já deveria ter vendido até agora, num ritmo linear. */
  expected: number;
  /** Fechamento previsto no ritmo atual; null no comecinho do mês, quando ainda não dá para prever. */
  forecast: number | null;
  /** Ritmo diário usado na previsão. */
  pace: number | null;
  /** Dias que faltam contando hoje. */
  daysLeft: number;
  /** Quanto falta vender por dia (contando hoje) para bater a meta; 0 se já bateu. */
  neededPerDay: number;
  totalDays: number;
};

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Previsão: o que já vendeu mais o ritmo dos dias completos do mês para o tempo que falta (inclusive o resto de hoje).
 * No primeiro dia, sem dia completo, usa o ritmo de hoje até agora, a partir das 6h.
 */
export function goalProgress(goal: number, month: Pick<Revenue, 'gross' | 'daily'>, now = new Date()): GoalProgress {
  const key = monthKey(now);
  const totalDays = daysInMonth(key);
  const today = brtDay(now);
  const todayStart = new Date(`${today}T00:00:00.000${BRT_OFFSET}`).getTime();
  const dayFraction = Math.min(1, Math.max(0, (now.getTime() - todayStart) / DAY_MS));
  const completeDays = Number(today.slice(8, 10)) - 1;
  const elapsed = completeDays + dayFraction;

  const done = month.gross;
  const todayGross = month.daily.find((d) => d.day === today)?.gross ?? 0;
  let pace: number | null = null;
  if (completeDays > 0) pace = (done - todayGross) / completeDays;
  else if (dayFraction >= 0.25) pace = todayGross / dayFraction;

  const daysLeft = totalDays - completeDays;
  const remaining = totalDays - elapsed;
  return {
    goal,
    done,
    ratio: goal ? done / goal : 0,
    expected: cents((goal * elapsed) / totalDays),
    forecast: pace === null ? null : cents(done + pace * remaining),
    pace: pace === null ? null : cents(pace),
    daysLeft,
    neededPerDay: cents(Math.max(0, goal - done) / daysLeft),
    totalDays,
  };
}
