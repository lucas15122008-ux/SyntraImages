import JSZip from 'jszip';

export type ZipPhoto = { position: number; name: string; bytes: Uint8Array; ext?: string };

/** Nome seguro para arquivo: sem acentos, minúsculo, só letras, números e hífens. */
export function slugName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'foto';
}

/** Monta o zip do kit: arquivos `NN-nome.jpg`, na ordem das posições. */
export async function buildZip(photos: ZipPhoto[]): Promise<Uint8Array> {
  const sorted = [...photos].sort((a, b) => a.position - b.position);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].position === sorted[i - 1].position) throw new Error(`Há duas fotos na posição ${sorted[i].position}.`);
  }
  const zip = new JSZip();
  for (const p of sorted) {
    const ext = (p.ext ?? 'jpg').toLowerCase();
    const base = slugName(p.name.replace(/\.(jpe?g|png|webp)$/i, ''));
    zip.file(`${String(p.position).padStart(2, '0')}-${base}.${ext}`, p.bytes);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}
