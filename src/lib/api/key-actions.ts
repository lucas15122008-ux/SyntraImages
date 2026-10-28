'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin, requireAdmin } from '@/lib/supabase/server';
import { newApiKey } from './keys';

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const NAME_MAX = 60;

/** Chaves do administrador logado, mais novas primeiro. */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const user = await requireAdmin();
  const { data, error } = await getSupabaseAdmin()
    .from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Não foi possível ler as chaves da API. A migração 0008 já rodou no Supabase?');
  return data ?? [];
}

/** Cria uma chave e devolve o valor completo. É a única vez que ele aparece. */
export async function createApiKey(name: string): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'Dê um nome para a chave (por exemplo, "Claude").' };
  if (clean.length > NAME_MAX) return { ok: false, error: `O nome pode ter no máximo ${NAME_MAX} caracteres.` };
  const { key, hash, prefix } = newApiKey();
  const { error } = await getSupabaseAdmin().from('api_keys').insert({ name: clean, user_id: user.id, key_hash: hash, key_prefix: prefix });
  if (error) return { ok: false, error: 'Não foi possível criar a chave. A migração 0008 já rodou no Supabase?' };
  revalidatePath('/configuracoes/api');
  return { ok: true, key };
}

/** Desliga a chave na hora. Não tem volta: para voltar a usar, crie outra. */
export async function revokeApiKey(id: string): Promise<void> {
  const user = await requireAdmin();
  const { error } = await getSupabaseAdmin()
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('revoked_at', null);
  if (error) throw new Error('Não foi possível revogar a chave.');
  revalidatePath('/configuracoes/api');
}
