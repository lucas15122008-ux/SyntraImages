// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { listItem, photoArrive, reduceVariants, screenTransition, useMotionPresets } from './presets';

afterEach(() => vi.unstubAllGlobals());

const stubMatchMedia = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));

describe('presets', () => {
  test('cada preset tem estado inicial e final com opacidade e duração curta', () => {
    for (const v of [screenTransition, photoArrive, listItem]) {
      expect(v.hidden).toMatchObject({ opacity: 0 });
      const visible = v.visible as { opacity: number; transition: { duration: number } };
      expect(visible.opacity).toBe(1);
      expect(visible.transition.duration).toBeLessThanOrEqual(0.6);
    }
  });

  test('reduceVariants tira deslocamento, escala e desfoque e mantém só um fade rápido', () => {
    const reduced = reduceVariants(photoArrive);
    expect(reduced.hidden).toEqual({ opacity: 0 });
    expect(reduced.visible).toMatchObject({ opacity: 1 });
    expect(JSON.stringify(reduced)).not.toMatch(/scale|blur|"y"/);
    const t = (reduced.visible as { transition: { duration: number } }).transition;
    expect(t.duration).toBeLessThanOrEqual(0.15);
  });
});

describe('useMotionPresets', () => {
  test('sem preferência por movimento reduzido devolve as variantes completas', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMotionPresets());
    expect(result.current.reduced).toBe(false);
    expect(result.current.photoArrive).toBe(photoArrive);
  });

  test('com movimento reduzido todas as variantes viram só fade', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMotionPresets());
    expect(result.current.reduced).toBe(true);
    for (const key of ['screenTransition', 'photoArrive', 'listItem'] as const) {
      expect(result.current[key].hidden).toEqual({ opacity: 0 });
    }
  });
});
