import sharp from 'sharp';

export type DownloadConfig = { size: number; format: 'jpg' | 'png' };

const DEFAULT_SIZE = 1600;
const MIN_SIZE = 600;
const MAX_SIZE = 3000;

/**
 * Padrão do zip: JPEG quadrado de 1600 px (o mesmo que o modelo gera). Configurável por
 * `DOWNLOAD_IMAGE_SIZE` (600 a 3000) e `DOWNLOAD_IMAGE_FORMAT` (jpg ou png).
 */
export function getDownloadConfig(env: Record<string, string | undefined> = process.env): DownloadConfig {
  const n = Number(env.DOWNLOAD_IMAGE_SIZE);
  const size = Number.isFinite(n) && env.DOWNLOAD_IMAGE_SIZE ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n))) : DEFAULT_SIZE;
  const f = (env.DOWNLOAD_IMAGE_FORMAT ?? '').toLowerCase();
  return { size, format: f === 'png' ? 'png' : 'jpg' };
}

/**
 * Deixa toda foto do kit com o mesmo tamanho e formato: quadrada, sem cortar (a arte da loja
 * pode ser retangular), com fundo branco. Quem já está no padrão passa sem reprocessar.
 */
export async function normalizeImage(bytes: Uint8Array, config: DownloadConfig): Promise<{ bytes: Uint8Array; ext: 'jpg' | 'png' }> {
  const meta = await sharp(bytes).metadata();
  const wanted = config.format === 'png' ? 'png' : 'jpeg';
  if (meta.width === config.size && meta.height === config.size && meta.format === wanted) {
    return { bytes, ext: config.format };
  }
  const pipeline = sharp(bytes)
    .rotate() // respeita a orientação EXIF
    .flatten({ background: '#ffffff' })
    .resize(config.size, config.size, { fit: 'contain', background: '#ffffff' });
  const out = config.format === 'png' ? await pipeline.png().toBuffer() : await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { bytes: new Uint8Array(out), ext: config.format };
}
