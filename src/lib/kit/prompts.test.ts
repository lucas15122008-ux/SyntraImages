import { describe, expect, test, vi } from 'vitest';
import { buildPrompt } from './prompts';
import type { PhotoType, Slot } from './types';

const ALL_TYPES: PhotoType[] = ['white_front', 'white_side', 'white_detail', 'white_back', 'white_on_box', 'use_hand', 'use_installed'];
const ctx = { productName: 'Bomba de óleo Gol 1.0', hasExtraReference: false };
const generated = (type: PhotoType): Slot => ({ position: 2, kind: 'generated', type, warnMissingAngle: false });
const cover: Slot = { position: 1, kind: 'cover', warnMissingAngle: false };

describe('buildPrompt', () => {
  test('todo prompt traz a instrução de fidelidade da peça', () => {
    const slots = [cover, ...ALL_TYPES.map(generated)];
    for (const slot of slots) {
      for (const c of [ctx, { ...ctx, car: { model: 'Gol', year: '2012' } }, { ...ctx, hasExtraReference: true }]) {
        const { text } = buildPrompt(slot, c);
        expect(text).toMatch(/idêntica à da foto de referência/);
        expect(text).toMatch(/formato, cor, furos, marcações ou logotipos/);
      }
    }
  });

  test('todo prompt pede quadrada, peça centralizada e sem texto ou marca d\'água', () => {
    for (const slot of [cover, ...ALL_TYPES.map(generated)]) {
      const { text } = buildPrompt(slot, ctx);
      expect(text).toMatch(/quadrada/);
      expect(text).toMatch(/centralizada/);
      expect(text).toMatch(/sem texto/i);
      expect(text).toMatch(/marca d'água/);
    }
  });

  test('imageRoles começa com o produto e inclui extra só com referência extra', () => {
    expect(buildPrompt(generated('white_front'), ctx).imageRoles).toEqual(['product']);
    expect(buildPrompt(generated('white_front'), { ...ctx, hasExtraReference: true }).imageRoles).toEqual(['product', 'extra']);
  });

  test('com referência extra o prompt explica o papel de cada imagem', () => {
    const { text } = buildPrompt(generated('use_hand'), { ...ctx, hasExtraReference: true });
    expect(text).toMatch(/primeira imagem/);
    expect(text).toMatch(/segunda imagem/);
    const without = buildPrompt(generated('use_hand'), ctx).text;
    expect(without).not.toMatch(/segunda imagem/);
  });

  test('capa com carro cita modelo e ano do carro', () => {
    const { text } = buildPrompt(cover, { ...ctx, car: { model: 'Fiat Uno', year: '2014' } });
    expect(text).toContain('Fiat Uno');
    expect(text).toContain('2014');
  });

  test('capa comum pede fundo branco sem carro', () => {
    const { text } = buildPrompt(cover, ctx);
    expect(text).toMatch(/fundo branco/);
    expect(text).toMatch(/sem carro/);
  });

  test('fotos de uso com mão pedem mão humana com cinco dedos naturais', () => {
    const { text } = buildPrompt(generated('use_hand'), ctx);
    expect(text).toMatch(/mão humana/);
    expect(text).toMatch(/cinco dedos naturais/);
  });

  test('fotos de fundo branco pedem fundo branco de estúdio', () => {
    for (const t of ['white_front', 'white_side', 'white_detail', 'white_back', 'white_on_box'] as const) {
      expect(buildPrompt(generated(t), ctx).text).toMatch(/fundo branco de estúdio/);
    }
  });

  test('cada tipo tem um texto próprio', () => {
    const texts = ALL_TYPES.map((t) => buildPrompt(generated(t), ctx).text);
    expect(new Set(texts).size).toBe(ALL_TYPES.length);
  });

  test('slot fixed lança erro', () => {
    const fixed: Slot = { position: 9, kind: 'fixed', fixedIndex: 0, warnMissingAngle: false };
    expect(() => buildPrompt(fixed, ctx)).toThrow(/fixa/i);
  });

  test('slot gerado sem tipo lança erro', () => {
    expect(() => buildPrompt({ position: 2, kind: 'generated', warnMissingAngle: false }, ctx)).toThrow(/tipo/i);
  });

  test('se o modelo aceitasse só uma imagem, a referência extra seria ignorada', async () => {
    vi.resetModules();
    vi.doMock('./model', () => ({ MODEL_MAX_INPUT_IMAGES: 1 }));
    const { buildPrompt: single } = await import('./prompts');
    const out = single(generated('white_front'), { ...ctx, hasExtraReference: true });
    expect(out.imageRoles).toEqual(['product']);
    expect(out.text).not.toMatch(/segunda imagem/);
    vi.doUnmock('./model');
    vi.resetModules();
  });
});
