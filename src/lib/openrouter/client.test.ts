import { describe, expect, test, vi } from 'vitest';
import { GenerationError, generateImage } from './client';

const KEY = 'sk-test-123';
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const jpegB64 = Buffer.from([255, 216, 255, 224, 9, 9]).toString('base64');

const okResponse = (data: unknown = [{ b64_json: jpegB64, media_type: 'image/jpeg' }]) =>
  new Response(JSON.stringify({ data, usage: { cost: 0.01 } }), { status: 200, headers: { 'content-type': 'application/json' } });
const errResponse = (status: number) =>
  new Response(JSON.stringify({ error: { message: 'x', code: status } }), { status, headers: { 'content-type': 'application/json' } });

const req = { prompt: 'foto da peça', images: [{ bytes: png, mime: 'image/png' }] };
const base = (fetchImpl: typeof fetch) => ({ fetch: fetchImpl, apiKey: KEY, sleep: vi.fn().mockResolvedValue(undefined) });

describe('generateImage', () => {
  test('envia prompt e imagens no formato da API /images, com a chave no cabeçalho', async () => {
    const f = vi.fn().mockResolvedValue(okResponse());
    await generateImage(
      { prompt: 'foto da peça', images: [{ bytes: png, mime: 'image/png' }, { bytes: new Uint8Array([1, 2]), mime: 'image/jpeg' }] },
      { ...base(f as unknown as typeof fetch), model: 'meta/muse-image' },
    );
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/images');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'meta/muse-image', prompt: 'foto da peça', n: 1, aspect_ratio: '1:1', output_format: 'jpeg' });
    expect(body.input_references).toEqual([
      { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from(png).toString('base64')}` } },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQI=' } },
    ]);
  });

  test('devolve os bytes e o tipo da imagem gerada', async () => {
    const f = vi.fn().mockResolvedValue(okResponse());
    const out = await generateImage(req, base(f as unknown as typeof fetch));
    expect(out.mime).toBe('image/jpeg');
    expect(Array.from(out.bytes)).toEqual([255, 216, 255, 224, 9, 9]);
  });

  test('sem media_type na resposta, assume JPEG (o formato pedido)', async () => {
    const f = vi.fn().mockResolvedValue(okResponse([{ b64_json: jpegB64 }]));
    expect((await generateImage(req, base(f as unknown as typeof fetch))).mime).toBe('image/jpeg');
  });

  test.each([429, 500, 502, 503])('HTTP %i vira erro repetível, após 2 repetições', async (status) => {
    const f = vi.fn().mockImplementation(async () => errResponse(status));
    const err = await generateImage(req, base(f as unknown as typeof fetch)).catch((e) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(status);
    expect(f).toHaveBeenCalledTimes(3);
  });

  test.each([400, 401, 402, 403, 404])('HTTP %i vira erro não repetível, sem repetir', async (status) => {
    const f = vi.fn().mockImplementation(async () => errResponse(status));
    const err = await generateImage(req, base(f as unknown as typeof fetch)).catch((e) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect(err.retryable).toBe(false);
    expect(err.status).toBe(status);
    expect(f).toHaveBeenCalledTimes(1);
  });

  test('erro passageiro seguido de sucesso devolve a imagem, com espera crescente', async () => {
    const f = vi.fn().mockResolvedValueOnce(errResponse(429)).mockResolvedValueOnce(errResponse(503)).mockResolvedValueOnce(okResponse());
    const deps = base(f as unknown as typeof fetch);
    const out = await generateImage(req, deps);
    expect(out.bytes.length).toBe(6);
    expect(f).toHaveBeenCalledTimes(3);
    const waits = deps.sleep.mock.calls.map((c) => c[0] as number);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(waits[0]);
  });

  test('resposta sem imagem vira erro não repetível', async () => {
    for (const data of [[], [{}], null]) {
      const f = vi.fn().mockResolvedValue(okResponse(data));
      const err = await generateImage(req, base(f as unknown as typeof fetch)).catch((e) => e);
      expect(err).toBeInstanceOf(GenerationError);
      expect(err.retryable).toBe(false);
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  test('falha de rede é repetível', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const err = await generateImage(req, base(f as unknown as typeof fetch)).catch((e) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect(err.retryable).toBe(true);
    expect(err.status).toBeUndefined();
    expect(f).toHaveBeenCalledTimes(3);
  });

  test('tempo esgotado em uma tentativa é repetível', async () => {
    const f = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'TimeoutError')))),
    );
    const err = await generateImage(req, { ...base(f as unknown as typeof fetch), timeoutMs: 10, maxRetries: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/tempo/i);
    expect(f).toHaveBeenCalledTimes(2);
  });

  test('sem chave configurada falha sem chamar a API', async () => {
    const f = vi.fn();
    const err = await generateImage(req, { fetch: f as unknown as typeof fetch, apiKey: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect(err.retryable).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  test('a chave nunca aparece na mensagem de erro', async () => {
    const f = vi.fn().mockImplementation(async () => errResponse(401));
    const err = await generateImage(req, base(f as unknown as typeof fetch)).catch((e) => e);
    expect(err.message).not.toContain(KEY);
  });

  test('o modelo padrão é meta/muse-image', async () => {
    const f = vi.fn().mockResolvedValue(okResponse());
    await generateImage(req, base(f as unknown as typeof fetch));
    expect(JSON.parse(f.mock.calls[0][1].body).model).toBe('meta/muse-image');
  });
});
