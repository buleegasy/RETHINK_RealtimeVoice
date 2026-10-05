const DEFAULT_WORKER_ORIGIN = '';

export const WORKER_ORIGIN =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WORKER_ORIGIN) ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : DEFAULT_WORKER_ORIGIN);

const SAFE_AUTH_TOKEN_REGEX = /^[A-Za-z0-9-_=.]+$/;

function sanitizeAuthToken(token: unknown): string | null {
  if (typeof token === 'string' && SAFE_AUTH_TOKEN_REGEX.test(token.trim())) {
    return token.trim();
  }
  return null;
}

export function getWsUrl(options?: {
  userId?: string;
  username?: string;
  sessionId?: string;
  token?: string;
}): string {
  const params = new URLSearchParams();
  params.set('model', 'minimax-realtime');
  if (options?.userId) params.set('userId', options.userId);
  if (options?.username) params.set('username', options.username);
  if (options?.sessionId) params.set('sessionId', options.sessionId);

  const token = sanitizeAuthToken(options?.token) || resolveStoredAuthToken('/api/voice/ws');
  if (token) {
    params.set('token', token);
  }

  if (WORKER_ORIGIN) {
    try {
      const parsed = new URL(WORKER_ORIGIN);
      const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${parsed.host}/api/voice/ws?${params.toString()}`;
    } catch {}
  }

  if (typeof window !== 'undefined') {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}/api/voice/ws?${params.toString()}`;
  }
  return `ws://localhost:8787/api/voice/ws?${params.toString()}`;
}

function resolveStoredAuthToken(targetPath: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    if (targetPath.includes('/api/admin')) {
      const rawTeacher = localStorage.getItem('rethink_teacher_auth');
      if (rawTeacher) {
        const parsed = JSON.parse(rawTeacher);
        const safeToken = sanitizeAuthToken(parsed?.token);
        if (safeToken) return safeToken;
      }
    }
    const directToken = sanitizeAuthToken(localStorage.getItem('rethink_auth_token'));
    if (directToken) return directToken;

    const rawAuth = localStorage.getItem('rethink_auth');
    if (rawAuth) {
      const parsed = JSON.parse(rawAuth);
      const safeToken = sanitizeAuthToken(parsed?.token);
      if (safeToken) return safeToken;
    }

    const rawTeacher = localStorage.getItem('rethink_teacher_auth');
    if (rawTeacher) {
      const parsed = JSON.parse(rawTeacher);
      const safeToken = sanitizeAuthToken(parsed?.token);
      if (safeToken) return safeToken;
    }
  } catch (err) {
    console.warn('[ApiFetch] 读取本地凭证异常:', err);
  }
  return null;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const targetPath = path.startsWith('/') ? path : `/${path}`;
  const headers = new Headers(init?.headers);

  if (
    !headers.has('Content-Type') &&
    init?.method &&
    init.method !== 'GET' &&
    init.method !== 'HEAD'
  ) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Authorization')) {
    const token = resolveStoredAuthToken(targetPath);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const options: RequestInit = {
    ...init,
    headers,
  };

  if ((options.method === 'POST' || options.method === 'PUT') && !options.body) {
    options.body = JSON.stringify({});
  }

  const primaryUrl = targetPath;

  try {
    const res = await fetch(primaryUrl, options);
    if (!res.ok && res.status >= 500 && WORKER_ORIGIN && primaryUrl === targetPath) {
      return await fetch(`${WORKER_ORIGIN}${targetPath}`, options);
    }
    return res;
  } catch (err) {
    if (WORKER_ORIGIN && primaryUrl !== `${WORKER_ORIGIN}${targetPath}`) {
      try {
        return await fetch(`${WORKER_ORIGIN}${targetPath}`, options);
      } catch (fallbackErr) {
        console.warn('[ApiFetch] Worker 备用端点请求失败:', fallbackErr);
        throw err;
      }
    }
    throw err;
  }
}
