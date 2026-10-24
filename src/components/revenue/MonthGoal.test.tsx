// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { GoalProgress } from '@/lib/ml/goal';
import { MonthGoal } from './MonthGoal';

vi.mock('@/lib/ml/goal-actions', () => ({ saveRevenueGoalForm: vi.fn() }));

beforeEach(() =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('prefers-reduced-motion'),
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);

const text = () => (document.body.textContent ?? '').replace(/ /g, ' ');

const progress = (over: Partial<GoalProgress> = {}): GoalProgress => ({
  goal: 40000,
  done: 23400,
  ratio: 0.585,
  expected: 30322.58,
  forecast: 30900,
  pace: 1000,
  daysLeft: 8,
  neededPerDay: 2075,
  totalDays: 31,
  ...over,
});

describe('meta do mês', () => {
  test('sem meta, pede o valor', () => {
    render(<MonthGoal month="outubro" progress={null} />);
    expect(screen.getByRole('heading', { name: 'Meta de outubro' })).toBeTruthy();
    expect(screen.getByLabelText('Meta do mês em reais')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  test('com meta, mostra progresso, previsão e quanto falta por dia', () => {
    render(<MonthGoal month="outubro" progress={progress()} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuetext')?.replace(/ /g, ' ')).toBe('R$ 23.400,00 de R$ 40.000,00');
    expect(text()).toContain('R$ 30.900,00');
    expect(text()).toContain('R$ 9.100,00 abaixo da meta');
    expect(text()).toContain('R$ 6.922,58 atrás');
    expect(text()).toContain('R$ 2.075,00 por dia');
    expect(text()).toContain('nos 8 dias que faltam');
  });

  test('no ritmo e meta batida', () => {
    render(<MonthGoal month="outubro" progress={progress({ done: 42000, ratio: 1.05, forecast: 50000, neededPerDay: 0 })} />);
    expect(text()).toContain('no ritmo para bater a meta');
    expect(text()).toContain('Meta batida');
    expect(text()).toContain('R$ 2.000,00 acima');
  });

  test('cedo demais para prever', () => {
    render(<MonthGoal month="outubro" progress={progress({ forecast: null, pace: null })} />);
    expect(text()).toContain('cedo demais para prever');
  });

  test('"Mudar meta" abre o formulário com o valor atual e dá para cancelar', () => {
    render(<MonthGoal month="outubro" progress={progress()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mudar meta' }));
    expect((screen.getByLabelText('Meta do mês em reais') as HTMLInputElement).value).toBe('40.000');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});
