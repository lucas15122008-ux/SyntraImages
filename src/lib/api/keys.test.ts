import { describe, expect, test, vi } from 'vitest';
import { authenticate, hashApiKey, newApiKey, readApiKey } from './keys';

const req = (headers: Record<string, string> = {}, url = 'https://app.test/api/v1/kits') => new Request(url, { headers });

describe('chaves da API', () => {
  test('cada chave é única, começa com syn_ e só o hash é guardado', () => {
    const a = newApiKey();
    const b = newApiKey();
    expect(a.key).toMatch(/^syn_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).not.toContain(a.key);
    expect(a.prefix).toBe(a.key.slice(0, 10));
  });

  test('lê a chave do Bearer, do X-API-Key ou da URL', () => {
    expect(readApiKey(req({ authorization: 'Bearer syn_abc' }))).toBe('syn_abc');
    expect(readApiKey(req({ 'x-api-key': 'syn_def' }))).toBe('syn_def');
    expect(readApiKey(req({}, 'https://app.test/api/mcp?key=syn_ghi'))).toBe('syn_ghi');
    expect(readApiKey(req({ authorization: 'Bearer outra-coisa' }))).toBeNull();
    expect(readApiKey(req())).toBeNull();
  });

  test('aceita chave ativa, recusa revogada ou desconhecida', async () => {
    const { key, hash } = newApiKey();
    const touch = vi.fn(async () => {});
    const lookup = async (h: string) => (h === hash ? { id: 'k1', user_id: 'u1', revoked_at: null } : null);
    await expect(authenticate(req({ authorization: `Bearer ${key}` }), { lookup, touch })).resolves.toEqual({ keyId: 'k1', userId: 'u1' });
    expect(touch).toHaveBeenCalledWith('k1');
    await expect(authenticate(req({ authorization: 'Bearer syn_errada' }), { lookup, touch })).resolves.toBeNull();
    const revoked = async () => ({ id: 'k1', user_id: 'u1', revoked_at: '2026-10-28T00:00:00Z' });
    await expect(authenticate(req({ authorization: `Bearer ${key}` }), { lookup: revoked, touch })).resolves.toBeNull();
  });
});
