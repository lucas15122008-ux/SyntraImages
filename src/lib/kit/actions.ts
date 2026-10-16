'use server';

import { createKit } from './generate';
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
