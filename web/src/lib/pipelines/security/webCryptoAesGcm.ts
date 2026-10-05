import type { ISessionCrypto } from './types';

const PBKDF2_SALT_BYTES = 16;
const GCM_IV_BYTES = 12;
const PBKDF2_ITERATIONS = 100_000;

function getCryptoSubtle(): SubtleCrypto | null {
  const g = globalThis as any;
  if (typeof g.window !== 'undefined' && g.window.crypto?.subtle) {
    return g.window.crypto.subtle;
  }
  return g.crypto?.subtle || null;
}

async function derivePbkdf2Key(
  subtle: SubtleCrypto,
  secret: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class WebCryptoAesGcm implements ISessionCrypto {
  public readonly algorithm = 'AES-GCM-256';
  private readonly defaultSecret: string;

  constructor(customKey?: string) {
    const envKey =
      typeof import.meta !== 'undefined'
        ? (import.meta as any).env?.VITE_SESSION_CRYPTO_KEY
        : undefined;
    this.defaultSecret = customKey || envKey || '';
  }

  public async encrypt(plainText: string, passcode?: string): Promise<string> {
    if (!plainText) return '';
    const secret = passcode || this.defaultSecret;
    if (!secret) {
      throw new Error(
        'Encryption unavailable: missing crypto secret key (passcode or VITE_SESSION_CRYPTO_KEY required)',
      );
    }

    const subtle = getCryptoSubtle();
    const g = globalThis as any;
    const cryptoObj = typeof g.window !== 'undefined' ? g.window.crypto : g.crypto;
    if (!subtle || !cryptoObj?.getRandomValues) {
      throw new Error('Encryption unavailable: WebCrypto not supported');
    }

    const salt = cryptoObj.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
    const iv = cryptoObj.getRandomValues(new Uint8Array(GCM_IV_BYTES));
    const key = await derivePbkdf2Key(subtle, secret, salt);

    const enc = new TextEncoder();
    const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plainText));
    const cipherBytes = new Uint8Array(cipherBuf);

    const combined = new Uint8Array(salt.length + iv.length + cipherBytes.length);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(cipherBytes, salt.length + iv.length);
    return this.uint8ToBase64(combined);
  }

  public async decrypt(cipherText: string, passcode?: string): Promise<string> {
    if (!cipherText) return '';
    const secret = passcode || this.defaultSecret;
    if (!secret) return '';

    const subtle = getCryptoSubtle();
    if (!subtle) return '';

    try {
      const combined = this.base64ToUint8(cipherText);

      // 1. 标准端云统一格式: [Salt 16B] + [IV 12B] + [Ciphertext + AuthTag]
      if (combined.length >= PBKDF2_SALT_BYTES + GCM_IV_BYTES + 16) {
        try {
          const salt = combined.slice(0, PBKDF2_SALT_BYTES);
          const iv = combined.slice(PBKDF2_SALT_BYTES, PBKDF2_SALT_BYTES + GCM_IV_BYTES);
          const data = combined.slice(PBKDF2_SALT_BYTES + GCM_IV_BYTES);
          const key = await derivePbkdf2Key(subtle, secret, salt);
          const decBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
          return new TextDecoder().decode(decBuf);
        } catch {}
      }

      // 2. 遗留格式平滑回退: [IV 12B] + [Ciphertext]
      return await this.decryptLegacy(subtle, combined, secret);
    } catch {
      return '';
    }
  }

  private async decryptLegacy(
    subtle: SubtleCrypto,
    bytes: Uint8Array,
    secret: string,
  ): Promise<string> {
    if (bytes.length <= GCM_IV_BYTES) return '';
    const enc = new TextEncoder();
    const iv = bytes.slice(0, GCM_IV_BYTES);
    const data = bytes.slice(GCM_IV_BYTES);

    try {
      const baseKey = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, [
        'deriveKey',
      ]);
      const legacyKey = await subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: enc.encode('rethink-session-v1'),
          iterations: PBKDF2_ITERATIONS,
          hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
      const decBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, legacyKey, data);
      return new TextDecoder().decode(decBuf);
    } catch {}

    const padKey = await subtle.importKey(
      'raw',
      enc.encode(secret.padEnd(32, '#').slice(0, 32)),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const decBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, padKey, data);
    return new TextDecoder().decode(decBuf);
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
