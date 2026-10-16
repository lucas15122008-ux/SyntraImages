const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIDE = 2048;
const QUALITIES = [0.9, 0.8, 0.7, 0.6];

/**
 * Funções serverless da Vercel recusam corpo acima de ~4,5 MB. Este é o orçamento para todas as
 * imagens de um envio (sobra folga para o resto do formulário); cada imagem recebe uma parte.
 */
export const SUBMIT_BUDGET_BYTES = 3_200_000;

export function submitBudget(imageCount: number): number {
  return Math.floor(SUBMIT_BUDGET_BYTES / Math.max(1, imageCount));
}

export function isAllowedImage(file: File): boolean {
  return ALLOWED.includes(file.type);
}

async function render(bitmap: ImageBitmap, scale: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível reduzir a imagem neste navegador.');
  // Fundo branco: PNG com transparência viraria preto em JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Não foi possível reduzir a imagem neste navegador.');
  return blob;
}

/** Reduz no navegador (JPEG, lado maior até 2048 px) imagens maiores que `maxBytes`; as menores passam direto. */
export async function prepareImage(file: File, maxBytes: number = SUBMIT_BUDGET_BYTES): Promise<File> {
  if (file.size <= maxBytes) return file;
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let blob: Blob | null = null;
  // Primeiro baixa a qualidade; se ainda passar do orçamento, reduz as dimensões.
  for (let round = 0; round < 4 && (!blob || blob.size > maxBytes); round++) {
    for (const q of QUALITIES) {
      blob = await render(bitmap, scale, q);
      if (blob.size <= maxBytes) break;
    }
    scale *= 0.75;
  }
  if (!blob || blob.size > maxBytes) throw new Error('Não foi possível reduzir a imagem o bastante para enviar. Use uma foto menor.');
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
