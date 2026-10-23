import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({}) }));

import { sealToken } from './crypto';
import { getAccessTokenWith, MlNotConnectedError, type ConnectionRow, type ConnectionStore } from './connection';
import type { MlTokens } from './oauth';

beforeEach(() => vi.stubEnv('ML_TOKEN_KEY', 'k'.repeat(40)));
afterEach(() => vi.unstubAllEnvs());

const NOW = new Date('2026-10-23T12:00:00Z');
const row = (minutesLeft: number): ConnectionRow => ({
  ml_user_id: 42,
  nickname: 'LOJA',
  access_token_enc: sealToken('AT'),
  refresh_token_enc: sealToken('RT'),
  expires_at: new Date(NOW.getTime() + minutesLeft * 60_000).toISOString(),
  connected_at: NOW.toISOString(),
});
const fresh: MlTokens = { accessToken: 'AT2', refreshToken: 'RT2', expiresAt: new Date(NOW.getTime() + 6 * 3600_000), userId: 42, scope: null };

function memoryStore(initial: ConnectionRow | null, claimable = true) {
  let current = initial;
  const store = {
    read: vi.fn(async () => current),
    claimRefresh: vi.fn(async () => claimable),
    saveRefreshed: vi.fn(async (t: MlTokens) => {
      current = { ...current!, access_token_enc: sealToken(t.accessToken), expires_at: t.expiresAt.toISOString() };
    }),
    releaseRefresh: vi.fn(async () => {}),
    set: (r: ConnectionRow) => (current = r),
  };
  return store satisfies ConnectionStore & { set: unknown };
}
const opts = { now: () => NOW, wait: async () => {} };

describe('token de acesso do ML', () => {
  test('token ainda válido é devolvido sem renovar', async () => {
    const store = memoryStore(row(60));
    const refresh = vi.fn();
    await expect(getAccessTokenWith(store, refresh, opts)).resolves.toBe('AT');
    expect(refresh).not.toHaveBeenCalled();
  });

  test('perto de vencer: renova com o refresh token e guarda o novo', async () => {
    const store = memoryStore(row(2));
    const refresh = vi.fn(async () => fresh);
    await expect(getAccessTokenWith(store, refresh, opts)).resolves.toBe('AT2');
    expect(refresh).toHaveBeenCalledWith('RT');
    expect(store.saveRefreshed).toHaveBeenCalledWith(fresh);
  });

  test('outro servidor já renovando: espera e usa o token novo, sem gastar o refresh token', async () => {
    const store = memoryStore(row(2), false);
    const refresh = vi.fn();
    const wait = vi.fn(async () => void store.set(row(360)));
    await expect(getAccessTokenWith(store, refresh, { now: () => NOW, wait })).resolves.toBe('AT');
    expect(refresh).not.toHaveBeenCalled();
    expect(wait).toHaveBeenCalledTimes(1);
  });

  test('falha na renovação libera a vez e repassa o erro', async () => {
    const store = memoryStore(row(-10));
    const refresh = vi.fn(async () => {
      throw new Error('O Mercado Livre recusou o token: invalid_grant');
    });
    await expect(getAccessTokenWith(store, refresh, opts)).rejects.toThrow(/invalid_grant/);
    expect(store.releaseRefresh).toHaveBeenCalled();
  });

  test('sem conta conectada avisa claramente', async () => {
    await expect(getAccessTokenWith(memoryStore(null), vi.fn(), opts)).rejects.toBeInstanceOf(MlNotConnectedError);
  });
});
