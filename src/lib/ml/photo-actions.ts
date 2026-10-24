'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer, requireAdmin, requireUser } from '@/lib/supabase/server';
import { getConnectionStatus } from './connection';
import { daysBetween, IMPACT_PATH, parseItemId } from './photo-impact';
import { deleteSwitch, fetchItems, insertSwitch } from './photo-switches';
import { brtDay } from './revenue';

export type MarkResult = { ok: true; title: string } | { ok: false; error: string };

/**
 * Registra que um anúncio passou a usar as fotos do Syntra num dia.
 * Com kit: quem fez o kit pode registrar. Sem kit (direto na tela Foto x venda): só o admin.
 */
export async function markPublished(input: { item: string; day: string; kitId?: string }): Promise<MarkResult> {
  const user = await requireUser();
  if (input.kitId) {
    // O RLS só devolve o kit para o dono.
    const { data: kit } = await (await getSupabaseServer()).from('kits').select('id').eq('id', input.kitId).maybeSingle();
    if (!kit) return { ok: false, error: 'Kit não encontrado.' };
  } else {
    await requireAdmin();
  }

  const parsed = parseItemId(input.item);
  if (!parsed.ok) return parsed;
  const today = brtDay(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || input.day > today) return { ok: false, error: 'Escolha o dia em que as fotos foram trocadas (hoje ou antes).' };
  if (daysBetween(input.day, today) > 365) return { ok: false, error: 'Só dá para comparar trocas do último ano.' };

  const connection = await getConnectionStatus();
  if (!connection) return { ok: false, error: 'A conta do Mercado Livre não está conectada. Peça ao administrador para conectar em Configurações.' };
  let item;
  try {
    item = (await fetchItems([parsed.itemId])).get(parsed.itemId);
  } catch (e) {
    console.error('[ml] foto x venda', e instanceof Error ? e.message : e);
    return { ok: false, error: 'Não foi possível conferir o anúncio no Mercado Livre agora. Tente de novo em instantes.' };
  }
  if (!item) return { ok: false, error: `Não encontrei o anúncio ${parsed.itemId} no Mercado Livre.` };
  if (item.sellerId !== connection.mlUserId) return { ok: false, error: `O anúncio ${parsed.itemId} não é da conta ${connection.nickname ?? 'conectada'}.` };

  const saved = await insertSwitch({ ml_item_id: parsed.itemId, switched_on: input.day, kit_id: input.kitId ?? null, created_by: user.id });
  if (saved === 'duplicate') return { ok: false, error: 'Essa troca já está registrada.' };
  revalidatePath(IMPACT_PATH);
  if (input.kitId) revalidatePath(`/kits/${input.kitId}`);
  return { ok: true, title: item.title };
}

export async function removeSwitch(id: string): Promise<void> {
  await requireAdmin();
  await deleteSwitch(id);
  revalidatePath(IMPACT_PATH);
}
