import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { buildZip, slugName } from './zip';

const bytes = (...n: number[]) => new Uint8Array(n);

async function names(zipBytes: Uint8Array) {
  const zip = await JSZip.loadAsync(zipBytes);
  return Object.keys(zip.files);
}

describe('slugName', () => {
  test('tira acentos, espaços e símbolos', () => {
    expect(slugName('Bomba de óleo — Ângulo de trás!')).toBe('bomba-de-oleo-angulo-de-tras');
    expect(slugName('  Pastilha   de freio  ')).toBe('pastilha-de-freio');
    expect(slugName('Ação/ção ñ ü')).toBe('acao-cao-n-u');
  });
  test('nome vazio ou só símbolos vira "foto"', () => {
    expect(slugName('')).toBe('foto');
    expect(slugName('???')).toBe('foto');
  });
});

describe('buildZip', () => {
  test('ordena por posição, com posições de dois dígitos e nomes sem acento', async () => {
    const zip = await buildZip([
      { position: 10, name: 'Loja garantia', bytes: bytes(10) },
      { position: 2, name: 'Frente fundo branco', bytes: bytes(2) },
      { position: 1, name: 'Capa com carro', bytes: bytes(1) },
    ]);
    expect(await names(zip)).toEqual(['01-capa-com-carro.jpg', '02-frente-fundo-branco.jpg', '10-loja-garantia.jpg']);
  });

  test('normaliza acentos e espaços do nome do arquivo', async () => {
    const zip = await buildZip([{ position: 3, name: 'Bomba de óleo / Ângulo de trás', bytes: bytes(3) }]);
    expect(await names(zip)).toEqual(['03-bomba-de-oleo-angulo-de-tras.jpg']);
  });

  test('guarda o conteúdo de cada arquivo', async () => {
    const zip = await buildZip([
      { position: 2, name: 'b', bytes: bytes(2, 2, 2) },
      { position: 1, name: 'a', bytes: bytes(1, 1) },
    ]);
    const loaded = await JSZip.loadAsync(zip);
    expect(Array.from(await loaded.file('01-a.jpg')!.async('uint8array'))).toEqual([1, 1]);
    expect(Array.from(await loaded.file('02-b.jpg')!.async('uint8array'))).toEqual([2, 2, 2]);
  });

  test('usa a extensão informada (arte da loja pode ser PNG)', async () => {
    const zip = await buildZip([
      { position: 1, name: 'capa', bytes: bytes(1) },
      { position: 2, name: 'loja', bytes: bytes(2), ext: 'png' },
    ]);
    expect(await names(zip)).toEqual(['01-capa.jpg', '02-loja.png']);
  });

  test('nome vazio vira "foto" e extensão já no nome não duplica', async () => {
    const zip = await buildZip([
      { position: 1, name: '', bytes: bytes(1) },
      { position: 2, name: 'frente.jpg', bytes: bytes(2) },
    ]);
    expect(await names(zip)).toEqual(['01-foto.jpg', '02-frente.jpg']);
  });

  test('três dígitos se o kit passar de 99 (não acontece, mas não quebra)', async () => {
    const zip = await buildZip([{ position: 100, name: 'x', bytes: bytes(1) }]);
    expect(await names(zip)).toEqual(['100-x.jpg']);
  });

  test('duas fotos na mesma posição é erro', async () => {
    await expect(buildZip([{ position: 1, name: 'a', bytes: bytes(1) }, { position: 1, name: 'b', bytes: bytes(2) }])).rejects.toThrow(/posição/i);
  });
});
