/**
 * Teste real, com custo (~US$ 0,01 por foto): monta os prompts do app e gera de verdade no OpenRouter.
 * Só roda com LIVE_SMOKE=<caminho da foto>; `pnpm test` normal o ignora.
 *   LIVE_SMOKE=/caminho/foto.png pnpm test scripts/live-smoke.test.ts
 * A chave vem de OPENROUTER_API_KEY ou de .env.local. As imagens vão para scripts/out/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { generateImage } from '@/lib/openrouter/client';
import { sniffImageMime } from '@/lib/kit/image';
import { buildPrompt } from '@/lib/kit/prompts';
import type { Slot } from '@/lib/kit/types';

const photoPath = process.env.LIVE_SMOKE;

function apiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  if (!existsSync('.env.local')) return undefined;
  return readFileSync('.env.local', 'utf8').match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
}

describe.skipIf(!photoPath)('geração real no OpenRouter', () => {
  const slots: Array<[string, Slot, { car?: { model: string; year: string } }]> = [
    ['capa-com-carro', { position: 1, kind: 'cover', warnMissingAngle: false }, { car: { model: 'Gol G5', year: '2012' } }],
    ['lateral', { position: 3, kind: 'generated', type: 'white_side', warnMissingAngle: false }, {}],
    ['mao', { position: 6, kind: 'generated', type: 'use_hand', warnMissingAngle: false }, {}],
  ];

  test.each(slots)('gera %s e devolve uma imagem quadrada', async (name, slot, extra) => {
    const bytes = new Uint8Array(readFileSync(photoPath!));
    const mime = sniffImageMime(bytes)!;
    const { text } = buildPrompt(slot, { productName: 'Bomba de óleo', hasExtraReference: false, ...extra });
    const started = Date.now();
    const out = await generateImage({ prompt: text, images: [{ bytes, mime }] }, { apiKey: apiKey() });
    mkdirSync('scripts/out', { recursive: true });
    writeFileSync(`scripts/out/live-${name}.jpg`, out.bytes);
    console.log(`${name}: ${((Date.now() - started) / 1000).toFixed(1)}s, ${out.mime}, ${out.bytes.length} bytes`);
    expect(sniffImageMime(out.bytes)).toBeTruthy();
  }, 400_000);
});
