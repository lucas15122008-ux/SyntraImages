import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { saveConnection } from '@/lib/ml/connection';
import { ML_OAUTH_COOKIE, ML_OAUTH_COOKIE_OPTIONS, SETTINGS_PATH } from '@/lib/ml/cookie';
import { ML_API, exchangeCode, redirectUri } from '@/lib/ml/oauth';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Volta do login no Mercado Livre: confere o state, troca o código por tokens e guarda no servidor. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const finish = (query: string) => {
    const res = NextResponse.redirect(new URL(`${SETTINGS_PATH}?${query}`, origin));
    res.cookies.set(ML_OAUTH_COOKIE, '', { ...ML_OAUTH_COOKIE_OPTIONS, maxAge: 0 });
    return res;
  };

  let userId: string;
  try {
    userId = (await requireAdmin()).id;
  } catch {
    return finish('erro=admin');
  }

  if (searchParams.get('error')) return finish('erro=negado');
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const [savedState, verifier] = (request.cookies.get(ML_OAUTH_COOKIE)?.value ?? '').split('.');
  if (!code || !state || !savedState || !verifier || !same(state, savedState)) return finish('erro=sessao');

  try {
    const tokens = await exchangeCode({ code, verifier, redirectUri: redirectUri(origin) });
    const me = await fetch(`${ML_API}/users/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` }, cache: 'no-store' });
    const nickname = me.ok ? (((await me.json()) as { nickname?: string }).nickname ?? null) : null;
    await saveConnection(tokens, nickname, userId);
  } catch (e) {
    console.error('[ml] callback', e instanceof Error ? e.message : e);
    return finish('erro=token');
  }
  return finish('ok=1');
}
