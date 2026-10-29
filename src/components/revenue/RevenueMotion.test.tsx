// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DailyChart } from './DailyChart';
import { CountUp } from './RevenueMotion';

vi.mock('next/link', () => ({ default: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a> }));

afterEach(() => vi.unstubAllGlobals());

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\u00a0/g, ' ');

const stubMatchMedia = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe('animações do faturamento', () => {
  test('o número conta até o valor final; leitor de tela recebe o final desde o início', async () => {
    stubMatchMedia(false);
    const { container } = render(<CountUp value={1234.5} format="money" />);
    expect(text(container.querySelector('.sr-only'))).toBe('R$ 1.234,50');
    await waitFor(() => expect(text(container.querySelector('[aria-hidden]'))).toBe('R$ 1.234,50'), { timeout: 3000 });
  });

  test('com menos movimento, mostra o valor final na hora', () => {
    stubMatchMedia(true);
    const { container } = render(<CountUp value={742} format="count" />);
    expect(text(container.querySelector('[aria-hidden]'))).toBe('742');
  });

  test('gráfico desenha uma linha e mostra o dia ao passar o mouse', () => {
    stubMatchMedia(true);
    render(
      <DailyChart
        data={[
          { day: '2026-10-22', gross: 0, sales: 0 },
          { day: '2026-10-23', gross: 150, sales: 3 },
        ]}
      />,
    );
    const svg = screen.getByRole('img', { name: 'Faturamento por dia' });
    expect(svg.querySelectorAll('path.series')).toHaveLength(1);
    fireEvent.pointerEnter(svg.querySelectorAll('rect.hit')[1]);
    expect(text(screen.getByRole('status'))).toBe('23/10R$ 150,00 em 3 vendas');
  });
});
