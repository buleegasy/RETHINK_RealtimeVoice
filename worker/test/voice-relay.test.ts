import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index';
import { signAuthToken, resolveJwtSecret } from '../src/lib/auth-crypto';
import { SessionReporter } from '../src/services/voice/session-reporter';

if (typeof (globalThis as any).WebSocketPair === 'undefined') {
  class MockWs {
    accept() {}
    send() {}
    close() {}
    addEventListener() {}
  }
  (globalThis as any).WebSocketPair = class {
    0 = new MockWs();
    1 = new MockWs();
  };
}

const OriginalResponse = globalThis.Response;
globalThis.Response = class MockResponse extends OriginalResponse {
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: any }) {
    if (init && init.status === 101) {
      super(body, { ...init, status: 200 });
      Object.defineProperty(this, 'status', { value: 101 });
      if (init.webSocket) {
        Object.defineProperty(this, 'webSocket', { value: init.webSocket });
      }
      return;
    }
    super(body, init);
  }
} as any;

describe('Worker 路由与健康检查测试', () => {
  it('GET / 应返回健康检查状态与 minimax-realtime 模型标识', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('rethink-realtime-worker');
    expect(body.model).toBe('minimax-realtime');
  });

  it('POST /api/voice/knowledge 能够正确检索知识并返回结果', async () => {
    const res = await app.request('/api/voice/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '灾难化', topK: 1 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.chunks)).toBe(true);
    expect(body.chunks.length).toBeGreaterThan(0);
    expect(body.chunks[0].title).toContain('灾难化');
  });

  it('POST /api/voice/session/persist 处理空请求体时不发生 500 异常', async () => {
    const res = await app.request('/api/voice/session/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  it('POST /api/voice/chat 处理危机词时触发紧急干预', async () => {
    const res = await app.request('/api/voice/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '我觉得活着没意思，想跳楼自杀' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.isCrisis).toBe(true);
    expect(body.nextStage).toBe('Crisis_Escalation');
  });

  it('POST /api/voice/chat 拒绝空请求', async () => {
    const res = await app.request('/api/voice/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
  });

  describe('用户认证与树莓派终端接口测试', () => {
    it('POST /api/auth/login 校验有效用户名与密码返回 Token', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.token).toBeDefined();
      expect(data.user.userName).toBe('testuser');
    });

    it('POST /api/auth/register 支持注册新来访者与个性化称呼', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'student01',
          password: 'secretPassword',
          displayName: '小李同学',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.user.displayName).toBe('小李同学');
    });

    it('POST /api/auth/kiosk-login 支持树莓派终端一键就绪', async () => {
      const res = await app.request('/api/auth/kiosk-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'pi-booth-campus-01' }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.user.role).toBe('kiosk_device');
      expect(data.user.deviceId).toBe('pi-booth-campus-01');
    });
  });

  describe('树莓派专属设备监控与远程配置接口测试', () => {
    it('POST /api/kiosk/heartbeat 接收设备健康心跳', async () => {
      const res = await app.request('/api/kiosk/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'pi-booth-01', uptime: 3600 }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.deviceId).toBe('pi-booth-01');
      expect(body.serverTime).toBeDefined();
    });

    it('GET /api/kiosk/config/:deviceId 返回终端配置参数', async () => {
      const res = await app.request('/api/kiosk/config/pi-booth-01');
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.config.autoResetSeconds).toBe(30);
      expect(body.config.silenceTimeoutSeconds).toBe(120);
    });
  });

  describe('生产模式环境下的鉴权守门与会话去重机制 (ENVIRONMENT: production)', () => {
    const prodEnv: any = {
      ENVIRONMENT: 'production',
      JWT_SECRET: 'test-production-secret-2026-rethink-voice',
    };

    let validToken = '';

    beforeAll(async () => {
      const secret = resolveJwtSecret(prodEnv);
      validToken = await signAuthToken(
        {
          uid: 'student_prod_01',
          username: 'student_prod',
          displayName: '生产学生',
          role: 'user',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        secret,
      );
    });

    it('GET /api/voice/ws 在生产环境下未携带 Token 时拒绝握手并返回 401', async () => {
      const res = await app.request(
        '/api/voice/ws',
        {
          headers: { Upgrade: 'websocket' },
        },
        prodEnv,
      );

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain('Unauthorized');
    });

    it('GET /api/voice/ws 在生产环境下携带无效 Token 时拒绝握手并返回 401', async () => {
      const res = await app.request(
        '/api/voice/ws?token=invalid.token.here',
        {
          headers: { Upgrade: 'websocket' },
        },
        prodEnv,
      );

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain('Unauthorized');
    });

    it('GET /api/voice/ws 在生产环境下携带有效 Token 时通过鉴权进入 WebSocket 协议升级', async () => {
      const res = await app.request(
        `/api/voice/ws?token=${validToken}&sessionId=sess_prod_ws_test`,
        {
          headers: { Upgrade: 'websocket' },
        },
        prodEnv,
      );

      expect(res.status).toBe(101);
    });

    it('POST /api/voice/session/persist 在生产环境下无有效身份直接返回 401 拦截', async () => {
      const res = await app.request(
        '/api/voice/session/persist',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: 'malicious_persist_attack' }),
        },
        prodEnv,
      );

      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('POST /api/voice/session/persist 在生产环境下携带有效 Token 正常放行', async () => {
      const res = await app.request(
        '/api/voice/session/persist',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${validToken}`,
          },
          body: JSON.stringify({
            session_id: `valid_sess_${Date.now()}`,
            transcript_text: '学生: 老师我最近压力很大\n智能体: 慢慢说，我一直在这里听你说。',
          }),
        },
        prodEnv,
      );

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.ok).toBe(true);
    });

    it('POST /api/voice/chat 在生产环境下无有效身份直接返回 401 拦截', async () => {
      const res = await app.request(
        '/api/voice/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '你好' }),
        },
        prodEnv,
      );
      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('POST /api/voice/knowledge 在生产环境下无有效身份直接返回 401 拦截', async () => {
      const res = await app.request(
        '/api/voice/knowledge',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '考试焦虑' }),
        },
        prodEnv,
      );
      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain('Unauthorized');
    });

    it('SessionReporter.generateAndPersist 对同一 sessionId 的并发调用命中排重锁，防止重复执行', async () => {
      SessionReporter.clearDeduplicationCache();
      const dedupSessionId = `sess_dedup_test_${Date.now()}`;

      const options = {
        sessionId: dedupSessionId,
        studentName: '并发测试学生',
        transcriptText: '学生: 压力很大\n智能体: 我在听',
      };

      const [res1, res2] = await Promise.all([
        SessionReporter.generateAndPersist(prodEnv, options),
        SessionReporter.generateAndPersist(prodEnv, options),
      ]);

      expect(res1.ok).toBe(true);
      expect(res2.ok).toBe(true);
      expect(res1.session_id).toBe(dedupSessionId);
      expect(res2.session_id).toBe(dedupSessionId);
      expect(res1.report.sessionId).toBe(res2.report.sessionId);
    });

    it('SessionReporter.generateAndPersist 对同一 sessionId 的串行二次调用直接命中已持久化记录，不重复执行大模型生成', async () => {
      SessionReporter.clearDeduplicationCache();
      const dedupSessionId = `sess_dedup_seq_${Date.now()}`;

      const res1 = await SessionReporter.generateAndPersist(prodEnv, {
        sessionId: dedupSessionId,
        studentName: '串行测试学生',
        transcriptText: '学生: 期末复习压力很大\n智能体: 我在听',
        duration: 0,
      });

      expect(res1.ok).toBe(true);
      expect(res1.session_id).toBe(dedupSessionId);

      // 清除内存缓存以模拟多实例或冷启动场景
      SessionReporter.clearDeduplicationCache();

      const res2 = await SessionReporter.generateAndPersist(prodEnv, {
        sessionId: dedupSessionId,
        studentName: '串行测试学生',
        transcriptText: '学生: 期末复习压力很大\n智能体: 我在听',
        duration: 180,
      });

      expect(res2.ok).toBe(true);
      expect(res2.session_id).toBe(dedupSessionId);
      expect(res2.report.sessionId).toBe(res1.report.sessionId);
      expect(res2.report.durationSeconds).toBe(180);
    });
  });
});
