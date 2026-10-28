import { describe, expect, test, vi } from 'vitest';
import { fakeStore, jpegBytes } from '@/lib/kit/testing';
import { generatePositions } from './kits';
import { handleMcpMessage, TOOLS } from './mcp';

const b64 = Buffer.from(jpegBytes()).toString('base64');

function setup() {
  const f = fakeStore();
  const tasks: Array<() => Promise<void>> = [];
  const ctx = { store: f.store, origin: 'https://app.test', background: (t: () => Promise<void>) => void tasks.push(t), thumbnail: async () => 'THUMB' };
  let id = 0;
  const call = (method: string, params?: Record<string, unknown>) => handleMcpMessage({ jsonrpc: '2.0', id: ++id, method, params }, ctx) as Promise<any>;
  return { f, tasks, call, ctx };
}

describe('servidor MCP', () => {
  test('initialize devolve a versão pedida e anuncia ferramentas', async () => {
    const { call } = setup();
    const r = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude', version: '1' } });
    expect(r.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'syntra-images' } });
    const old = await call('initialize', { protocolVersion: '1999-01-01' });
    expect(old.result.protocolVersion).toBe('2025-11-25');
  });

  test('notificações não têm resposta; método desconhecido é erro JSON-RPC', async () => {
    const { ctx, call } = setup();
    await expect(handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).resolves.toBeNull();
    expect((await call('resources/list')).error.code).toBe(-32601);
  });

  test('tools/list lista as cinco ferramentas com esquema', async () => {
    const { call } = setup();
    const r = await call('tools/list');
    expect(r.result.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(r.result.tools.every((t: { inputSchema: { type: string } }) => t.inputSchema.type === 'object')).toBe(true);
  });

  test('criar, gerar em segundo plano e ver o kit com as fotos', async () => {
    const { call, tasks, f } = setup();
    const created = await call('tools/call', { name: 'criar_kit_de_fotos', arguments: { produto: 'Bomba', foto_base64: b64, total: 6 } });
    expect(created.result.isError).toBeUndefined();
    const kitId = [...f.kits.keys()][0];
    expect(created.result.content[0].text).toContain(kitId);
    expect(tasks).toHaveLength(1);

    // O que o `after` rodaria: troca a geração real por uma falsa.
    await generatePositions(f.store, kitId, [1, 2, 3, 4], { generate: vi.fn(async () => ({ bytes: jpegBytes(), mime: 'image/jpeg' })) });
    const seen = await call('tools/call', { name: 'ver_kit', arguments: { kit_id: kitId } });
    const content = seen.result.content as Array<{ type: string; text?: string; data?: string }>;
    expect(JSON.parse(content[0].text!)).toMatchObject({ status: 'pronto', prontas: 6 });
    expect(content.filter((c) => c.type === 'image')).toHaveLength(4); // sem as artes da loja
    const lean = await call('tools/call', { name: 'ver_kit', arguments: { kit_id: kitId, mostrar_fotos: false } });
    expect(lean.result.content).toHaveLength(1);
  });

  test('erro de pedido volta como resultado com isError, para o Claude corrigir', async () => {
    const { call, tasks } = setup();
    const r = await call('tools/call', { name: 'criar_kit_de_fotos', arguments: { produto: 'Bomba' } });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/foto_url/);
    expect(tasks).toHaveLength(0);
    const missing = await call('tools/call', { name: 'ver_kit', arguments: { kit_id: 'x' } });
    expect(missing.result).toMatchObject({ isError: true });
    expect((await call('tools/call', { name: 'inventada', arguments: {} })).error.code).toBe(-32602);
  });

  test('refazer fotos agenda só as posições pedidas', async () => {
    const { call, tasks, f } = setup();
    await call('tools/call', { name: 'criar_kit_de_fotos', arguments: { produto: 'Bomba', foto_base64: b64, total: 6 } });
    const kitId = [...f.kits.keys()][0];
    const r = await call('tools/call', { name: 'refazer_fotos', arguments: { kit_id: kitId, posicoes: [3] } });
    expect(r.result.content[0].text).toContain('3');
    expect(tasks).toHaveLength(2);
  });
});
