export type PhotoStatus = 'pending' | 'generating' | 'done' | 'failed';

/**
 * A foto tem imagem utilizável para mostrar e baixar? Uma refação que falhou mantém a foto
 * anterior, então `failed` com imagem ainda conta; `failed` sem imagem (nunca gerou) não.
 */
export function isReadyForDownload(status: PhotoStatus, hasImage: boolean): boolean {
  return status === 'done' || (status === 'failed' && hasImage);
}
