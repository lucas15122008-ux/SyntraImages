import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

function key(): Buffer {
  const secret = process.env.ML_TOKEN_KEY;
  if (!secret || secret.length < 32) throw new Error('Variável de ambiente ausente ou curta demais: ML_TOKEN_KEY (mínimo 32 caracteres)');
  return createHash('sha256').update(secret).digest();
}

/** Criptografa um token do ML (AES-256-GCM) para guardar no banco. */
export function sealToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function openToken(sealed: string): string {
  const [prefix, iv, tag, data] = sealed.split('.');
  if (prefix !== PREFIX || !iv || !tag || !data) throw new Error('Token do Mercado Livre em formato desconhecido.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
