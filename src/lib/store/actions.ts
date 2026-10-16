'use server';

import { revalidatePath } from 'next/cache';
import type { StoreAsset } from '@/lib/kit/store';
import { getSupabaseServer, requireAdmin } from '@/lib/supabase/server';
import { saveStoreAssetWith } from './assets';

export async function saveStoreAsset(slot: 0 | 1, file: File): Promise<void> {
  const sb = await getSupabaseServer();
  await saveStoreAssetWith(
    {
      requireAdmin: async () => void (await requireAdmin()),
      async upload(path, bytes, mime) {
        const { error } = await sb.storage.from('store').upload(path, bytes, { contentType: mime, upsert: false });
        if (error) throw new Error(`Não foi possível gravar a arte da loja: ${error.message}`);
      },
      async upsert(s, path) {
        const { error } = await sb.from('store_assets').upsert({ slot: s, storage_path: path });
        if (error) throw new Error(`Não foi possível salvar a arte da loja: ${error.message}`);
      },
    },
    slot,
    file,
  );
  revalidatePath('/configuracoes/loja');
}

export async function getStoreAssets(): Promise<[StoreAsset | null, StoreAsset | null]> {
  const sb = await getSupabaseServer();
  const { data, error } = await sb.from('store_assets').select('slot, storage_path');
  if (error) throw new Error('Não foi possível ler as artes da loja.');
  const find = (slot: 0 | 1) => (data ?? []).find((a) => a.slot === slot) ?? null;
  return [find(0), find(1)];
}

/** Ação de formulário da tela de configurações: devolve a mensagem de erro, ou null se deu certo. */
export async function saveStoreAssetForm(_prev: string | null, formData: FormData): Promise<string | null> {
  const slot = Number(formData.get('slot'));
  const file = formData.get('file');
  if ((slot !== 0 && slot !== 1) || !(file instanceof File) || file.size === 0) return 'Escolha uma imagem para enviar.';
  try {
    await saveStoreAsset(slot, file);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Não foi possível salvar a arte.';
  }
}
