import { describe, expect, test, vi } from 'vitest';
import { fakeStore, jpegBytes } from '@/lib/kit/testing';
import { ApiInputError, createKitFromRequest, generatePositions, kitView, loadImage, parseKitRequest, positionsToGenerate } from './kits';

const b64 = Buffer.from(jpegBytes()).toString('base64');
const okFetch = (async () => new Response(jpegBytes() as BlobPart, { status: 200 })) as unknown as typeof fetch;

describe('parseKitRequest', () => {
  test('usa os padrões da tela: 10 fotos, loja no fim, capa sem carro', () => {
    const r = parseKitRequest({ produto: 'Bomba de óleo', foto_url: 'https://x.test/a.jpg' });
    expect(r.config).toMatchObject({ total: 10, includeStore: true, coverWithCar: false, useExtraReference: false });
    expect(r.config.types).toHaveLength(7);
    expect(r.image).toEqual({ url: 'https://x.test/a.jpg' });
  });

  test('carro, tipos prontos e cena livre', () => {
    const r = parseKitRequest({
      produto: 'Farol',
      foto_base64: b64,
      total: 5,
      fotos_da_loja: false,
      carro: { modelo: 'Gol', ano: '2012' },
      tipos: ['white_side', { nome: 'Bancada', descricao: 'a peça numa bancada' }],
    });
    expect(r.config).toMatchObject({ total: 5, includeStore: false, coverWithCar: true, car: { model: 'Gol', year: '2012' } });
    expect(r.config.types.slice(0, 2)).toEqual(['white_side', 'custom']);
    expect(r.config.types).toHaveLength(4);
    expect(r.config.custom?.[1]).toEqual({ label: 'Bancada', prompt: 'a peça numa bancada' });
  });

  test('recusa pedidos incompletos com mensagens claras', () => {
    expect(() => parseKitRequest({ foto_url: 'https://x.test/a.jpg' })).toThrow(/produto/);
    expect(() => parseKitRequest({ produto: 'X' })).toThrow(/foto_url/);
    expect(() => parseKitRequest({ produto: 'X', foto_url: 'https://x', total: 30 })).toThrow(/total/);
    expect(() => parseKitRequest({ produto: 'X', foto_url: 'https://x', carro: { modelo: 'Gol' } })).toThrow(/ano/);
    expect(() => parseKitRequest({ produto: 'X', foto_url: 'https://x', tipos: ['voando'] })).toThrow(/desconhecido/);
    expect(() => parseKitRequest({ produto: 'X', foto_url: 'https://x', total: 4, tipos: ['white_side', 'white_back'] })).toThrow(/só tem 1/);
  });
});

