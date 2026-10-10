import { Hono } from 'hono';
import type { Env } from '../types';
import { signAuthToken, resolveJwtSecret } from '../lib/auth-crypto';
import {
  ensureUsersTable,
  getMemoryUser,
  verifyUserCredentials,
  registerNewUser,
} from './auth/user-store';
import { resetKioskRateLimits, handleKioskLogin } from './auth/kiosk-auth';

export const authRouter = new Hono<{ Bindings: Env }>();

export { ensureUsersTable, getMemoryUser, resetKioskRateLimits };

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
  const regResult = await registerNewUser(cleanUser, password, chosenName, env);
  if (!regResult.ok || !regResult.user) {
    return c.json({ success: false, error: regResult.error }, regResult.status);
  }

  const { id: newUserId } = regResult.user;
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

authRouter.post('/kiosk-login', handleKioskLogin);
