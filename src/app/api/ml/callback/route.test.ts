import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const requireAdmin = vi.fn();
const saveConnection = vi.fn();
const exchangeCode = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ requireAdmin: () => requireAdmin() }));
vi.mock('@/lib/ml/connection', () => ({ saveConnection: (...a: unknown[]) => saveConnection(...a) }));
vi.mock('@/lib/ml/oauth', async (orig) => ({ ...(await orig<object>()), exchangeCode: (...a: unknown[]) => exchangeCode(...a) }));

import { GET } from './route';

const tokens = { accessToken: 'AT', refreshToken: 'RT', expiresAt: new Date(), userId: 42, scope: null };

function call(qs: string, cookie?: string) {
  const headers = new Headers(cookie ? { cookie: `ml_oauth=${cookie}` } : {});
  const req = new Request(`https://syntra.test/api/ml/callback?${qs}`, { headers });
  // NextRequest expõe cookies; aqui basta o mínimo que a rota usa.
  Object.assign(req, { cookies: { get: (n: string) => (n === 'ml_oauth' && cookie ? { value: cookie } : undefined) } });
  return GET(req as never);
}
const dest = (res: Response) => new URL(res.headers.get('location')!);

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ id: 'admin-id' });
  saveConnection.mockReset().mockResolvedValue(undefined);
  exchangeCode.mockReset().mockResolvedValue(tokens);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ nickname: 'JR LOJA' }))));
});
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/ml/callback', () => {
  test('state confere: troca o código, guarda a conta e apaga o cookie', async () => {
    const res = await call('code=TG-1&state=abc', 'abc.verif');
    expect(exchangeCode).toHaveBeenCalledWith({ code: 'TG-1', verifier: 'verif', redirectUri: 'https://syntra.test/api/ml/callback' });
    expect(saveConnection).toHaveBeenCalledWith(tokens, 'JR LOJA', 'admin-id');
    expect(dest(res).pathname).toBe('/configuracoes/mercado-livre');
    expect(dest(res).searchParams.get('ok')).toBe('1');
    expect(res.headers.get('set-cookie')).toMatch(/ml_oauth=;.*Max-Age=0/i);
  });

  test('state diferente ou sem cookie não troca o código', async () => {
    for (const [qs, cookie] of [
      ['code=TG-1&state=outro', 'abc.verif'],
      ['code=TG-1&state=abc', undefined],
      ['state=abc', 'abc.verif'],
    ] as const) {
      const res = await call(qs, cookie);
      expect(dest(res).searchParams.get('erro')).toBe('sessao');
    }
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  test('quem não é admin não conecta', async () => {
    requireAdmin.mockRejectedValue(new Error('Apenas o administrador pode fazer isso.'));
    const res = await call('code=TG-1&state=abc', 'abc.verif');
    expect(dest(res).searchParams.get('erro')).toBe('admin');
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  test('usuário negou no ML ou o ML recusou o código', async () => {
    expect(dest(await call('error=access_denied&state=abc', 'abc.verif')).searchParams.get('erro')).toBe('negado');
    exchangeCode.mockRejectedValue(new Error('O Mercado Livre recusou o token: invalid_grant'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(dest(await call('code=TG-1&state=abc', 'abc.verif')).searchParams.get('erro')).toBe('token');
    expect(saveConnection).not.toHaveBeenCalled();
  });
});
