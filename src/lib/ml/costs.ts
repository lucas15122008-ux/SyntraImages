'use server';

import { getSupabaseServer, requireAdmin } from '@/lib/supabase/server';
import { getConnectionStatus, mlGet } from './connection';
import { fetchShipping } from './simulate';

/** Grava o custo de um anúncio. Devolve uma mensagem de erro, ou null se deu certo. */
export async function saveItemCost(itemId: string, cost: number): Promise<string | null> {
  const user = await requireAdmin();
  if (!/^MLB\d+$/.test(itemId) || !Number.isFinite(cost) || cost < 0) return 'Custo inválido.';
  const sb = await getSupabaseServer();
  const { error } = await sb
    .from('ml_item_costs')
    .upsert({ item_id: itemId, cost: Math.round(cost * 100) / 100, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) {
    console.error('[ml] custo', error.message);
    return 'Não foi possível salvar o custo.';
  }
  return null;
}

/** Frete que a loja pagaria num preço digitado na tela. */
export async function quoteShipping(itemId: string, price: number): Promise<number | null> {
  await requireAdmin();
  if (!/^MLB\d+$/.test(itemId) || !Number.isFinite(price) || price <= 0) return null;
  const connection = await getConnectionStatus();
  if (!connection) return null;
  return fetchShipping(connection.mlUserId, itemId, Math.round(price * 100) / 100, (path) => mlGet(path)).catch(() => null);
}
