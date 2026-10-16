import { beforeEach, describe, expect, test, vi } from 'vitest';

const verifyOtp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({ auth: { verifyOtp } }),
}));

import { GET } from './route';

const call = (qs: string) => GET(new Request(`https://syntra.test/auth/confirm?${qs}`) as never);

beforeEach(() => verifyOtp.mockReset().mockResolvedValue({ error: null }));

describe('GET /auth/confirm', () => {
  test('convite válido abre a sessão e leva a definir a senha', async () => {
    const res = await call('token_hash=abc&type=invite');
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'invite', token_hash: 'abc' });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/auth/definir-senha');
  });

  test('recuperação de senha também leva a definir a senha', async () => {
    const res = await call('token_hash=abc&type=recovery');
    expect(new URL(res.headers.get('location')!).pathname).toBe('/auth/definir-senha');
  });

  test('link inválido ou vencido volta ao login com aviso', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } });
    const res = await call('token_hash=abc&type=invite');
    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('erro')).toBe('convite');
  });

  test('sem token ou com tipo desconhecido não chama o Supabase', async () => {
    for (const qs of ['type=invite', 'token_hash=abc', 'token_hash=abc&type=magiclink-falso']) {
      const res = await call(qs);
      expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
