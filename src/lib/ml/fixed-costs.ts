'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer, requireAdmin } from '@/lib/supabase/server';
import { brtDay } from './revenue';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Lança um custo fixo mensal. Devolve uma mensagem de erro, ou null se deu certo. */
export async function addFixedCost(input: { description: string; monthly: number; since: string }): Promise<string | null> {
  await requireAdmin();
  const description = input.description.trim();
  if (!description || description.length > 80) return 'Escreva uma descrição de até 80 letras.';
  if (!Number.isFinite(input.monthly) || input.monthly <= 0) return 'Informe um valor mensal maior que zero.';
  if (!DAY.test(input.since) || Number.isNaN(Date.parse(input.since))) return 'Escolha a data de início.';
  const sb = await getSupabaseServer();
  const { error } = await sb.from('fixed_costs').insert({ description, monthly_amount: Math.round(input.monthly * 100) / 100, since: input.since });
  if (error) {
    console.error('[lucro] lançar custo', error.message);
    return 'Não foi possível lançar o custo.';
  }
  revalidatePath('/lucro');
  return null;
}

/** Encerra um custo hoje: ele para de contar a partir de amanhã, e o histórico fica. */
export async function endFixedCost(id: string): Promise<string | null> {
  await requireAdmin();
  if (!UUID.test(id)) return 'Custo inválido.';
  const sb = await getSupabaseServer();
  const today = brtDay(new Date());
  const { data: row } = await sb.from('fixed_costs').select('since').eq('id', id).single();
  if (row && row.since > today) return 'Esse custo ainda não começou. Exclua em vez de encerrar.';
  const { error } = await sb.from('fixed_costs').update({ until: today }).eq('id', id);
  if (error) {
    console.error('[lucro] encerrar custo', error.message);
    return 'Não foi possível encerrar o custo.';
  }
  revalidatePath('/lucro');
  return null;
}

/** Apaga um custo lançado errado (some também dos períodos passados). */
export async function deleteFixedCost(id: string): Promise<string | null> {
  await requireAdmin();
  if (!UUID.test(id)) return 'Custo inválido.';
  const sb = await getSupabaseServer();
  const { error } = await sb.from('fixed_costs').delete().eq('id', id);
  if (error) {
    console.error('[lucro] excluir custo', error.message);
    return 'Não foi possível excluir o custo.';
  }
  revalidatePath('/lucro');
  return null;
}
