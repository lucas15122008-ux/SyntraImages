import 'server-only';
import { NextResponse } from 'next/server';
import { getKitStoreForUser, type KitStore } from '@/lib/kit/store';
import { ApiInputError } from './kits';
import { authenticate, type ApiCaller } from './keys';

export type ApiContext = { caller: ApiCaller; store: KitStore; origin: string };

/** Endereço público do app, para os links "abrir no app". */
export function appOrigin(req: Request): string {
  return process.env.APP_URL?.replace(/\/$/, '') || new URL(req.url).origin;
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ erro: message }, { status });
}

/** Confere a chave e traduz os erros: pedido errado 400, teto diário 429, o resto 500. */
export async function withApiKey(req: Request, handler: (ctx: ApiContext) => Promise<Response>): Promise<Response> {
  let caller: ApiCaller | null;
  try {
    caller = await authenticate(req);
  } catch {
    return apiError('Não foi possível conferir a chave da API agora. Tente de novo.', 503);
  }
  if (!caller) return apiError('Chave da API ausente, inválida ou revogada. Mande em "Authorization: Bearer syn_...".', 401);
  try {
    return await handler({ caller, store: getKitStoreForUser(caller.userId), origin: appOrigin(req) });
  } catch (e) {
    if (e instanceof ApiInputError) return apiError(e.message, /não encontrado/i.test(e.message) ? 404 : 400);
    const message = e instanceof Error ? e.message : 'Erro inesperado.';
    if (/limite diário/i.test(message)) return apiError(message, 429);
    console.error('API de fotos:', e);
    return apiError('Erro inesperado no servidor.', 500);
  }
}
