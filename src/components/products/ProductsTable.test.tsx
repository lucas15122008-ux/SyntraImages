// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ProductsTable, type ProductRow } from './ProductsTable';

vi.mock('@/lib/ml/costs', () => ({ saveItemCost: vi.fn(async () => null) }));

beforeEach(() =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('prefers-reduced-motion'),
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);

const text = () => (document.body.textContent ?? '').replace(/\u00a0/g, ' ');

const row = (o: Partial<ProductRow> & { itemId: string }): ProductRow => ({
  title: 'Retentor',
  revenue: 300,
  units: 3,
  orders: 3,
  shipments: 3,
  fees: 36,
  cancelled: 0,
  prevRevenue: 200,
  thumbnail: null,
  permalink: null,
  health: { score: 77, level: 'medium', status: 'Ativo', active: true, stock: 4 },
  shippingPerShipment: 10,
  cost: 40,
  ...o,
});

describe('tabela de produtos', () => {
  test('mostra lucro e margem de quem tem custo e pede o custo de quem não tem', () => {
    render(
      <ProductsTable
        costsEnabled
        rows={[row({ itemId: 'MLB1', title: 'Sensor ABS' }), row({ itemId: 'MLB2', title: 'Bomba d’água', cost: null, health: null })]}
      />,
    );
    // 300 − 36 − 30 − 120 = 114
    expect(text()).toContain('R$ 114,00');
    expect(text()).toContain('38%');
    expect(text()).toContain('informe o custo');
    expect(text()).toContain('77 · média');
    expect(text()).toContain('não encontrado');
  });

  test('busca filtra por título e o custo digitado recalcula o lucro', () => {
    render(<ProductsTable costsEnabled rows={[row({ itemId: 'MLB1', title: 'Sensor ABS', cost: null }), row({ itemId: 'MLB2', title: 'Bomba' })]} />);
    fireEvent.change(screen.getByPlaceholderText('Título ou MLB'), { target: { value: 'sensor' } });
    expect(screen.queryByText('Bomba')).toBeNull();
    fireEvent.change(screen.getByLabelText('Custo por unidade de Sensor ABS'), { target: { value: '50' } });
    // 300 − 36 − 30 − 150 = 84
    expect(text()).toContain('R$ 84,00');
  });
});
