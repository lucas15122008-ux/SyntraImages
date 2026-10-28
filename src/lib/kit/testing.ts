// Só para testes: uma loja falsa em memória e bytes mínimos de cada formato de imagem.
import type { KitRow, KitStore, PhotoRow, StoreAsset } from './store';

// ───────── Loja falsa em memória (reproduz a regra de reivindicação atômica) ─────────
export function fakeStore(over: { assets?: [StoreAsset | null, StoreAsset | null]; failInsertPhotos?: boolean; failLog?: boolean } = {}) {
  const files = new Map<string, Uint8Array>();
  const kits = new Map<string, KitRow>();
  let photos: PhotoRow[] = [];
  const log: Array<{ kitId: string; position: number }> = [];
  const writes: string[] = [];
  let logToday = 0;
  const store: KitStore = {
    currentUserId: async () => 'user-1',
    getStoreAssets: async () =>
      over.assets ?? [
        { slot: 0, storage_path: 'loja-0.jpg' },
        { slot: 1, storage_path: 'loja-1.jpg' },
      ],
    putFile: async (bucket, path, bytes) => {
      writes.push(`put:${bucket}/${path}`);
      files.set(`${bucket}/${path}`, bytes);
    },
    getFile: async (bucket, path) => {
      const f = files.get(`${bucket}/${path}`);
      if (!f) throw new Error(`arquivo ausente ${bucket}/${path}`);
      return f;
    },
    removeFile: async (bucket, path) => {
      writes.push(`rm:${bucket}/${path}`);
      files.delete(`${bucket}/${path}`);
    },
    insertKit: async (row) => {
      writes.push('insertKit');
      kits.set(row.id, { ...row, owner: 'user-1' });
    },
    insertPhotos: async (rows) => {
      writes.push('insertPhotos');
      if (over.failInsertPhotos) throw new Error('falha ao inserir fotos');
      photos.push(...rows.map((r, i) => ({ ...r, id: `p${photos.length + i + 1}` })));
    },
    deleteKit: async (id) => {
      writes.push('deleteKit');
      kits.delete(id);
      photos = photos.filter((p) => p.kit_id !== id);
    },
    getKit: async (id) => kits.get(id) ?? null,
    getPhoto: async (kitId, position) => {
      const p = photos.find((x) => x.kit_id === kitId && x.position === position);
      return p ? { ...p } : null; // cópia, como o banco real
    },
    listPhotos: async (kitId) => photos.filter((p) => p.kit_id === kitId).sort((a, b) => a.position - b.position).map((p) => ({ ...p })),
    listKits: async () => [...kits.values()],
    signedUrl: async (bucket, path) => `https://arquivos.test/${bucket}/${path}`,
    claimPhoto: async (kitId, position, staleBefore) => {
      const p = photos.find((x) => x.kit_id === kitId && x.position === position);
      if (!p) return null;
      const stale = p.status === 'generating' && !!p.generating_since && p.generating_since < staleBefore;
      if (p.status === 'generating' && !stale) return null;
      p.status = 'generating';
      p.generating_since = new Date();
      p.attempts += 1;
      p.error = null;
      return { ...p };
    },
    countGenerationsSince: async () => logToday + log.length,
    logGeneration: async (kitId, position) => {
      if (over.failLog) throw new Error('falha ao registrar');
      log.push({ kitId, position });
    },
    updatePhoto: async (id, patch) => {
      Object.assign(photos.find((p) => p.id === id)!, patch);
    },
  };
  return { store, files, kits, photos: () => photos, log, writes, setLogToday: (n: number) => (logToday = n) };
}

export const jpegBytes = (n = 20) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(7)]);
export const pngBytes = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
export const webpBytes = () => new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]);
export const file = (bytes: Uint8Array, type: string, name = 'foto') => new File([bytes as BlobPart], name, { type });

