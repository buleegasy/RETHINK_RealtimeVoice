import type { Env } from '../../types';
import { hashPassword, verifyPassword } from '../../lib/auth-crypto';

export async function ensureUsersTable(_env: Env): Promise<void> {
  // 数据库表结构及初始化账号统一由 migrations/0001_init_schema.sql 维护，彻底避免冷启动 DDL 锁冲突
}

export interface MemoryUser {
  id: string;
  passwordHash: string;
  displayName: string;
  role?: string;
}

// 内存测试/无数据库兜底用户表 (加盐哈希存储)
const memoryUsers = new Map<string, MemoryUser>();

export function getMemoryUser(username: string): MemoryUser | undefined {
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

export interface AuthVerificationResult {
  ok: boolean;
  status: 200 | 401 | 500;
  error?: string;
  user?: {
    id: string;
    displayName: string;
  };
}

export async function verifyUserCredentials(
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

export interface RegisterResult {
  ok: boolean;
  status: 200 | 400 | 500;
  error?: string;
  user?: {
    id: string;
    displayName: string;
  };
}

export async function registerNewUser(
  cleanUser: string,
  password: string,
  chosenName: string,
  env: Env,
): Promise<RegisterResult> {
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
        return { ok: false, status: 400, error: '该用户名已被注册，请直接登录' };
      }
      console.warn('[Auth] D1 注册持久化异常:', dbErr);
      return { ok: false, status: 500, error: '注册失败，请稍后重试' };
    }
  } else {
    if (memoryUsers.has(cleanUser)) {
      return { ok: false, status: 400, error: '该用户名已被注册，请直接登录' };
    }
    memoryUsers.set(cleanUser, {
      id: newUserId,
      passwordHash,
      displayName: chosenName,
      role: 'user',
    });
  }

  return {
    ok: true,
    status: 200,
    user: {
      id: newUserId,
      displayName: chosenName,
    },
  };
}
