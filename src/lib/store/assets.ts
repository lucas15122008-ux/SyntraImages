import { IMAGE_EXT, readImage } from '@/lib/kit/image';

export type AssetBackend = {
  requireAdmin(): Promise<void>;
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  upsert(slot: 0 | 1, path: string): Promise<void>;
};

/**
 * Grava (ou substitui) uma das duas artes fixas da loja. O arquivo antigo fica no
 * storage: kits já criados guardam o caminho dele nas suas fotos fixas.
 */
export async function saveStoreAssetWith(backend: AssetBackend, slot: 0 | 1, file: File): Promise<void> {
  await backend.requireAdmin();
  if (slot !== 0 && slot !== 1) throw new Error('Posição da arte da loja inválida (use 0 ou 1).');
  const { bytes, mime } = await readImage(file, 'arte da loja');
  const path = `store-${slot}-${Date.now()}.${IMAGE_EXT[mime]}`;
  await backend.upload(path, bytes, mime);
  await backend.upsert(slot, path);
}
