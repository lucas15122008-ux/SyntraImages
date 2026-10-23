import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/supabase/server';
import { ML_OAUTH_COOKIE, ML_OAUTH_COOKIE_OPTIONS, SETTINGS_PATH } from '@/lib/ml/cookie';
import { authorizationUrl, mlCredentials, newAuthRequest, redirectUri } from '@/lib/ml/oauth';

/** Leva o administrador ao login do Mercado Livre para autorizar o app da loja. */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const back = (erro: string) => NextResponse.redirect(new URL(`${SETTINGS_PATH}?erro=${erro}`, origin));

  try {
    await requireAdmin();
  } catch {
    return back('admin');
  }
  let clientId: string;
  try {
    ({ clientId } = mlCredentials());
  } catch {
    return back('config');
  }

  const { state, verifier, challenge } = newAuthRequest();
  const res = NextResponse.redirect(authorizationUrl({ clientId, redirectUri: redirectUri(origin), state, challenge }));
  res.cookies.set(ML_OAUTH_COOKIE, `${state}.${verifier}`, ML_OAUTH_COOKIE_OPTIONS);
  return res;
}
