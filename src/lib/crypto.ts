import crypto from 'node:crypto';

const KEY = process.env.ENCRYPTION_MASTER_KEY
  ? Buffer.from(process.env.ENCRYPTION_MASTER_KEY, 'hex')
  : null;

export function encrypt(plaintext: string): string {
  if (!KEY) throw new Error('ENCRYPTION_MASTER_KEY not set');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  if (!KEY) throw new Error('ENCRYPTION_MASTER_KEY not set');
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc, undefined, 'utf8') + decipher.final('utf8');
}
