import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import { GenerationError } from '@/lib/openrouter/client';
import { createKit, generatePhoto, startOfDayBR, type GenerateFn } from './generate';
import type { KitRow, KitStore, PhotoRow, StoreAsset } from './store';
import type { KitConfig } from './types';

// ───────── Loja falsa em memória (reproduz a regra de reivindicação atômica) ─────────
function fakeStore(over: { assets?: [StoreAsset | null, StoreAsset | null]; failInsertPhotos?: boolean } = {}) {
  const files = new Map<string, Uint8Array>();
  const kits = new Map<string, KitRow>();
  let photos: PhotoRow[] = [];
  const log: Array<{ kitId: string; position: number }> = [];
  const writes: string[] = [];
  let logToday = 0;
  const store: KitStore = {
    currentUserId: async () => 'user-1',
    getStoreAssets: async () =>
      over.assets ?? [
        { slot: 0, storage_path: 'loja-0.jpg' },
        { slot: 1, storage_path: 'loja-1.jpg' },
      ],
    putFile: async (bucket, path, bytes) => {
      writes.push(`put:${bucket}/${path}`);
      files.set(`${bucket}/${path}`, bytes);
    },
    getFile: async (bucket, path) => {
      const f = files.get(`${bucket}/${path}`);
      if (!f) throw new Error(`arquivo ausente ${bucket}/${path}`);
      return f;
    },
    removeFile: async (bucket, path) => {
      writes.push(`rm:${bucket}/${path}`);
      files.delete(`${bucket}/${path}`);
    },
    insertKit: async (row) => {
      writes.push('insertKit');
      kits.set(row.id, { ...row, owner: 'user-1' });
    },
    insertPhotos: async (rows) => {
      writes.push('insertPhotos');
      if (over.failInsertPhotos) throw new Error('falha ao inserir fotos');
      photos.push(...rows.map((r, i) => ({ ...r, id: `p${photos.length + i + 1}` })));
    },
    deleteKit: async (id) => {
      writes.push('deleteKit');
      kits.delete(id);
      photos = photos.filter((p) => p.kit_id !== id);
    },
    getKit: async (id) => kits.get(id) ?? null,
    getPhoto: async (kitId, position) => {
      const p = photos.find((x) => x.kit_id === kitId && x.position === position);
      return p ? { ...p } : null; // cópia, como o banco real
    },
    claimPhoto: async (kitId, position, staleBefore) => {
      const p = photos.find((x) => x.kit_id === kitId && x.position === position);
      if (!p) return null;
      const stale = p.status === 'generating' && !!p.generating_since && p.generating_since < staleBefore;
      if (p.status === 'generating' && !stale) return null;
      p.status = 'generating';
      p.generating_since = new Date();
      p.attempts += 1;
      p.error = null;
      return { ...p };
    },
    countGenerationsSince: async () => logToday + log.length,
    logGeneration: async (kitId, position) => {
      log.push({ kitId, position });
    },
    updatePhoto: async (id, patch) => {
      Object.assign(photos.find((p) => p.id === id)!, patch);
    },
  };
  return { store, files, kits, photos: () => photos, log, writes, setLogToday: (n: number) => (logToday = n) };
}

const jpegBytes = (n = 20) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(7)]);
const pngBytes = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const webpBytes = () => new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);
const file = (bytes: Uint8Array, type: string, name = 'foto') => new File([bytes as BlobPart], name, { type });

const config = (over: Partial<KitConfig> = {}): KitConfig => ({
  total: 6,
  coverWithCar: true,
  car: { model: 'Gol', year: '2012' },
  useExtraReference: false,
  includeStore: true,
  types: ['white_front', 'white_back'],
  ...over,
});
const input = (over: Record<string, unknown> = {}) => ({
  productName: 'Bomba de óleo',
  config: config(),
  original: file(jpegBytes(), 'image/jpeg'),
  ...over,
});

