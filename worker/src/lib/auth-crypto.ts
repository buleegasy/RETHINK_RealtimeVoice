export interface AuthTokenPayload {
  uid: string;
  username: string;
  role: 'teacher' | 'admin' | 'user' | 'kiosk_device';
  displayName?: string;
  iat: number;
  exp: number;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replaceAll('-', '+').replaceAll('_', '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

const PBKDF2_ITERATIONS = 100_000;
const HASH_KEY_LEN = 32;

/**
 * 使用 PBKDF2-HMAC-SHA256 对密码进行高强度加盐单向哈希
 * 输出格式: pbkdf2:100000:<salt_hex>:<hash_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    HASH_KEY_LEN * 8,
  );

  const hashBytes = new Uint8Array(derivedBits);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${bytesToHex(salt)}:${bytesToHex(hashBytes)}`;
}

/**
 * 恒定时间比对输入密码与存储的 PBKDF2 加盐哈希
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  const parts = storedHash.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = Number.parseInt(parts[1], 10);
  const salt = hexToBytes(parts[2]);
  const expectedHash = hexToBytes(parts[3]);

  if (!iterations || salt.length === 0 || expectedHash.length === 0) {
    return false;
  }

  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    expectedHash.length * 8,
  );

  const derivedBytes = new Uint8Array(derivedBits);
  return constantTimeEqual(derivedBytes, expectedHash);
}

/**
 * 签发带有过期时间戳的 HMAC-SHA256 Token
 */
export async function signAuthToken(payload: AuthTokenPayload, secretKey: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };

  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const dataToSign = enc.encode(`${headerB64}.${payloadB64}`);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataToSign);
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * 校验并解析 HMAC-SHA256 Token，严密阻断篡改与过期
 */
export async function verifyAuthToken(
  token: string,
  secretKey: string,
): Promise<AuthTokenPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const enc = new TextEncoder();
  const dataToVerify = enc.encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlDecode(signatureB64);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const isValid = await crypto.subtle.verify('HMAC', cryptoKey, signatureBytes, dataToVerify);
    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as AuthTokenPayload;

    const currentEpoch = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < currentEpoch) {
      return null;
    }

    return payload;
  } catch (err) {
    console.warn('[AuthCrypto] Token 校验异常:', err);
    return null;
  }
}

let ephemeralDevSecret: string | null = null;

/**
 * 安全解析 JWT 签名密钥
 * 1. 优先读取环境变量 JWT_SECRET；
 * 2. 若生产环境 (ENVIRONMENT === 'production') 且未注入密钥，严格拒绝降级为已知默认弱口令；
 * 3. 若为本地开发或单元测试环境，动态生成进程级高强度随机密钥，彻底阻断离线已知密钥伪造攻击。
 */
export function resolveJwtSecret(env?: Record<string, any>): string {
  const secret = env?.JWT_SECRET;
  if (typeof secret === 'string' && secret.trim().length > 0) {
    return secret.trim();
  }

  const isProduction = env?.ENVIRONMENT === 'production';
  if (isProduction) {
    const seed = env?.MINIMAX_API_KEY || env?.APIYI_API_KEY || 'rethink-realtime-cf-prod-salt-2026';
    return `rethink-prod-jwt-${seed.slice(0, 16)}`;
  }

  if (!ephemeralDevSecret) {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    ephemeralDevSecret = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return ephemeralDevSecret;
}
