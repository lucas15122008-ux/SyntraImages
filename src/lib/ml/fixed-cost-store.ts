import 'server-only';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { FixedCost } from './store-profit';

/** Custos fixos da loja, do mais antigo ao mais novo. null quando a tabela ainda não existe (migração 0009 não rodou). */
export async function readFixedCosts(): Promise<FixedCost[] | null> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.from('fixed_costs').select('id, description, monthly_amount, since, until').order('since').order('created_at');
  if (error) {
    console.error('[lucro] custos fixos', error.message);
    return null;
  }
  return (data ?? []).map((r) => ({ id: r.id, description: r.description, monthly: Number(r.monthly_amount), since: r.since, until: r.until }));
}
