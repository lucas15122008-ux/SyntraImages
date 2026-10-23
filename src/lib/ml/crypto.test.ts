import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { openToken, sealToken } from './crypto';

beforeEach(() => vi.stubEnv('ML_TOKEN_KEY', 'k'.repeat(40)));
afterEach(() => vi.unstubAllEnvs());

describe('tokens criptografados', () => {
  test('ida e volta devolve o mesmo token, sem o texto aparecer no banco', () => {
    const sealed = sealToken('APP_USR-123-segredo');
    expect(sealed).not.toContain('segredo');
    expect(openToken(sealed)).toBe('APP_USR-123-segredo');
    expect(sealToken('APP_USR-123-segredo')).not.toBe(sealed);
  });

  test('chave diferente ou dado adulterado não abre', () => {
    const sealed = sealToken('abc');
    vi.stubEnv('ML_TOKEN_KEY', 'z'.repeat(40));
    expect(() => openToken(sealed)).toThrow();
    vi.stubEnv('ML_TOKEN_KEY', 'k'.repeat(40));
    const parts = sealed.split('.');
    parts[3] = Buffer.from('xyz').toString('base64url');
    expect(() => openToken(parts.join('.'))).toThrow();
  });

  test('sem chave (ou curta demais) recusa', () => {
    vi.stubEnv('ML_TOKEN_KEY', 'curta');
    expect(() => sealToken('abc')).toThrow(/ML_TOKEN_KEY/);
  });
});
