import { describe, expect, test } from 'vitest';
import { ANGLE_WARNING_TYPES, MAX_TOTAL, MIN_TOTAL, defaultMiddleTypes, minTotal, planKit, validateConfig } from './plan';
import type { KitConfig, PhotoType } from './types';

const ALL_TYPES: PhotoType[] = ['white_front', 'white_side', 'white_detail', 'white_back', 'white_on_box', 'use_hand', 'use_installed'];

const base = (over: Partial<KitConfig> = {}): KitConfig => ({
  total: 10,
  coverWithCar: false,
  useExtraReference: false,
  includeStore: true,
  types: [],
  ...over,
});

describe('planKit', () => {
  test('com loja: capa na 1, 7 geradas nas posições 2 a 8, fixas na 9 e 10', () => {
    const plan = planKit(base());
    expect(plan).toHaveLength(10);
    expect(plan[0]).toMatchObject({ position: 1, kind: 'cover' });
    expect(plan.slice(1, 8).map((s) => [s.position, s.kind])).toEqual([2, 3, 4, 5, 6, 7, 8].map((p) => [p, 'generated']));
    expect(plan[8]).toMatchObject({ position: 9, kind: 'fixed', fixedIndex: 0 });
    expect(plan[9]).toMatchObject({ position: 10, kind: 'fixed', fixedIndex: 1 });
  });

  test('sem loja e total 10: 9 fotos do meio e nenhuma fixa', () => {
    const plan = planKit(base({ includeStore: false }));
    expect(plan.filter((s) => s.kind === 'generated')).toHaveLength(9);
    expect(plan.filter((s) => s.kind === 'fixed')).toHaveLength(0);
    expect(plan).toHaveLength(10);
  });

  test('white_back e use_installed saem com aviso; os demais sem', () => {
    const plan = planKit(base({ total: 9, includeStore: false, types: ALL_TYPES }));
    for (const slot of plan.filter((s) => s.kind === 'generated')) {
      expect(slot.warnMissingAngle).toBe(ANGLE_WARNING_TYPES.has(slot.type!));
    }
    expect([...ANGLE_WARNING_TYPES].sort()).toEqual(['use_installed', 'white_back']);
    expect(plan.find((s) => s.type === 'white_back')!.warnMissingAngle).toBe(true);
    expect(plan.find((s) => s.type === 'use_hand')!.warnMissingAngle).toBe(false);
    expect(plan[0].warnMissingAngle).toBe(false);
  });

  test('usa os tipos escolhidos, na ordem, e completa com os padrões se faltarem', () => {
    const plan = planKit(base({ total: 6, includeStore: false, types: ['use_hand', 'white_side'] }));
    const types = plan.filter((s) => s.kind === 'generated').map((s) => s.type);
    expect(types).toEqual(['use_hand', 'white_side', ...defaultMiddleTypes(5).slice(2)]);
  });

  test('ignora tipos sobrando além da quantidade do meio', () => {
    const plan = planKit(base({ total: 3, includeStore: false, types: ['use_hand', 'white_side', 'white_back'] }));
    expect(plan.filter((s) => s.kind === 'generated').map((s) => s.type)).toEqual(['use_hand', 'white_side']);
  });
});

describe('defaultMiddleTypes', () => {
  test('7 devolve os 7 tipos sem repetir', () => {
    const types = defaultMiddleTypes(7);
    expect(new Set(types).size).toBe(7);
    expect([...types].sort()).toEqual([...ALL_TYPES].sort());
  });
  test('acima de 7 repete a partir do primeiro', () => {
    const types = defaultMiddleTypes(10);
    expect(types).toHaveLength(10);
    expect(types.slice(7)).toEqual(types.slice(0, 3));
  });
  test('menos que 7 devolve o começo da lista', () => {
    expect(defaultMiddleTypes(3)).toEqual(defaultMiddleTypes(7).slice(0, 3));
  });
});

describe('validateConfig', () => {
  test('config válida não tem mensagens', () => {
    expect(validateConfig(base())).toEqual([]);
  });

  test('capa com carro exige modelo e ano', () => {
    expect(validateConfig(base({ coverWithCar: true }))).toEqual(expect.arrayContaining([expect.stringMatching(/modelo/i), expect.stringMatching(/ano/i)]));
    expect(validateConfig(base({ coverWithCar: true, car: { model: '  ', year: '2012' } }))).toEqual([expect.stringMatching(/modelo/i)]);
    expect(validateConfig(base({ coverWithCar: true, car: { model: 'Gol', year: '' } }))).toEqual([expect.stringMatching(/ano/i)]);
    expect(validateConfig(base({ coverWithCar: true, car: { model: 'Gol', year: '2012' } }))).toEqual([]);
  });

  test('capa comum não exige carro', () => {
    expect(validateConfig(base({ coverWithCar: false, car: undefined }))).toEqual([]);
  });

  test('mínimo: capa mais uma do meio, mais duas fixas com a loja ligada', () => {
    expect(MIN_TOTAL).toBe(2);
    expect(minTotal(false)).toBe(2);
    expect(minTotal(true)).toBe(4);
    expect(validateConfig(base({ includeStore: false, total: 2 }))).toEqual([]);
    expect(validateConfig(base({ includeStore: false, total: 1 }))).toHaveLength(1);
    expect(validateConfig(base({ includeStore: true, total: 4 }))).toEqual([]);
    expect(validateConfig(base({ includeStore: true, total: 3 }))).toHaveLength(1);
  });

  test('máximo é 16', () => {
    expect(MAX_TOTAL).toBe(16);
    expect(validateConfig(base({ total: 16 }))).toEqual([]);
    expect(validateConfig(base({ total: 17 }))).toHaveLength(1);
  });

  test('total precisa ser inteiro', () => {
    expect(validateConfig(base({ total: 7.5 }))).toHaveLength(1);
    expect(validateConfig(base({ total: Number.NaN }))).toHaveLength(1);
  });
});
