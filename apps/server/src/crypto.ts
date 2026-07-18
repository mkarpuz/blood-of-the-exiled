import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function encryptText(plainText: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', config.contentEncryptionKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${nonce.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptText(value: string): string {
  const [version, nonceValue, tagValue, encryptedValue] = value.split('.');
  if (version !== 'v1' || !nonceValue || !tagValue || !encryptedValue) {
    throw new Error('Encrypted content has an invalid envelope');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    config.contentEncryptionKey,
    Buffer.from(nonceValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function encryptJson(value: unknown): string {
  return encryptText(JSON.stringify(value));
}

export function decryptJson<T>(value: string): T {
  return JSON.parse(decryptText(value)) as T;
}
