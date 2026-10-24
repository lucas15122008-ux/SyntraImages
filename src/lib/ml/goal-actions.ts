'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer, requireAdmin } from '@/lib/supabase/server';
import { monthKey, parseMoney } from './goal';

/** Meta do mês atual, ou null se ainda não foi definida. */
export async function getRevenueGoal(month = monthKey()): Promise<number | null> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.from('revenue_goals').select('amount').eq('month', month).maybeSingle();
  if (error) throw new Error('Não foi possível ler a meta do mês.');
  return data ? Number(data.amount) : null;
}

/** Ação do formulário da meta: devolve a mensagem de erro, ou null se deu certo. */
export async function saveRevenueGoalForm(_prev: string | null | undefined, formData: FormData): Promise<string | null> {
  const amount = parseMoney(String(formData.get('amount') ?? ''));
  if (amount === null) return 'Digite um valor em reais, por exemplo 50.000.';
  if (amount >= 10_000_000_000) return 'Valor alto demais.';
  try {
    const user = await requireAdmin();
    const sb = await getSupabaseServer();
    const { error } = await sb
      .from('revenue_goals')
      .upsert({ month: monthKey(), amount, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) return `Não foi possível salvar a meta: ${error.message}`;
  } catch (e) {
    return e instanceof Error ? e.message : 'Não foi possível salvar a meta.';
  }
  revalidatePath('/faturamento');
  return null;
}
