import { describe, expect, test } from 'vitest';
import { SUBMIT_BUDGET_BYTES, submitBudget } from './client-image';

describe('submitBudget', () => {
  test('o total das imagens fica abaixo do limite de 4,5 MB da Vercel, com folga para o resto do formulário', () => {
    expect(SUBMIT_BUDGET_BYTES).toBeLessThanOrEqual(3_500_000);
    for (const n of [1, 2]) expect(submitBudget(n) * n).toBeLessThanOrEqual(SUBMIT_BUDGET_BYTES);
  });
  test('divide o orçamento entre as imagens enviadas', () => {
    expect(submitBudget(1)).toBe(3_200_000);
    expect(submitBudget(2)).toBe(1_600_000);
  });
});
