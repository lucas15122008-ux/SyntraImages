// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { PeriodPicker } from './PeriodPicker';

vi.mock('next/link', () => ({ default: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a> }));

const presets = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
];

describe('seletor de período', () => {
  test('atalho ativo marcado; "Personalizado" abre o formulário de datas', () => {
    render(<PeriodPicker basePath="/faturamento" presets={presets} selection={{ kind: 'preset', days: 7 }} today="2026-10-23" maxDays={180} />);
    expect(screen.getByRole('link', { name: '7 dias' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByLabelText('De')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Personalizado/ }));
    const de = screen.getByLabelText('De');
    expect(de).toHaveAttribute('max', '2026-10-23');
    expect(de.closest('form')).toHaveAttribute('action', '/faturamento');
  });

  test('período personalizado aparece no botão e já abre com as datas', () => {
    render(
      <PeriodPicker basePath="/promocoes" presets={presets} selection={{ kind: 'custom', from: '2026-10-01', to: '2026-10-10' }} today="2026-10-23" maxDays={180} />,
    );
    expect(screen.getByRole('button', { name: /01\/10 a 10\/10/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('De')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('Até')).toHaveAttribute('min', '2026-10-01');
  });
});
