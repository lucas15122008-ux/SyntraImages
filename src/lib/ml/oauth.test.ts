import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { authorizationUrl, exchangeCode, newAuthRequest, redirectUri, refreshTokens } from './oauth';

beforeEach(() => {
  vi.stubEnv('ML_CLIENT_ID', 'cid');
  vi.stubEnv('ML_CLIENT_SECRET', 'csecret');
  vi.stubEnv('ML_REDIRECT_URI', '');
});
afterEach(() => vi.unstubAllEnvs());

const okFetch = (body: object, status = 200) =>
  vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe('login no Mercado Livre', () => {
  test('URL de autorização leva client id, retorno, state e PKCE S256', () => {
    const { state, verifier, challenge } = newAuthRequest();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    const url = new URL(authorizationUrl({ clientId: 'cid', redirectUri: 'https://syntra.test/api/ml/callback', state, challenge }));
    expect(url.origin).toBe('https://auth.mercadolivre.com.br');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'cid',
      redirect_uri: 'https://syntra.test/api/ml/callback',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
  });

  test('URL de retorno usa ML_REDIRECT_URI quando definida', () => {
    expect(redirectUri('https://syntra.test')).toBe('https://syntra.test/api/ml/callback');
    vi.stubEnv('ML_REDIRECT_URI', 'https://outro.test/api/ml/callback');
    expect(redirectUri('https://syntra.test')).toBe('https://outro.test/api/ml/callback');
  });

  test('troca o código por tokens com o verificador PKCE', async () => {
    const f = okFetch({ access_token: 'AT', refresh_token: 'RT', expires_in: 21600, user_id: 42, scope: 'read offline_access' });
    const now = new Date('2026-10-23T12:00:00Z');
    const tokens = await exchangeCode({ code: 'TG-1', verifier: 'v', redirectUri: 'https://syntra.test/api/ml/callback' }, f, now);
    expect(tokens).toEqual({
      accessToken: 'AT',
      refreshToken: 'RT',
      expiresAt: new Date('2026-10-23T18:00:00Z'),
      userId: 42,
      scope: 'read offline_access',
    });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.mercadolibre.com/oauth/token');
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      grant_type: 'authorization_code',
      client_id: 'cid',
      client_secret: 'csecret',
      code: 'TG-1',
      redirect_uri: 'https://syntra.test/api/ml/callback',
      code_verifier: 'v',
    });
  });

  test('renovação manda o refresh token', async () => {
    const f = okFetch({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 60, user_id: 42 });
    const tokens = await refreshTokens('RT', f);
    expect(tokens.refreshToken).toBe('RT2');
    const [, init] = f.mock.calls[0] as [string, RequestInit];
    expect((init.body as URLSearchParams).get('grant_type')).toBe('refresh_token');
    expect((init.body as URLSearchParams).get('refresh_token')).toBe('RT');
  });

  test('erro do ML vira mensagem legível', async () => {
    const f = okFetch({ message: 'invalid_grant', error: 'invalid_grant' }, 400);
    await expect(refreshTokens('RT', f)).rejects.toThrow(/recusou o token: invalid_grant/);
  });

  test('sem client id/secret não chama o ML', async () => {
    vi.stubEnv('ML_CLIENT_SECRET', '');
    const f = okFetch({});
    await expect(refreshTokens('RT', f)).rejects.toThrow(/ML_CLIENT_ID/);
    expect(f).not.toHaveBeenCalled();
  });
});
