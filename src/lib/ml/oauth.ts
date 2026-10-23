import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

export const ML_AUTH_URL = 'https://auth.mercadolivre.com.br/authorization';
export const ML_API = 'https://api.mercadolibre.com';

export type MlTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userId: number;
  scope: string | null;
};

type Fetch = typeof fetch;

export function mlCredentials() {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Configure ML_CLIENT_ID e ML_CLIENT_SECRET para conectar o Mercado Livre.');
  return { clientId, clientSecret };
}

/** URL de retorno cadastrada no app do DevCenter. ML_REDIRECT_URI vence; senão usa o domínio atual. */
export function redirectUri(origin: string): string {
  return process.env.ML_REDIRECT_URI || `${origin}/api/ml/callback`;
}

/** state contra CSRF e verificador PKCE, guardados num cookie httpOnly durante o login. */
export function newAuthRequest() {
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { state, verifier, challenge };
}

export function authorizationUrl(opts: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(ML_AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('state', opts.state);
  url.searchParams.set('code_challenge', opts.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

async function tokenRequest(body: Record<string, string>, fetchImpl: Fetch, now: Date): Promise<MlTokens> {
  const res = await fetchImpl(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== 'string' || typeof json.refresh_token !== 'string') {
    const reason = typeof json.message === 'string' ? json.message : typeof json.error === 'string' ? json.error : `HTTP ${res.status}`;
    throw new Error(`O Mercado Livre recusou o token: ${reason}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(now.getTime() + Number(json.expires_in ?? 21600) * 1000),
    userId: Number(json.user_id),
    scope: typeof json.scope === 'string' ? json.scope : null,
  };
}

export async function exchangeCode(
  opts: { code: string; verifier: string; redirectUri: string },
  fetchImpl: Fetch = fetch,
  now = new Date(),
): Promise<MlTokens> {
  const { clientId, clientSecret } = mlCredentials();
  return tokenRequest(
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.verifier,
    },
    fetchImpl,
    now,
  );
}

/** O refresh token do ML só vale uma vez: guarde sempre o novo que vier. */
export async function refreshTokens(refreshToken: string, fetchImpl: Fetch = fetch, now = new Date()): Promise<MlTokens> {
  const { clientId, clientSecret } = mlCredentials();
  return tokenRequest(
    { grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken },
    fetchImpl,
    now,
  );
}
