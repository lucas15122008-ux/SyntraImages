const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
/** Funções serverless da Vercel recusam corpo acima de ~4,5 MB; fotos grandes são reduzidas antes de subir. */
const SHRINK_ABOVE_BYTES = 3_000_000;
const MAX_SIDE = 2048;

export function isAllowedImage(file: File): boolean {
  return ALLOWED.includes(file.type);
}

/** Reduz fotos grandes (lado maior 2048 px, JPEG) no navegador. Fotos pequenas passam direto. */
export async function prepareImage(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível reduzir a imagem neste navegador.');
  // Fundo branco: PNG com transparência viraria preto em JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Não foi possível reduzir a imagem neste navegador.');
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
