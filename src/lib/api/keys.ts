import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/server';

const KEY_PREFIX = 'syn_';

/** Nova chave: `syn_` + 32 bytes aleatórios. Só o hash vai para o banco. */
export function newApiKey(): { key: string; hash: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(32).toString('base64url');
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 10) };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Lê a chave do pedido: `Authorization: Bearer`, `X-API-Key` ou `?key=` na URL. A URL é o
 * que permite usar o MCP como conector personalizado do Claude, que não manda cabeçalhos.
 */
export function readApiKey(req: Request): string | null {
  const auth = req.headers.get('authorization');
  const bearer = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const raw = bearer ?? req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('key');
  const key = raw?.trim();
  return key && key.startsWith(KEY_PREFIX) ? key : null;
}

export type ApiCaller = { keyId: string; userId: string };

export type KeyLookup = (hash: string) => Promise<{ id: string; user_id: string; revoked_at: string | null } | null>;

/** Confere a chave do pedido. null quando falta, não existe ou foi revogada. */
export async function authenticate(req: Request, deps: { lookup?: KeyLookup; touch?: (id: string) => Promise<void> } = {}): Promise<ApiCaller | null> {
  const key = readApiKey(req);
  if (!key) return null;
  const lookup = deps.lookup ?? lookupKey;
  const row = await lookup(hashApiKey(key));
  if (!row || row.revoked_at) return null;
  await (deps.touch ?? touchKey)(row.id).catch(() => {});
  return { keyId: row.id, userId: row.user_id };
}

async function lookupKey(hash: string) {
  const { data, error } = await getSupabaseAdmin().from('api_keys').select('id, user_id, revoked_at').eq('key_hash', hash).maybeSingle();
  if (error) throw new Error('Não foi possível conferir a chave da API.');
  return data;
}

async function touchKey(id: string) {
  await getSupabaseAdmin().from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', id);
}
