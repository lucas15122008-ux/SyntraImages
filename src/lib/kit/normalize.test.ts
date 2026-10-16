import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { getDownloadConfig, normalizeImage } from './normalize';

const make = (w: number, h: number, format: 'png' | 'jpeg' | 'webp' = 'png', background = '#336699') =>
  sharp({ create: { width: w, height: h, channels: 3, background } }).toFormat(format).toBuffer().then((b) => new Uint8Array(b));

const meta = async (bytes: Uint8Array) => {
  const m = await sharp(bytes).metadata();
  return { w: m.width, h: m.height, f: m.format };
};

describe('getDownloadConfig', () => {
  test('padrão: JPEG quadrado de 1600 px', () => {
    expect(getDownloadConfig({})).toEqual({ size: 1600, format: 'jpg' });
  });
  test('lê tamanho e formato do ambiente', () => {
    expect(getDownloadConfig({ DOWNLOAD_IMAGE_SIZE: '1200', DOWNLOAD_IMAGE_FORMAT: 'png' })).toEqual({ size: 1200, format: 'png' });
    expect(getDownloadConfig({ DOWNLOAD_IMAGE_FORMAT: 'JPEG' }).format).toBe('jpg');
  });
  test('valores inválidos voltam ao padrão e o tamanho é limitado entre 600 e 3000', () => {
    expect(getDownloadConfig({ DOWNLOAD_IMAGE_SIZE: 'abc', DOWNLOAD_IMAGE_FORMAT: 'gif' })).toEqual({ size: 1600, format: 'jpg' });
    expect(getDownloadConfig({ DOWNLOAD_IMAGE_SIZE: '100' }).size).toBe(600);
    expect(getDownloadConfig({ DOWNLOAD_IMAGE_SIZE: '99999' }).size).toBe(3000);
  });
});

describe('normalizeImage', () => {
  test('foto já quadrada no tamanho e formato certos passa sem reprocessar', async () => {
    const jpeg = await make(1600, 1600, 'jpeg');
    const out = await normalizeImage(jpeg, { size: 1600, format: 'jpg' });
    expect(out.ext).toBe('jpg');
    expect(await meta(out.bytes)).toEqual({ w: 1600, h: 1600, f: 'jpeg' });
    expect(out.bytes).toBe(jpeg);
  });

  test('redimensiona para o tamanho configurado', async () => {
    const out = await normalizeImage(await make(1600, 1600, 'jpeg'), { size: 1200, format: 'jpg' });
    expect(await meta(out.bytes)).toEqual({ w: 1200, h: 1200, f: 'jpeg' });
  });

  test('arte da loja retangular em PNG vira quadrada em JPEG, sem cortar, com fundo branco', async () => {
    const out = await normalizeImage(await make(800, 400, 'png', '#ff0000'), { size: 1000, format: 'jpg' });
    expect(out.ext).toBe('jpg');
    expect(await meta(out.bytes)).toEqual({ w: 1000, h: 1000, f: 'jpeg' });
    const { data } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [data[(y * 1000 + x) * 3], data[(y * 1000 + x) * 3 + 1], data[(y * 1000 + x) * 3 + 2]];
    expect(px(500, 10).every((v) => v > 240)).toBe(true); // faixa de cima: branco
    expect(px(500, 500)[0]).toBeGreaterThan(200); // centro: vermelho (a arte inteira, sem corte)
    expect(px(500, 500)[2]).toBeLessThan(60);
  });

  test('formato PNG configurado devolve PNG', async () => {
    const out = await normalizeImage(await make(500, 500, 'jpeg'), { size: 800, format: 'png' });
    expect(out.ext).toBe('png');
    expect(await meta(out.bytes)).toEqual({ w: 800, h: 800, f: 'png' });
  });

  test('WEBP de entrada também é convertido', async () => {
    const out = await normalizeImage(await make(900, 900, 'webp'), { size: 900, format: 'jpg' });
    expect((await meta(out.bytes)).f).toBe('jpeg');
  });
});
