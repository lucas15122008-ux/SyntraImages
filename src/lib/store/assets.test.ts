import { describe, expect, test } from 'vitest';
import { saveStoreAssetWith, type AssetBackend } from './assets';

function backend(isAdmin: boolean) {
  const files = new Map<string, Uint8Array>();
  const rows = new Map<number, string>();
  const b: AssetBackend = {
    requireAdmin: async () => {
      if (!isAdmin) throw new Error('Apenas o administrador pode fazer isso.');
    },
    upload: async (path, bytes) => void files.set(path, bytes),
    upsert: async (slot, path) => void rows.set(slot, path),
  };
  return { b, files, rows };
}

const jpeg = (n = 8) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(1)])], 'loja.jpg', { type: 'image/jpeg' });

describe('saveStoreAssetWith', () => {
  test('membro comum não consegue gravar', async () => {
    const { b, files, rows } = backend(false);
    await expect(saveStoreAssetWith(b, 0, jpeg())).rejects.toThrow(/administrador/);
    expect(files.size).toBe(0);
    expect(rows.size).toBe(0);
  });

  test('admin grava a arte e ela fica na posição escolhida', async () => {
    const { b, files, rows } = backend(true);
    await saveStoreAssetWith(b, 1, jpeg());
    expect(rows.get(1)).toMatch(/^store-1-.+\.jpg$/);
    expect(files.has(rows.get(1)!)).toBe(true);
    expect(rows.has(0)).toBe(false);
  });

  test('admin substitui: a linha aponta para o arquivo novo e o antigo continua guardado', async () => {
    const { b, files, rows } = backend(true);
    await saveStoreAssetWith(b, 0, jpeg(8));
    const first = rows.get(0)!;
    await new Promise((r) => setTimeout(r, 2));
    await saveStoreAssetWith(b, 0, jpeg(30));
    expect(rows.get(0)).not.toBe(first);
    expect(files.has(first)).toBe(true);
    expect(files.get(rows.get(0)!)!.length).toBe(4 + 30);
  });

  test('posição fora de 0 e 1 é recusada', async () => {
    const { b } = backend(true);
    await expect(saveStoreAssetWith(b, 2 as 0, jpeg())).rejects.toThrow(/posição/i);
  });

  test('arquivo que não é imagem é recusado sem gravar', async () => {
    const { b, files, rows } = backend(true);
    const txt = new File([new TextEncoder().encode('oi')], 'a.jpg', { type: 'image/jpeg' });
    await expect(saveStoreAssetWith(b, 0, txt)).rejects.toThrow(/JPEG, PNG ou WEBP/);
    expect(files.size + rows.size).toBe(0);
  });
});
