import { describe, expect, test } from 'vitest';
import { STALE_GENERATION_MS, isStaleGeneration } from './limits';

const now = new Date('2026-10-16T15:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('isStaleGeneration', () => {
  test('generating há mais de 5 minutos está travada', () => {
    expect(isStaleGeneration('generating', ago(STALE_GENERATION_MS + 1000), now)).toBe(true);
  });
  test('generating recente não está travada', () => {
    expect(isStaleGeneration('generating', ago(60_000), now)).toBe(false);
  });
  test('outros status e carimbo ausente nunca são travados', () => {
    expect(isStaleGeneration('done', ago(STALE_GENERATION_MS * 5), now)).toBe(false);
    expect(isStaleGeneration('generating', null, now)).toBe(false);
  });
});
