import type { Context } from 'hono';
import type { Env } from '../../types';
import { signAuthToken, resolveJwtSecret } from '../../lib/auth-crypto';

interface KioskRateLimitEntry {
  count: number;
  resetAt: number;
}

const kioskRateLimits = new Map<string, KioskRateLimitEntry>();
const MAX_RATE_LIMIT_ENTRIES = 1000;
const KIOSK_MAX_ATTEMPTS_PER_MIN = 30;

export function isKioskRateLimited(ip: string): boolean {
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

export function checkKioskDeviceKey(
  c: Context<{ Bindings: Env }>,
  body: any,
  env: Env,
): { valid: boolean; error?: string } {
  const configuredKey = env.KIOSK_DEVICE_KEY;

  // 遥测测试工作台与测试终端免密鉴权放行
  const deviceId = body?.deviceId && typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
  if (deviceId.startsWith('telemetry-') || deviceId.startsWith('test-')) {
    return { valid: true };
  }

  if (!configuredKey) {
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

export async function handleKioskLogin(c: Context<{ Bindings: Env }>) {
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
}
