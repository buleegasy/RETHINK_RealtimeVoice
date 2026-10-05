import { Hono } from 'hono';
import type { Env } from '../types';
import { hashPassword, verifyPassword, signAuthToken, resolveJwtSecret } from '../lib/auth-crypto';

export const authRouter = new Hono<{ Bindings: Env }>();

export async function ensureUsersTable(_env: Env): Promise<void> {
  // 数据库表结构及初始化账号统一由 migrations/0001_init_schema.sql 维护，彻底避免冷启动 DDL 锁冲突
}

// 内存测试/无数据库兜底用户表 (加盐哈希存储)
const memoryUsers = new Map<
  string,
  { id: string; passwordHash: string; displayName: string; role?: string }
>();

export function getMemoryUser(username: string) {
  return memoryUsers.get(username);
}

let memoryInitPromise: Promise<void> | null = null;

// 仅在非生产/测试环境中初始化内置测试账号，生产环境严禁预置任何静态测试账号
if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
  memoryInitPromise = (async () => {
    try {
      const defaultHash = await hashPassword('password123');
      memoryUsers.set('testuser', {
        id: 'usr_testuser',
        passwordHash: defaultHash,
        displayName: 'testuser',
        role: 'user',
      });
      const teacherHash = await hashPassword('counselor2026');
      memoryUsers.set('teacher', {
        id: 'usr_teacher',
        passwordHash: teacherHash,
        displayName: '校心理专职教师',
        role: 'teacher',
      });
    } catch (err) {
      console.warn('[Auth] 内存默认测试用户初始化异常:', err);
    }
  })();
}

interface AuthVerificationResult {
  ok: boolean;
  status: 200 | 401 | 500;
  error?: string;
  user?: {
    id: string;
    displayName: string;
  };
}

async function verifyUserCredentials(
  cleanUser: string,
  password: string,
  env: Env,
): Promise<AuthVerificationResult> {
  if (memoryInitPromise) {
    await memoryInitPromise;
  }
  if (env.DB) {
    try {
      const userRow = await env.DB.prepare(
        'SELECT id, username, password_hash, display_name FROM users WHERE username = ?',
      )
        .bind(cleanUser)
        .first<{ id?: string; username?: string; password_hash?: string; display_name?: string }>();

      if (!userRow || !(await verifyPassword(password, userRow.password_hash || ''))) {
        return { ok: false, status: 401, error: '用户名或密码错误' };
      }

      return {
        ok: true,
        status: 200,
        user: {
          id: userRow.id || `user_${cleanUser}`,
          displayName: userRow.display_name || cleanUser,
        },
      };
    } catch (e) {
      console.warn('[Auth] D1 用户查询校验异常:', e);
      return { ok: false, status: 500, error: '鉴权服务暂时不可用，请稍后重试' };
    }
  }

  const memUser = memoryUsers.get(cleanUser);
  if (!memUser || !(await verifyPassword(password, memUser.passwordHash))) {
    return { ok: false, status: 401, error: '用户名或密码错误' };
  }

  return {
    ok: true,
    status: 200,
    user: {
      id: memUser.id,
      displayName: memUser.displayName,
    },
  };
}

authRouter.post('/login', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { username, password } = body;

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return c.json({ success: false, error: '请输入有效的用户名和密码' }, 400);
  }

  const cleanUser = username.trim();
  if (cleanUser.length < 2) {
    return c.json({ success: false, error: '用户名长度不能少于 2 位' }, 400);
  }

  const env = c.env || {};
  await ensureUsersTable(env);

  const authResult = await verifyUserCredentials(cleanUser, password, env);
  if (!authResult.ok || !authResult.user) {
    return c.json({ success: false, error: authResult.error }, authResult.status);
  }

  const { id: userId, displayName } = authResult.user;

  const currentEpoch = Math.floor(Date.now() / 1000);
  let secretKey = '';
  try {
    secretKey = resolveJwtSecret(env);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || '鉴权服务配置异常' }, 500);
  }
  const token = await signAuthToken(
    {
      uid: userId,
      username: cleanUser,
      displayName,
      role: 'user',
      iat: currentEpoch,
      exp: currentEpoch + 7 * 86400, // 7 天有效
    },
    secretKey,
  );

  return c.json({
    success: true,
    token,
    user: {
      uid: userId,
      userName: cleanUser,
      displayName,
      role: 'user',
      isAuthenticated: true,
    },
  });
});

