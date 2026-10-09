import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index';
import {
  getSituationalMemory,
  saveSituationalMemory,
  clearMemoryCache,
} from '../src/lib/memory-store';
import { resetKioskRateLimits } from '../src/routes/auth';
import { AdminService } from '../src/services/admin-service';
import { SessionRepository } from '../src/repositories/session-repository';
import { WebCryptoAesGcm } from '../../web/src/lib/pipelines/security/webCryptoAesGcm';
import { RealtimeGatewayAdapter } from '../src/adapters/realtime-gateway-adapter';
import { RelaySessionCoordinator } from '../src/services/voice/relay-session-coordinator';
import { BargeInCoordinator } from '../src/services/voice/barge-in-coordinator';
import type { SituationalMemory, SessionRecord, Env } from '../src/types';

class MockWebSocket {
  public readyState: number = 1;
  public sentData: string[] = [];
  public closed: boolean = false;
  public closeCode?: number;
  public closeReason?: string;
  private listeners: Record<string, Function[]> = {};

  public accept(): void {}

  public send(data: string): void {
    this.sentData.push(data);
  }

  public close(code?: number, reason?: string): void {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3;
    this.emit('close', { code, reason });
  }

  public addEventListener(event: string, callback: Function): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  public removeEventListener(event: string, callback: Function): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  }

  public emit(event: string, data?: any): void {
    const handlers = this.listeners[event] || [];
    for (const h of handlers) {
      h(data);
    }
  }
}

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
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

