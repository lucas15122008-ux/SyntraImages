import { describe, expect, test } from 'vitest';
import { isReadyForDownload } from './download';

describe('isReadyForDownload', () => {
  test('foto pronta entra', () => expect(isReadyForDownload('done', true)).toBe(true));
  test('refação que falhou mas ainda tem a foto anterior entra', () => expect(isReadyForDownload('failed', true)).toBe(true));
  test('falha sem nenhuma imagem bloqueia', () => expect(isReadyForDownload('failed', false)).toBe(false));
  test('pendente e gerando bloqueiam, mesmo com imagem anterior', () => {
    expect(isReadyForDownload('pending', false)).toBe(false);
    expect(isReadyForDownload('generating', true)).toBe(false);
  });
});