// ───────── createKit ─────────
describe('createKit', () => {
  test('cria uma linha por posição: fixas nascem done apontando para a loja, o resto pending', async () => {
    const f = fakeStore();
    const { kitId } = await createKit(input(), { store: f.store });
    const rows = f.photos().sort((a, b) => a.position - b.position);
    expect(rows.map((r) => [r.position, r.kind, r.status])).toEqual([
      [1, 'cover', 'pending'],
      [2, 'generated', 'pending'],
      [3, 'generated', 'pending'],
      [4, 'generated', 'pending'],
      [5, 'fixed', 'done'],
      [6, 'fixed', 'done'],
    ]);
    expect(rows[4]).toMatchObject({ storage_path: 'loja-0.jpg', kit_id: kitId });
    expect(rows[5]).toMatchObject({ storage_path: 'loja-1.jpg' });
    expect(f.kits.get(kitId)).toMatchObject({ product_name: 'Bomba de óleo', car_model: 'Gol', car_year: '2012' });
    expect([...f.files.keys()].some((k) => k.startsWith('originals/user-1/'))).toBe(true);
  });

  test('fotos de tipo com ângulo ausente gravam o aviso', async () => {
    const f = fakeStore();
    await createKit(input({ config: config({ types: ['white_front', 'white_back', 'use_installed'] }) }), { store: f.store });
    const byType = Object.fromEntries(f.photos().filter((p) => p.kind === 'generated').map((p) => [p.type, p.warn_missing_angle]));
    expect(byType).toEqual({ white_front: false, white_back: true, use_installed: true });
    expect(f.photos().find((p) => p.kind === 'cover')!.warn_missing_angle).toBe(false);
  });

  test('aceita JPEG, PNG e WEBP', async () => {
    for (const [bytes, type] of [[jpegBytes(), 'image/jpeg'], [pngBytes(), 'image/png'], [webpBytes(), 'image/webp']] as const) {
      const f = fakeStore();
      await expect(createKit(input({ original: file(bytes, type) }), { store: f.store })).resolves.toHaveProperty('kitId');
    }
  });

  test.each([
    ['arquivo que não é imagem', file(new TextEncoder().encode('isto é texto'), 'text/plain')],
    ['texto disfarçado de JPEG', file(new TextEncoder().encode('isto é texto'), 'image/jpeg')],
    ['HEIC', file(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]), 'image/heic')],
    ['GIF', file(new TextEncoder().encode('GIF89a....'), 'image/gif')],
    ['arquivo vazio', file(new Uint8Array(0), 'image/jpeg')],
  ])('rejeita %s sem criar nada', async (_nome, original) => {
    const f = fakeStore();
    await expect(createKit(input({ original }), { store: f.store })).rejects.toThrow(/JPEG, PNG ou WEBP|vazi/i);
    expect(f.writes).toEqual([]);
  });

  test('rejeita imagem acima de 10 MB sem criar nada', async () => {
    const f = fakeStore();
    const big = file(jpegBytes(10 * 1024 * 1024), 'image/jpeg');
    await expect(createKit(input({ original: big }), { store: f.store })).rejects.toThrow(/10 MB/);
    expect(f.writes).toEqual([]);
  });

  test('configuração inválida (capa com carro sem modelo) não cria nada', async () => {
    const f = fakeStore();
    await expect(createKit(input({ config: config({ car: { model: '', year: '2012' } }) }), { store: f.store })).rejects.toThrow(/modelo/i);
    expect(f.writes).toEqual([]);
  });

  test('nome do produto vazio não cria nada', async () => {
    const f = fakeStore();
    await expect(createKit(input({ productName: '  ' }), { store: f.store })).rejects.toThrow(/nome do produto/i);
    expect(f.writes).toEqual([]);
  });

  test('loja ligada sem as artes pede para subi-las em Configurações', async () => {
    const f = fakeStore({ assets: [{ slot: 0, storage_path: 'a.jpg' }, null] });
    await expect(createKit(input(), { store: f.store })).rejects.toThrow('Suba as artes da loja em Configurações');
    expect(f.writes).toEqual([]);
  });

  test('loja desligada não exige artes', async () => {
    const f = fakeStore({ assets: [null, null] });
    await expect(createKit(input({ config: config({ includeStore: false }) }), { store: f.store })).resolves.toHaveProperty('kitId');
  });

  test('referência extra ligada sem arquivo é recusada; com arquivo é guardada', async () => {
    const f = fakeStore();
    await expect(createKit(input({ config: config({ useExtraReference: true }) }), { store: f.store })).rejects.toThrow(/referência/i);
    expect(f.writes).toEqual([]);
    const { kitId } = await createKit(
      input({ config: config({ useExtraReference: true }), extraReference: file(pngBytes(), 'image/png') }),
      { store: f.store },
    );
    expect(f.kits.get(kitId)!.extra_reference_path).toMatch(/^user-1\/.+\/extra\.png$/);
  });

  test('referência extra inválida também é recusada', async () => {
    const f = fakeStore();
    await expect(
      createKit(input({ config: config({ useExtraReference: true }), extraReference: file(new TextEncoder().encode('x'), 'image/png') }), { store: f.store }),
    ).rejects.toThrow(/JPEG, PNG ou WEBP/);
    expect(f.writes).toEqual([]);
  });

  test('se algo falha no meio, desfaz o que já gravou', async () => {
    const f = fakeStore({ failInsertPhotos: true });
    await expect(createKit(input(), { store: f.store })).rejects.toThrow(/criar o kit/i);
    expect(f.kits.size).toBe(0);
    expect(f.files.size).toBe(0);
  });
});

