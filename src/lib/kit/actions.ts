'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServer } from '@/lib/supabase/server';
import { createKit, deleteKitWithFiles } from './generate';
import type { KitConfig } from './types';

export type CreateKitResult = { ok: true; kitId: string } | { ok: false; error: string };

/** Recebe o formulário da tela "Montar o kit" (config em JSON, arquivos em campos próprios). */
export async function createKitAction(formData: FormData): Promise<CreateKitResult> {
  try {
    const original = formData.get('original');
    if (!(original instanceof File)) return { ok: false, error: 'Envie a foto do produto.' };
    const extra = formData.get('extraReference');
    const config = JSON.parse(String(formData.get('config') ?? '')) as KitConfig;
    const { kitId } = await createKit({
      productName: String(formData.get('productName') ?? ''),
      config,
      original,
      extraReference: extra instanceof File && extra.size > 0 ? extra : undefined,
    });
    return { ok: true, kitId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível criar o kit.' };
  }
}

/** Liga ou desliga o aviso de "ângulo pode não existir" em uma foto (qualquer foto pode ser marcada). */
export async function setPhotoWarning(kitId: string, position: number, on: boolean): Promise<void> {
  const sb = await getSupabaseServer();
  const patch = on ? { warn_missing_angle: true, warn_dismissed: false } : { warn_missing_angle: false, warn_dismissed: true };
  const { error } = await sb.from('kit_photos').update(patch).eq('kit_id', kitId).eq('position', position);
  if (error) throw new Error('Não foi possível atualizar o aviso da foto.');
}

export type DeleteKitResult = { ok: true } | { ok: false; error: string };

/** Exclui o kit da conta com todas as fotos e arquivos. */
export async function deleteKitAction(kitId: string): Promise<DeleteKitResult> {
  try {
    await deleteKitWithFiles(kitId);
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Não foi possível excluir o kit.' };
  }
}