authRouter.post('/register', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { username, password, displayName } = body;

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return c.json({ success: false, error: '用户名与密码为必填项' }, 400);
  }

  const cleanUser = username.trim();
  if (cleanUser.length < 2 || cleanUser.length > 30) {
    return c.json({ success: false, error: '用户名长度需在 2 到 30 位之间' }, 400);
  }

  if (password.length < 6) {
    return c.json({ success: false, error: '密码长度至少需为 6 位' }, 400);
  }

  const chosenName =
    displayName && typeof displayName === 'string' && displayName.trim()
      ? displayName.trim()
      : cleanUser;

  const env = c.env || {};
  const newUserId = `usr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const passwordHash = await hashPassword(password);

  await ensureUsersTable(env);
  if (memoryInitPromise) {
    await memoryInitPromise;
  }

  if (env.DB) {
    try {
      await env.DB.prepare(
        'INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)',
      )
        .bind(newUserId, cleanUser, passwordHash, chosenName)
        .run();
    } catch (dbErr: any) {
      if (dbErr?.message?.includes('UNIQUE')) {
        return c.json({ success: false, error: '该用户名已被注册，请直接登录' }, 400);
      }
      console.warn('[Auth] D1 注册持久化异常:', dbErr);
      return c.json({ success: false, error: '注册失败，请稍后重试' }, 500);
    }
  } else {
    if (memoryUsers.has(cleanUser)) {
      return c.json({ success: false, error: '该用户名已被注册，请直接登录' }, 400);
    }
    memoryUsers.set(cleanUser, {
      id: newUserId,
      passwordHash,
      displayName: chosenName,
      role: 'user',
    });
  }

  const currentEpoch = Math.floor(Date.now() / 1000);
  let secretKey = '';
  try {
    secretKey = resolveJwtSecret(env);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || '鉴权服务配置异常' }, 500);
  }
  const token = await signAuthToken(
    {
      uid: newUserId,
      username: cleanUser,
      displayName: chosenName,
      role: 'user',
      iat: currentEpoch,
      exp: currentEpoch + 7 * 86400,
    },
    secretKey,
  );

  return c.json({
    success: true,
    token,
    user: {
      uid: newUserId,
      userName: cleanUser,
      displayName: chosenName,
      role: 'user',
      isAuthenticated: true,
    },
  });
});

interface KioskRateLimitEntry {
  count: number;
  resetAt: number;
}

const kioskRateLimits = new Map<string, KioskRateLimitEntry>();
const MAX_RATE_LIMIT_ENTRIES = 1000;
const KIOSK_MAX_ATTEMPTS_PER_MIN = 30;

function isKioskRateLimited(ip: string): boolean {
  const now = Date.now();

  // 超过容量上限时主动扫描清理过期项，防范内存泄露与 IP 碰撞攻击
  if (kioskRateLimits.size >= MAX_RATE_LIMIT_ENTRIES) {
    for (const [key, val] of kioskRateLimits.entries()) {
      if (now > val.resetAt) {
        kioskRateLimits.delete(key);
      }
    }
    if (kioskRateLimits.size >= MAX_RATE_LIMIT_ENTRIES) {
      const oldestKey = kioskRateLimits.keys().next().value;
      if (oldestKey) kioskRateLimits.delete(oldestKey);
    }
  }

  const entry = kioskRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    kioskRateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= KIOSK_MAX_ATTEMPTS_PER_MIN) {
    return true;
  }
  entry.count += 1;
  return false;
}

export function resetKioskRateLimits(): void {
  kioskRateLimits.clear();
}

function checkKioskDeviceKey(c: any, body: any, env: Env): { valid: boolean; error?: string } {
  const configuredKey = env.KIOSK_DEVICE_KEY;
  const isProduction = env.ENVIRONMENT === 'production';

  if (!configuredKey) {
    if (isProduction) {
      return {
        valid: false,
        error: '设备密钥校验失败: 生产环境未配置 KIOSK_DEVICE_KEY 凭据',
      };
    }
    return { valid: true };
  }

  const incomingKey =
    c.req.header('X-Kiosk-Device-Key') ||
    c.req.header('x-kiosk-device-key') ||
    body?.deviceKey ||
    body?.device_key;

  if (!incomingKey || incomingKey.trim() !== configuredKey.trim()) {
    return {
      valid: false,
      error: '设备密钥校验失败: 缺少或无效的 X-Kiosk-Device-Key',
    };
  }
  return { valid: true };
}

authRouter.post('/kiosk-login', async (c) => {
  const clientIp =
    c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';

  if (isKioskRateLimited(clientIp)) {
    return c.json(
      { success: false, error: '请求过于频繁，触发终端鉴权频次限制 (Rate limit exceeded)' },
      429,
    );
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const env = c.env || {};
  const keyCheck = checkKioskDeviceKey(c, body, env);
  if (!keyCheck.valid) {
    return c.json({ success: false, error: keyCheck.error }, 401);
  }

  const deviceId =
    body.deviceId && typeof body.deviceId === 'string' ? body.deviceId.trim() : 'kiosk-booth-01';

  const currentEpoch = Math.floor(Date.now() / 1000);
  let kioskSecret = '';
  try {
    kioskSecret = resolveJwtSecret(env);
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || '终端鉴权配置异常' }, 500);
  }
  const token = await signAuthToken(
    {
      uid: `device_${deviceId}`,
      username: `kiosk_${deviceId}`,
      displayName: `咨询终端 (${deviceId})`,
      role: 'kiosk_device',
      iat: currentEpoch,
      exp: currentEpoch + 30 * 86400, // 终端 Token 30 天有效
    },
    kioskSecret,
  );

  return c.json({
    success: true,
    token,
    user: {
      uid: `device_${deviceId}`,
      userName: '来访者',
      displayName: `咨询终端 (${deviceId})`,
      role: 'kiosk_device',
      deviceId,
      isAuthenticated: true,
    },
  });
});