// ───────── generatePhoto ─────────
const okImage = { bytes: jpegBytes(5), mime: 'image/jpeg' };

async function kitWith(f: ReturnType<typeof fakeStore>, over: Partial<KitConfig> = {}, extra?: File) {
  const { kitId } = await createKit(input({ config: config(over), extraReference: extra }), { store: f.store });
  return kitId;
}

describe('generatePhoto', () => {
  let generate: Mock<GenerateFn>;
  beforeEach(() => {
    generate = vi.fn<GenerateFn>().mockResolvedValue(okImage);
    vi.stubEnv('DAILY_GENERATION_LIMIT', '50');
  });

  test('gera, grava em generated e marca done com 1 tentativa', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    await generatePhoto(kitId, 2, { store: f.store, generate });
    const row = f.photos().find((p) => p.position === 2)!;
    expect(row).toMatchObject({ status: 'done', attempts: 1, error: null });
    expect(row.storage_path).toMatch(/^user-1\/.+\/2-1\.jpg$/);
    expect(f.files.has(`generated/${row.storage_path}`)).toBe(true);
    expect(f.log).toEqual([{ kitId, position: 2 }]);
  });

  test('envia a foto original como referência junto do prompt do tipo certo', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    await generatePhoto(kitId, 3, { store: f.store, generate });
    const req = generate.mock.calls[0][0];
    expect(req.images).toHaveLength(1);
    expect(req.images[0].mime).toBe('image/jpeg');
    expect(req.images[0].bytes.length).toBeGreaterThan(5);
    expect(req.prompt).toMatch(/idêntica à da foto de referência/);
    expect(req.prompt).toMatch(/por trás/); // posição 3 = white_back
  });

  test('a capa com carro cita o carro; com referência extra envia duas imagens', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f, { useExtraReference: true }, file(pngBytes(), 'image/png'));
    await generatePhoto(kitId, 1, { store: f.store, generate });
    const req = generate.mock.calls[0][0];
    expect(req.prompt).toContain('Gol');
    expect(req.prompt).toContain('2012');
    expect(req.images).toHaveLength(2);
    expect(req.images[1].mime).toBe('image/png');
  });

  test('uma foto que falha fica failed com o erro; as outras seguem pending ou done', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    generate.mockRejectedValueOnce(new GenerationError('O serviço de imagens falhou (HTTP 503). Tente refazer em instantes.', { retryable: true, status: 503 }));
    await expect(generatePhoto(kitId, 2, { store: f.store, generate })).resolves.toBeUndefined();
    await generatePhoto(kitId, 3, { store: f.store, generate });
    const by = Object.fromEntries(f.photos().map((p) => [p.position, p]));
    expect(by[2]).toMatchObject({ status: 'failed', storage_path: null });
    expect(by[2].error).toMatch(/503/);
    expect(by[3].status).toBe('done');
    expect(by[1].status).toBe('pending');
    expect(by[4].status).toBe('pending');
    expect(by[5].status).toBe('done'); // fixa
  });

  test('erro inesperado vira failed com mensagem genérica, sem vazar detalhes', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    generate.mockRejectedValueOnce(new Error('segredo interno sk-123'));
    await generatePhoto(kitId, 2, { store: f.store, generate });
    const row = f.photos().find((p) => p.position === 2)!;
    expect(row.status).toBe('failed');
    expect(row.error).not.toContain('sk-123');
    expect(row.error).toMatch(/falhou/i);
  });

  test('segunda chamada para foto já generating não dispara outra geração', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    let release!: () => void;
    generate.mockImplementationOnce(() => new Promise((res) => (release = () => res(okImage))));
    const first = generatePhoto(kitId, 2, { store: f.store, generate });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await generatePhoto(kitId, 2, { store: f.store, generate });
    await generatePhoto(kitId, 2, { store: f.store, generate });
    expect(generate).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(f.photos().find((p) => p.position === 2)).toMatchObject({ status: 'done', attempts: 1 });
    expect(f.log).toHaveLength(1);
  });

  test('cliques repetidos em Refazer em paralelo geram uma vez só', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    await generatePhoto(kitId, 2, { store: f.store, generate });
    generate.mockClear();
    await Promise.all(Array.from({ length: 5 }, () => generatePhoto(kitId, 2, { store: f.store, generate })));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(f.photos().find((p) => p.position === 2)!.attempts).toBe(2);
  });

  test('ao atingir o limite diário recusa com mensagem em português, sem gerar nem mudar a foto', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    vi.stubEnv('DAILY_GENERATION_LIMIT', '3');
    f.setLogToday(3);
    await expect(generatePhoto(kitId, 2, { store: f.store, generate })).rejects.toThrow(/limite diário de 3 gerações/i);
    expect(generate).not.toHaveBeenCalled();
    expect(f.photos().find((p) => p.position === 2)).toMatchObject({ status: 'pending', attempts: 0 });
  });

  test('abaixo do limite continua gerando', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    vi.stubEnv('DAILY_GENERATION_LIMIT', '3');
    f.setLogToday(2);
    await generatePhoto(kitId, 2, { store: f.store, generate });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('refazer aumenta attempts e substitui o arquivo gerado', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    await generatePhoto(kitId, 2, { store: f.store, generate });
    const firstPath = f.photos().find((p) => p.position === 2)!.storage_path!;
    generate.mockResolvedValueOnce({ bytes: jpegBytes(99), mime: 'image/jpeg' });
    await generatePhoto(kitId, 2, { store: f.store, generate });
    const row = f.photos().find((p) => p.position === 2)!;
    expect(row.attempts).toBe(2);
    expect(row.status).toBe('done');
    expect(row.storage_path).not.toBe(firstPath);
    expect(f.files.has(`generated/${firstPath}`)).toBe(false);
    expect(f.files.get(`generated/${row.storage_path}`)!.length).toBe(4 + 99);
  });

  test('refação que falha mantém a foto anterior no storage', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    await generatePhoto(kitId, 2, { store: f.store, generate });
    const firstPath = f.photos().find((p) => p.position === 2)!.storage_path!;
    generate.mockRejectedValueOnce(new GenerationError('falhou', { retryable: true }));
    await generatePhoto(kitId, 2, { store: f.store, generate });
    const row = f.photos().find((p) => p.position === 2)!;
    expect(row.status).toBe('failed');
    expect(row.storage_path).toBe(firstPath);
    expect(f.files.has(`generated/${firstPath}`)).toBe(true);
  });

  test('geração travada há mais de 5 minutos pode ser reassumida', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    const row = f.photos().find((p) => p.position === 2)!;
    row.status = 'generating';
    row.generating_since = new Date(Date.now() - 6 * 60_000);
    await generatePhoto(kitId, 2, { store: f.store, generate });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(row.status).toBe('done');
  });

  test('foto fixa da loja não é gerada', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    await expect(generatePhoto(kitId, 5, { store: f.store, generate })).rejects.toThrow(/fixa/i);
    expect(generate).not.toHaveBeenCalled();
  });

  test('kit ou posição inexistente lança erro', async () => {
    const f = fakeStore();
    const kitId = await kitWith(f);
    await expect(generatePhoto('nao-existe', 1, { store: f.store, generate })).rejects.toThrow(/kit não encontrado/i);
    await expect(generatePhoto(kitId, 99, { store: f.store, generate })).rejects.toThrow(/foto não encontrada/i);
  });
});

describe('startOfDayBR', () => {
  test('começa à meia-noite de Brasília (03:00 UTC)', () => {
    expect(startOfDayBR(new Date('2026-10-16T15:00:00Z')).toISOString()).toBe('2026-10-16T03:00:00.000Z');
    expect(startOfDayBR(new Date('2026-10-16T02:59:00Z')).toISOString()).toBe('2026-10-15T03:00:00.000Z');
  });
});