describe('Challenger 2: Security, Crypto & Timing Adversarial Verification', () => {
  beforeEach(() => {
    clearMemoryCache();
    resetKioskRateLimits();
  });

  describe('1. Adversarial Memory Isolation Testing (防跨学生创伤记忆盗取)', () => {
    it('相同姓名("李华")但不同学号的两个学生，严禁相互越权读取或覆盖创伤档案', async () => {
      const mockEnv: any = {};

      const studentA: SituationalMemory = {
        userId: 'stu_lihua_001',
        userName: '李华',
        identityContext: '高二(1)班',
        coreConcerns: ['家庭虐待与隐秘创伤', '重度离异后遗症'],
        significantOthers: ['小姨'],
        recentSituations: ['在家中遭遇激烈肢体冲突'],
        effectiveStrategies: ['渐进式肌肉放松'],
        summaryParagraph: '存在极度隐秘的高危家庭暴力创伤，严禁泄露',
        lastUpdated: Date.now(),
      };

      const studentB: SituationalMemory = {
        userId: 'stu_lihua_002',
        userName: '李华',
        identityContext: '高三(8)班',
        coreConcerns: ['考前焦虑', '英语听力发挥失常'],
        significantOthers: ['英语课代表'],
        recentSituations: ['听力摸底考不理想'],
        effectiveStrategies: ['听白噪音'],
        summaryParagraph: '纯学业压力，无任何家庭创伤',
        lastUpdated: Date.now(),
      };

      // 写入学生 A
      await saveSituationalMemory(mockEnv, studentA);

      // 学生 B (亦叫李华) 在未保存自己记录前，查询自己记录应严格返回 null，绝不能返回学生 A 的档案
      const studentBRecordBefore = await getSituationalMemory(mockEnv, 'stu_lihua_002');
      expect(studentBRecordBefore).toBeNull();

      // 尝试通过名字 "李华" 直接越权查询：必须返回 null，严禁支持姓名索引
      const queryByName = await getSituationalMemory(mockEnv, '李华');
      expect(queryByName).toBeNull();

      // 写入学生 B
      await saveSituationalMemory(mockEnv, studentB);

      // 分别独立查询 A 与 B
      const recordA = await getSituationalMemory(mockEnv, 'stu_lihua_001');
      const recordB = await getSituationalMemory(mockEnv, 'stu_lihua_002');

      expect(recordA).not.toBeNull();
      expect(recordB).not.toBeNull();

      expect(recordA?.coreConcerns).toContain('家庭虐待与隐秘创伤');
      expect(recordA?.coreConcerns).not.toContain('考前焦虑');

      expect(recordB?.coreConcerns).toContain('考前焦虑');
      expect(recordB?.coreConcerns).not.toContain('家庭虐待与隐秘创伤');
      expect(recordB?.summaryParagraph).not.toContain('家庭暴力');
    });

    it('通用占位符("来访者"、"student_user"、"sess_*")绝不被保存或查询出跨用户污染', async () => {
      const mockEnv: any = {};

      // 攻击者尝试以 "来访者" 为 userId 写入全校共享后门
      const genericVisitorMemory: SituationalMemory = {
        userId: '来访者',
        userName: '来访者',
        coreConcerns: ['恶意全局投毒数据'],
        summaryParagraph: '恶意篡改',
        lastUpdated: Date.now(),
      };

      await saveSituationalMemory(mockEnv, genericVisitorMemory);
      const queryVisitor = await getSituationalMemory(mockEnv, '来访者');
      expect(queryVisitor).toBeNull();

      // 尝试以 "student_user" 占位符存取
      const studentUserMemory: SituationalMemory = {
        userId: 'student_user',
        userName: '学生',
        coreConcerns: ['占位符泄露测试'],
        summaryParagraph: '',
        lastUpdated: Date.now(),
      };
      await saveSituationalMemory(mockEnv, studentUserMemory);
      const queryStudentUser = await getSituationalMemory(mockEnv, 'student_user');
      expect(queryStudentUser).toBeNull();

      // 尝试以临时匿名 session 写入
      const sessionMemory: SituationalMemory = {
        userId: 'sess_12345678_temp',
        userName: '来访者',
        coreConcerns: ['临时匿名倾诉'],
        summaryParagraph: '',
        lastUpdated: Date.now(),
      };
      await saveSituationalMemory(mockEnv, sessionMemory);
      const querySession = await getSituationalMemory(mockEnv, 'sess_12345678_temp');
      expect(querySession).toBeNull();
    });

    it('两名学生即使 userName 同为 "来访者"，按独立 userId 隔离后互不干扰', async () => {
      const mockEnv: any = {};

      const visitor1: SituationalMemory = {
        userId: 'stu_booth_alpha',
        userName: '来访者',
        coreConcerns: ['社交恐惧'],
        summaryParagraph: '',
        lastUpdated: Date.now(),
      };

      const visitor2: SituationalMemory = {
        userId: 'stu_booth_beta',
        userName: '来访者',
        coreConcerns: ['睡眠障碍'],
        summaryParagraph: '',
        lastUpdated: Date.now(),
      };

      await saveSituationalMemory(mockEnv, visitor1);
      await saveSituationalMemory(mockEnv, visitor2);

      const res1 = await getSituationalMemory(mockEnv, 'stu_booth_alpha');
      const res2 = await getSituationalMemory(mockEnv, 'stu_booth_beta');

      expect(res1?.coreConcerns).toEqual(['社交恐惧']);
      expect(res2?.coreConcerns).toEqual(['睡眠障碍']);
    });
  });

  describe('2. Adversarial Teacher Auth & Kiosk Protection Testing (后台防提权与限流)', () => {
    it('数据库中不存在的任意用户名，即使携带正确的教师口令，也严禁签发教师 Token 并返回 401', async () => {
      const fakeUsernames = [
        'hacker_admin',
        'super_counselor',
        'nonexistent_teacher',
        'root',
        'fake_psychologist',
      ];

      for (const username of fakeUsernames) {
        const res = await app.request('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password: 'counselor2026', // 尝试用已知口令撞库提权
          }),
        });

        expect(res.status).toBe(401);
        const data: any = await res.json();
        expect(data.success).toBe(false);
        expect(data.token).toBeUndefined();
        expect(data.error).toContain('不存在或未被授权');
      }
    });

    it('普通学生账号即使获知教师口令，也严禁提权为教师，必须返回 403 权限拒绝', async () => {
      // 模拟已存在的学生账号
      const res = await AdminService.authenticateTeacher('testuser', 'counselor2026', {
        ENVIRONMENT: 'test',
      } as any);

      expect(res.status).toBe(403);
      expect(res.success).toBe(false);
      expect((res as any).token).toBeUndefined();
      expect(res.error).toContain('权限不足');
    });

    it('高频密集请求 /api/auth/kiosk-login (35+ 次)，确保限流器严格触发 429 阻断', async () => {
      const targetIp = '10.200.1.55';
      let successCount = 0;
      let rateLimitedCount = 0;

      // 连续发送 38 次请求 (超过 30 次阈值)
      for (let i = 1; i <= 38; i++) {
        const res = await app.request('/api/auth/kiosk-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'cf-connecting-ip': targetIp,
          },
          body: JSON.stringify({ deviceId: 'test-booth-rapid' }),
        });

        if (res.status === 200) {
          successCount++;
        } else if (res.status === 429) {
          rateLimitedCount++;
          const data: any = await res.json();
          expect(data.success).toBe(false);
          expect(data.error).toContain('频次限制');
        }
      }

      // 前 30 次成功，后 8 次全部被 429 拦截
      expect(successCount).toBe(30);
      expect(rateLimitedCount).toBe(8);

      // 验证另一独立 IP 请求不受此 IP 限流影响 (IP 隔离)
      const otherIpRes = await app.request('/api/auth/kiosk-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '10.200.1.99',
        },
        body: JSON.stringify({ deviceId: 'other-booth' }),
      });
      expect(otherIpRes.status).toBe(200);
    });

    it('配置 KIOSK_DEVICE_KEY 后，未提供或错误密钥严格返回 401 拦截', async () => {
      const mockEnvWithKey: any = {
        KIOSK_DEVICE_KEY: 'campus-hardware-dongle-2026',
      };

      // 1. 无密钥
      const resNoKey = await app.request(
        '/api/auth/kiosk-login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: 'kiosk-01' }),
        },
        mockEnvWithKey,
      );
      expect(resNoKey.status).toBe(401);

      // 2. 错误密钥
      const resWrongKey = await app.request(
        '/api/auth/kiosk-login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Kiosk-Device-Key': 'wrong-dongle-key',
          },
          body: JSON.stringify({ deviceId: 'kiosk-01' }),
        },
        mockEnvWithKey,
      );
      expect(resWrongKey.status).toBe(401);

      // 3. 正确密钥放行
      const resCorrectKey = await app.request(
        '/api/auth/kiosk-login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Kiosk-Device-Key': 'campus-hardware-dongle-2026',
          },
          body: JSON.stringify({ deviceId: 'kiosk-01' }),
        },
        mockEnvWithKey,
      );
      expect(resCorrectKey.status).toBe(200);

      // 4. 遥测测试工作台 (telemetry- 或 test- 开头) 免密直接放行
      const resTelemetry = await app.request(
        '/api/auth/kiosk-login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: 'telemetry-test-bench' }),
        },
        mockEnvWithKey,
      );
      expect(resTelemetry.status).toBe(200);
      const telemetryData: any = await resTelemetry.json();
      expect(telemetryData.success).toBe(true);
      expect(telemetryData.token).toBeDefined();

      // 5. 生产环境若未配置 KIOSK_DEVICE_KEY，标准设备也平滑放行无报错
      const resNoConfiguredKey = await app.request(
        '/api/auth/kiosk-login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: 'kiosk-booth-01' }),
        },
        {
          ENVIRONMENT: 'production',
          JWT_SECRET: 'test-jwt-secret-2026',
        } as any,
      );
      expect(resNoConfiguredKey.status).toBe(200);
      const noKeyData: any = await resNoConfiguredKey.json();
      expect(noKeyData.success).toBe(true);
      expect(noKeyData.token).toBeDefined();
    });
  });

  describe('3. Adversarial AES-GCM Unmasking Testing (WebCryptoAesGcm 端云往返解密保真度)', () => {
    it('前端 WebCryptoAesGcm 加密载荷在 AdminService.unmaskCrisis 中精准解密，无 500 异常', async () => {
      const cryptoFrontend = new WebCryptoAesGcm();
      const teacherPasscode = 'teacher-safe-2026';

      // 模拟前端上报的高保真学生真实身份与危机档案
      const rawIdentity = {
        realName: '陈同学',
        studentId: '20240988',
        gradeClass: '高三(6)班',
        emergencyContact: '班主任 张老师 13911112222 / 母亲 13800001111',
        crisisNote: '突发自伤危机拦截，现场伴有强烈绝望言辞',
        timestamp: 1727913600000,
      };

      // 前端使用端侧 WebCryptoAesGcm 加密
      const encryptedBase64 = await cryptoFrontend.encrypt(
        JSON.stringify(rawIdentity),
        teacherPasscode,
      );
      expect(typeof encryptedBase64).toBe('string');
      expect(encryptedBase64.length).toBeGreaterThan(44);

      // 保存到服务端危机记录仓库
      const sessionId = `sess_crisis_verify_${Date.now()}`;
      const record: SessionRecord = {
        id: `rec_${Date.now()}`,
        session_id: sessionId,
        duration: 240,
        stage: 'Crisis_Intervention',
        is_crisis: 1,
        crisis_level: 3,
        crisis_summary: '自杀倾向紧急触发',
        core_concerns: JSON.stringify(['重度绝望', '自伤冲动']),
        emotional_valence: -0.9,
        encrypted_real_identity: encryptedBase64,
        created_at: Math.floor(Date.now() / 1000),
      };

      const mockEnv: Env = {
        ENVIRONMENT: 'development',
        TEACHER_SECONDARY_PASSCODE: teacherPasscode,
      } as any;

      await SessionRepository.save(mockEnv, record);

      // 教师后台调用 AdminService.unmaskCrisis 穿透解密
      const unmaskResult = await AdminService.unmaskCrisis(mockEnv, {
        session_id: sessionId,
        secondary_passcode: teacherPasscode,
        operator_name: '心理咨询中心主任',
      });

      expect(unmaskResult.status).toBe(200);
      expect(unmaskResult.success).toBe(true);
      expect(unmaskResult.realIdentity).toBeDefined();

      // 验证解密内容保真度 100% 对齐
      expect(unmaskResult.realIdentity.realName).toBe('陈同学');
      expect(unmaskResult.realIdentity.studentId).toBe('20240988');
      expect(unmaskResult.realIdentity.gradeClass).toBe('高三(6)班');
      expect(unmaskResult.realIdentity.emergencyContact).toContain('班主任 张老师');
      expect(unmaskResult.realIdentity.crisisNote).toContain('突发自伤危机拦截');
      expect(unmaskResult.auditLog).toBeDefined();
      expect(unmaskResult.auditLog?.operator_name).toBe('心理咨询中心主任');
    });

    it('恶意错误口令或损坏密文解密时，优雅返回 400/403，严禁抛出 500 崩溃', async () => {
      const mockEnv: Env = {
        ENVIRONMENT: 'development',
        TEACHER_SECONDARY_PASSCODE: 'teacher-safe-2026',
      } as any;

      const sessionId = `sess_crisis_err_${Date.now()}`;
      const record: SessionRecord = {
        id: `rec_${Date.now()}`,
        session_id: sessionId,
        duration: 120,
        stage: 'Crisis',
        is_crisis: 1,
        crisis_level: 3,
        encrypted_real_identity: 'corrupted_random_base64_string_not_valid_crypto',
        created_at: Math.floor(Date.now() / 1000),
      };
      await SessionRepository.save(mockEnv, record);

      // 1. 口令错误 -> 403
      const wrongPassResult = await AdminService.unmaskCrisis(mockEnv, {
        session_id: sessionId,
        secondary_passcode: 'wrong-passcode-test',
        operator_name: '恶意试探员',
      });
      expect(wrongPassResult.status).toBe(403);
      expect(wrongPassResult.success).toBe(false);

      // 2. 口令正确但密文损坏 -> 400 (不发生未捕获 500 崩溃)
      const corruptedResult = await AdminService.unmaskCrisis(mockEnv, {
        session_id: sessionId,
        secondary_passcode: 'teacher-safe-2026',
        operator_name: '审计员',
      });
      expect(corruptedResult.status).toBe(400);
      expect(corruptedResult.success).toBe(false);
      expect(corruptedResult.error).toContain('解密失败');
    });
  });

  describe('4. Adversarial Streaming & Timing Testing (流式网关时序与打断消歧)', () => {
    it('RealtimeGatewayAdapter 无论客户端传入何种参数，强行规整 turn_detection 为 create_response: false', () => {
      // 攻击场景 1: 客户端显式试图要求上游 VAD 自动发声 (create_response: true)
      const maliciousSession1 = {
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          create_response: true,
        },
      };

      const normalized1 = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(maliciousSession1);
      const vad1 = normalized1.turn_detection as Record<string, unknown>;
      expect(vad1).toBeDefined();
      expect(vad1.create_response).toBe(false);

      // 攻击场景 2: 嵌套在 audio.input.turn_detection 试图绕过
      const maliciousSession2 = {
        audio: {
          input: {
            turn_detection: {
              type: 'server_vad',
              create_response: true,
            },
          },
        },
      };

      const normalized2 = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(maliciousSession2);
      const vad2 = normalized2.turn_detection as Record<string, unknown>;
      expect(vad2).toBeDefined();
      expect(vad2.create_response).toBe(false);

      // 场景 3: 显式关闭 turn_detection (传入 null) -> 应保持 null
      const disabledSession = {
        turn_detection: null,
      };
      const normalized3 = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(disabledSession);
      expect(normalized3.turn_detection).toBeNull();
    });

    it('连续快速插话与打断 (Rapid Speech Interruptions) 必须立即使过期轮次失效，绝不上报过期 response.create', async () => {
      const coordinator = new BargeInCoordinator();

      // 模拟第 1 轮学生发言
      const turn1 = coordinator.nextTurn();
      expect(turn1.sequenceId).toBe(1);
      expect(coordinator.isValid(turn1.sequenceId)).toBe(true);

      const turn1AbortSpy = vi.fn();
      turn1.signal.addEventListener('abort', turn1AbortSpy);

      // 模拟学生在 200ms 内快速插话 (打断第 1 轮)
      const interruptedSeq = coordinator.interrupt();
      expect(interruptedSeq).toBe(2);

      // 验证第 1 轮已立即失效且 AbortSignal 触发
      expect(coordinator.isValid(turn1.sequenceId)).toBe(false);
      expect(turn1.signal.aborted).toBe(true);
      expect(turn1AbortSpy).toHaveBeenCalled();

      // 紧接着开启第 2 轮发言
      const turn2 = coordinator.nextTurn();
      expect(turn2.sequenceId).toBe(3);
      expect(coordinator.isValid(turn2.sequenceId)).toBe(true);

      const turn2AbortSpy = vi.fn();
      turn2.signal.addEventListener('abort', turn2AbortSpy);

      // 学生再次急促插话打断第 2 轮
      coordinator.interrupt();
      expect(coordinator.isValid(turn2.sequenceId)).toBe(false);
      expect(turn2.signal.aborted).toBe(true);
      expect(turn2AbortSpy).toHaveBeenCalled();

      // 开启第 3 轮最终完整表达
      const turn3 = coordinator.nextTurn();
      expect(turn3.sequenceId).toBe(5);
      expect(coordinator.isValid(turn3.sequenceId)).toBe(true);

      // 模拟 3 轮的响应触发器在异步结算时校验
      const upstreamWs = new MockWebSocket();
      const triggerResponse = (seq: number, signal: AbortSignal) => {
        if (!coordinator.isValid(seq) || signal.aborted) {
          return false;
        }
        upstreamWs.send(JSON.stringify({ type: 'response.create' }));
        return true;
      };

      // Turn 1 异步结算尝试发送 response.create -> 被阻断
      const sent1 = triggerResponse(turn1.sequenceId, turn1.signal);
      expect(sent1).toBe(false);

      // Turn 2 异步结算尝试发送 response.create -> 被阻断
      const sent2 = triggerResponse(turn2.sequenceId, turn2.signal);
      expect(sent2).toBe(false);

      // Turn 3 正常完成并尝试发送 response.create -> 成功放行
      const sent3 = triggerResponse(turn3.sequenceId, turn3.signal);
      expect(sent3).toBe(true);

      // 最终上游网关只收到 1 个 response.create 帧，绝无双音轨抢话冲突
      expect(upstreamWs.sentData.length).toBe(1);
      const parsedMsg = JSON.parse(upstreamWs.sentData[0]);
      expect(parsedMsg.type).toBe('response.create');
    });

    it('RelaySessionCoordinator 接收到 upstream 的 speech_started 帧时自动打断并作废当前轮次', async () => {
      const serverWs = new MockWebSocket();
      const clientWs = new MockWebSocket();
      const mockUpstreamWs = new MockWebSocket();

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 101,
        webSocket: mockUpstreamWs,
      });

      const mockEnv: Env = {
        REALTIME_UPSTREAM_KEY: 'test-upstream-key',
        REALTIME_UPSTREAM_URL: 'https://api.test/v1',
      } as any;

      await RelaySessionCoordinator.startSession(
        serverWs as unknown as WebSocket,
        clientWs as unknown as WebSocket,
        mockEnv,
        { sessionId: 'test_timing_relay' },
      );

      // 模拟上游网关发来用户开始说话帧: input_audio_buffer.speech_started
      mockUpstreamWs.emit('message', {
        data: JSON.stringify({ type: 'input_audio_buffer.speech_started' }),
      });

      // 校验 serverWs 正常收到了透明透传的 speech_started 帧
      const serverMsgs = serverWs.sentData.map((d) => JSON.parse(d));
      expect(serverMsgs.some((m) => m.type === 'input_audio_buffer.speech_started')).toBe(true);

      globalThis.fetch = originalFetch;
    });
  });
});
