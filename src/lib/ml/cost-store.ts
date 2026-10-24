import 'server-only';
import { getSupabaseServer } from '@/lib/supabase/server';

/** Custos já salvos. null quando a tabela ainda não existe (migração 0004 não rodou). */
export async function readItemCosts(itemIds: string[]): Promise<Map<string, number> | null> {
  const out = new Map<string, number>();
  if (!itemIds.length) return out;
  const sb = await getSupabaseServer();
  const { data, error } = await sb.from('ml_item_costs').select('item_id, cost').in('item_id', itemIds);
  if (error) {
    console.error('[ml] custos', error.message);
    return null;
  }
  for (const r of data ?? []) out.set(r.item_id, Number(r.cost));
  return out;
}
