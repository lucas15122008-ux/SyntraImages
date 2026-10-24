import { describe, expect, test } from 'vitest';
import { daysInMonth, goalProgress, monthKey, monthName, monthRange, parseMoney } from './goal';

const at = (iso: string) => new Date(iso);
const daily = (entries: [string, number][]) => entries.map(([day, gross]) => ({ day, gross, sales: 1 }));

describe('mês em Brasília', () => {
  test('a virada do mês segue o horário de Brasília', () => {
    expect(monthKey(at('2026-11-01T02:00:00Z'))).toBe('2026-10-01');
    expect(monthKey(at('2026-11-01T03:00:00Z'))).toBe('2026-11-01');
  });

  test('o intervalo começa à meia-noite do dia 1 em Brasília', () => {
    const now = at('2026-10-24T15:00:00Z');
    expect(monthRange(now)).toEqual({ from: at('2026-10-01T03:00:00Z'), to: now });
  });

  test('dias e nome do mês', () => {
    expect(daysInMonth('2026-10-01')).toBe(31);
    expect(daysInMonth('2028-02-01')).toBe(29);
    expect(monthName('2026-10-01')).toBe('outubro');
  });
});

describe('valor digitado', () => {
  test.each([
    ['50000', 50000],
    ['50.000', 50000],
    ['1.250.000', 1250000],
    ['R$ 48.500,50', 48500.5],
    ['48500,5', 48500.5],
    ['48500.50', 48500.5],
  ])('%s → %s', (input, expected) => expect(parseMoney(input)).toBe(expected));

  test.each(['', '0', 'abc', '-100', '10,00,00'])('%s é inválido', (input) => expect(parseMoney(input)).toBeNull());
});

describe('progresso da meta', () => {
  test('previsão pelo ritmo dos dias completos, mais o resto de hoje', () => {
    // 24/10 às 12h em Brasília: 23 dias completos de R$ 1.000 e R$ 400 hoje.
    const days = Array.from({ length: 23 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, 1000] as [string, number]);
    const p = goalProgress(40000, { gross: 23400, daily: daily([...days, ['2026-10-24', 400]]) }, at('2026-10-24T15:00:00Z'));
    expect(p.pace).toBe(1000);
    // 31 - 23,5 = 7,5 dias pela frente.
    expect(p.forecast).toBe(30900);
    expect(p.expected).toBe(30322.58);
    expect(p.daysLeft).toBe(8);
    expect(p.neededPerDay).toBe(2075);
    expect(p.ratio).toBeCloseTo(0.585);
  });

  test('no dia 1 de madrugada ainda não prevê; depois das 6h usa o ritmo de hoje', () => {
    const early = goalProgress(31000, { gross: 100, daily: daily([['2026-10-01', 100]]) }, at('2026-10-01T06:00:00Z'));
    expect(early.forecast).toBeNull();
    const noon = goalProgress(31000, { gross: 600, daily: daily([['2026-10-01', 600]]) }, at('2026-10-01T15:00:00Z'));
    expect(noon.pace).toBe(1200);
    expect(noon.forecast).toBe(37200);
  });

  test('meta batida não pede mais nada por dia', () => {
    const p = goalProgress(10000, { gross: 12000, daily: daily([['2026-10-24', 0]]) }, at('2026-10-24T15:00:00Z'));
    expect(p.neededPerDay).toBe(0);
    expect(p.ratio).toBe(1.2);
  });
});
