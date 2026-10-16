export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export const IMAGE_EXT: Record<ImageMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Descobre o formato pelos primeiros bytes; o tipo declarado pelo navegador não é confiável. */
export function sniffImageMime(b: Uint8Array): ImageMime | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  const tag = (from: number) => String.fromCharCode(...b.slice(from, from + 4));
  if (b.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WEBP') return 'image/webp';
  return null;
}

/** Valida tamanho e formato (JPEG, PNG ou WEBP, até 10 MB) e devolve os bytes. */
export async function readImage(file: File, label: string): Promise<{ bytes: Uint8Array; mime: ImageMime }> {
  if (file.size === 0) throw new Error(`O arquivo de ${label} está vazio.`);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`A ${label} passa de 10 MB. Reduza o tamanho e tente de novo.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) throw new Error(`A ${label} precisa ser uma imagem JPEG, PNG ou WEBP.`);
  return { bytes, mime };
}
