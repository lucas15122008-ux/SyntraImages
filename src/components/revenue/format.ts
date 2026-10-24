const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('pt-BR');
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });

export const money = (n: number) => brl.format(n);
export const moneyShort = (n: number) => brlShort.format(n);
export const count = (n: number) => int.format(n);
export const percent = (n: number) => pct.format(n);
const pctPlain = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
/** Parte de um todo, sem sinal: 0,42 → "42%". */
export const share = (n: number) => pctPlain.format(n);

/** "2026-10-23" → "23/10". */
export const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