describe('loadImage', () => {
  test('decodifica base64, com ou sem prefixo data:', async () => {
    const f = await loadImage({ base64: `data:image/jpeg;base64,${b64}` }, 'foto');
    expect(new Uint8Array(await f.arrayBuffer())).toEqual(jpegBytes());
  });

  test('recusa links da rede interna sem nem tentar baixar', async () => {
    const fetchFn = vi.fn();
    for (const url of ['http://localhost/a.jpg', 'http://127.0.0.1/a.jpg', 'http://169.254.169.254/x', 'http://192.168.0.2/a.jpg', 'ftp://x.test/a.jpg']) {
      await expect(loadImage({ url }, 'foto', fetchFn as unknown as typeof fetch)).rejects.toBeInstanceOf(ApiInputError);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('erro do link vira mensagem para quem chamou', async () => {
    const notFound = (async () => new Response('x', { status: 404 })) as unknown as typeof fetch;
    await expect(loadImage({ url: 'https://x.test/a.jpg' }, 'foto', notFound)).rejects.toThrow(/404/);
  });
});

describe('criar, gerar e acompanhar pela API', () => {
  test('cria o kit e devolve só as posições geradas por IA', async () => {
    const f = fakeStore();
    const { kitId, positions } = await createKitFromRequest({ produto: 'Bomba', foto_url: 'https://x.test/a.jpg', total: 6 }, { store: f.store, fetch: okFetch });
    expect(positions).toEqual([1, 2, 3, 4]);
    expect(f.kits.get(kitId)).toMatchObject({ product_name: 'Bomba' });
  });

  test('imagem que não é foto vira erro do pedido', async () => {
    const f = fakeStore();
    const txt = Buffer.from('não sou imagem').toString('base64');
    await expect(createKitFromRequest({ produto: 'Bomba', foto_base64: txt }, { store: f.store })).rejects.toThrow(/JPEG, PNG ou WEBP/);
  });

  test('gera em paralelo e o kit fica pronto, com links das fotos', async () => {
    const f = fakeStore();
    const { kitId, positions } = await createKitFromRequest({ produto: 'Bomba', foto_base64: b64, total: 6 }, { store: f.store });
    const generate = vi.fn(async () => ({ bytes: jpegBytes(), mime: 'image/jpeg' }));
    await generatePositions(f.store, kitId, positions, { generate, concurrency: 2 });
    expect(generate).toHaveBeenCalledTimes(4);
    const view = await kitView(f.store, f.kits.get(kitId)!, 'https://app.test');
    expect(view).toMatchObject({ status: 'pronto', prontas: 6, total: 6, link_no_app: `https://app.test/kits/${kitId}` });
    expect(view.fotos.map((p) => p.tipo)).toEqual(['capa', 'white_front', 'white_side', 'white_detail', 'loja', 'loja']);
    expect(view.fotos.every((p) => p.url?.startsWith('https://arquivos.test/'))).toBe(true);
    expect(view.fotos[4].nome).not.toBe(view.fotos[5].nome);
  });

  test('quando o teto diário estoura, as que faltam viram falha com o motivo', async () => {
    const f = fakeStore();
    const { kitId, positions } = await createKitFromRequest({ produto: 'Bomba', foto_base64: b64, total: 6 }, { store: f.store });
    f.setLogToday(200);
    await generatePositions(f.store, kitId, positions, { generate: vi.fn(), concurrency: 2 });
    const view = await kitView(f.store, f.kits.get(kitId)!, 'https://app.test');
    expect(view.status).toBe('com_falhas');
    expect(view.fotos.filter((p) => p.status === 'falhou').every((p) => /limite diário/i.test(p.erro ?? ''))).toBe(true);
    expect(view.fotos.filter((p) => p.status === 'falhou')).toHaveLength(4);
  });

  test('refazer: sem posições pega pendentes e falhas; posição fixa é recusada', async () => {
    const f = fakeStore();
    const { kitId } = await createKitFromRequest({ produto: 'Bomba', foto_base64: b64, total: 6 }, { store: f.store });
    await expect(positionsToGenerate(f.store, kitId)).resolves.toEqual([1, 2, 3, 4]);
    await expect(positionsToGenerate(f.store, kitId, [2, 2])).resolves.toEqual([2]);
    await expect(positionsToGenerate(f.store, kitId, [5])).rejects.toThrow(/fixas da loja/);
    await expect(positionsToGenerate(f.store, 'nada')).rejects.toThrow(/não encontrado/);
  });

  test('kit pendente sem ninguém gerando há muito tempo aparece como parado', async () => {
    const f = fakeStore();
    const { kitId } = await createKitFromRequest({ produto: 'Bomba', foto_base64: b64, total: 6 }, { store: f.store });
    const kit = { ...f.kits.get(kitId)!, created_at: '2026-10-28T10:00:00Z' };
    await expect(kitView(f.store, kit, 'https://app.test', new Date('2026-10-28T10:02:00Z'))).resolves.toMatchObject({ status: 'gerando' });
    await expect(kitView(f.store, kit, 'https://app.test', new Date('2026-10-28T10:30:00Z'))).resolves.toMatchObject({ status: 'parado' });
  });
});
