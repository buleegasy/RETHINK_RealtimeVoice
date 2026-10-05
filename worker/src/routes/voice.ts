import { Hono } from 'hono';
import type { Env, PersistSessionPayload, KnowledgeQueryPayload } from '../types';
import { VoiceService } from '../services/voice-service';
import { verifyAuthToken, resolveJwtSecret, type AuthTokenPayload } from '../lib/auth-crypto';

export { BargeInCoordinator } from '../services/voice-service';

export const voiceRouter = new Hono<{ Bindings: Env }>();

/**
 * 校验并提取 Authorization 标头或 Query 中的 JWT 身份
 */
async function extractAndVerifyUser(c: any): Promise<AuthTokenPayload | null> {
  const authHeader = c.req.header('Authorization');
  let token = '';
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = c.req.query('token') || '';
  }
  if (!token) return null;

  try {
    const secret = resolveJwtSecret(c.env || {});
    return await verifyAuthToken(token, secret);
  } catch {
    return null;
  }
}

function getSafeExecutionCtx(c: any): ExecutionContext | undefined {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

// 1. 全双工实时语音 WebSocket 接入端点
voiceRouter.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }

  const user = await extractAndVerifyUser(c);
  const isProduction = c.env?.ENVIRONMENT === 'production';
  if (isProduction && !user) {
    return c.text('Unauthorized: Missing or invalid authentication token', 401);
  }

  const pair = new WebSocketPair();
  const [clientWs, serverWs] = Object.values(pair);
  serverWs.accept();

  const query = {
    sessionId: c.req.query('sessionId'),
    userId: user?.uid || c.req.query('userId'),
    username: user?.displayName || user?.username || c.req.query('username'),
    model: c.req.query('model'),
  };

  return VoiceService.handleWebSocketRelay(
    serverWs,
    clientWs,
    c.env || {},
    query,
    getSafeExecutionCtx(c),
  );
});

// 2. 文本与降级 REST 语音对话端点
voiceRouter.post('/chat', async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const result = await VoiceService.handleChat(c.env || {}, body, getSafeExecutionCtx(c));
  const status = result.ok ? 200 : 400;
  return c.json(result, status as any);
});

// 3. 通话挂机后个案记录与结构化评估简报持久化端点
voiceRouter.post('/session/persist', async (c) => {
  const user = await extractAndVerifyUser(c);
  const isProduction = c.env?.ENVIRONMENT === 'production';
  if (isProduction && !user) {
    return c.json(
      { ok: false, error: 'Unauthorized: Missing or invalid authentication token' },
      401,
    );
  }

  let payload: Partial<PersistSessionPayload> = {};
  try {
    payload = await c.req.json<PersistSessionPayload>();
  } catch {
    payload = {};
  }

  if (user && !payload.username) {
    payload.username = user.displayName || user.username;
  }

  const result = await VoiceService.handlePersistSession(
    c.env || {},
    payload,
    getSafeExecutionCtx(c),
  );
  return c.json(result);
});

// 4. 来访学生情景记忆档案查询端点 (带 PII 权限守门)
voiceRouter.get('/memory/:userId', async (c) => {
  const userId = c.req.param('userId');
  const user = await extractAndVerifyUser(c);
  const isProduction = c.env?.ENVIRONMENT === 'production';

  if (isProduction && !user) {
    return c.json({ ok: false, error: 'Unauthorized: 请先登录获取凭证' }, 401);
  }

  if (user) {
    const isPrivileged = user.role === 'teacher' || user.role === 'admin';
    const isOwner = user.uid === userId || user.username === userId;
    if (!isPrivileged && !isOwner) {
      return c.json({ ok: false, error: 'Forbidden: 无权查看其他来访者的情景记忆档案' }, 403);
    }
  }

  const memory = await VoiceService.getMemory(c.env || {}, userId);
  return c.json({
    ok: true,
    userId,
    memory: memory || null,
  });
});

// 5. 心理支持与干预策略知识向量检索端点
voiceRouter.post('/knowledge', async (c) => {
  let body: Partial<KnowledgeQueryPayload> = {};
  try {
    body = await c.req.json<KnowledgeQueryPayload>();
  } catch {
    body = {};
  }

  const query = (body.query || '').trim();
  const topK = body.topK || 2;

  const result = await VoiceService.handleKnowledgeQuery(c.env || {}, query, topK);
  return c.json(result);
});
