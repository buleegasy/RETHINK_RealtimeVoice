import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealtimeGatewayAdapter } from '../src/adapters/realtime-gateway-adapter';
import { CrisisHandler } from '../src/services/voice/crisis-handler';
import { BargeInCoordinator } from '../src/services/voice/barge-in-coordinator';
import { RelaySessionCoordinator } from '../src/services/voice/relay-session-coordinator';
import { ShadowReasoningPipeline } from '../src/services/voice/shadow-reasoning-pipeline';
// @ts-expect-error Functions API is a JS module in Cloudflare Pages
import { onRequest as pagesOnRequest } from '../../functions/api/[[path]].js';

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

// 确保测试环境中存在标准 WebSocket 常量与 WebSocketPair
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

(globalThis as any).WebSocketPair = class {
  0 = new MockWebSocket();
  1 = new MockWebSocket();
};

describe('R3 流式时序协同与 Server VAD 抢话防护 (Streaming Timing & VAD)', () => {
  it('RealtimeGatewayAdapter.resolveTurnDetection 必须强制规整为 create_response: false', () => {
    // 即使客户端传入 create_response: true
    const payloadWithTrue = {
      turn_detection: {
        type: 'server_vad',
        threshold: 0.6,
        prefix_padding_ms: 200,
        silence_duration_ms: 500,
        create_response: true,
      },
    };

    const cleanSession = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(payloadWithTrue);
    const vad = cleanSession.turn_detection as Record<string, unknown>;

    expect(vad).toBeDefined();
    expect(vad.type).toBe('server_vad');
    expect(vad.threshold).toBe(0.6);
    expect(vad.prefix_padding_ms).toBe(200);
    expect(vad.silence_duration_ms).toBe(500);
    expect(vad.create_response).toBe(false);
  });

  it('RealtimeGatewayAdapter 处理 audio.input.turn_detection 同样输出 create_response: false', () => {
    const payloadAudioInput = {
      audio: {
        input: {
          turn_detection: {
            threshold: 0.4,
          },
        },
      },
    };

    const cleanSession = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(payloadAudioInput);
    const vad = cleanSession.turn_detection as Record<string, unknown>;

    expect(vad).toBeDefined();
    expect(vad.create_response).toBe(false);
  });

  it('BargeInCoordinator 在打断时立即使当前轮次 sequenceId 失效并触发 abort', () => {
    const coordinator = new BargeInCoordinator();
    const turn1 = coordinator.nextTurn();
    expect(coordinator.isValid(turn1.sequenceId)).toBe(true);

    const abortSpy = vi.fn();
    turn1.signal.addEventListener('abort', abortSpy);

    // 模拟学生插话打断
    coordinator.interrupt();

    expect(coordinator.isValid(turn1.sequenceId)).toBe(false);
    expect(turn1.signal.aborted).toBe(true);
    expect(abortSpy).toHaveBeenCalled();
  });
});

describe('R3 危机物理断流与 WebSocket 关断闭环 (Crisis Cutoff)', () => {
  it('CrisisHandler.triggerIntervention 触发时必须显式关闭 serverWs 与 upstreamWs', () => {
    const serverWs = new MockWebSocket() as unknown as WebSocket;
    const upstreamWs = new MockWebSocket() as unknown as WebSocket;

    const handler = new CrisisHandler(serverWs, upstreamWs, undefined, 'sess_test_crisis_close');

    expect((serverWs as any).closed).toBe(false);
    expect((upstreamWs as any).closed).toBe(false);

    handler.triggerIntervention('L1', '触发自杀自伤拦截', ['自杀危机']);

    expect(handler.isTriggered).toBe(true);
    expect((upstreamWs as any).closed).toBe(true);
    expect((serverWs as any).closed).toBe(true);
    expect((upstreamWs as any).closeCode).toBe(1000);
    expect((serverWs as any).closeCode).toBe(1000);

    // 检查 serverWs 收到 rethink.crisis_intercepted 帧
    const serverMsgs = (serverWs as any).sentData.map((d: string) => JSON.parse(d));
    const crisisMsg = serverMsgs.find((m: any) => m.type === 'rethink.crisis_intercepted');
    expect(crisisMsg).toBeDefined();
    expect(crisisMsg.tier).toBe('L1');

    // 检查 upstreamWs 收到 response.cancel 帧
    const upstreamMsgs = (upstreamWs as any).sentData.map((d: string) => JSON.parse(d));
    const cancelMsg = upstreamMsgs.find((m: any) => m.type === 'response.cancel');
    expect(cancelMsg).toBeDefined();
  });
});

describe('R3 Cloudflare Pages Functions WebSocket 101 代理 (Edge Proxy)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('携带 Upgrade: websocket 时返回 101 响应并包含 client WebSocket', async () => {
    const mockUpstreamWs = new MockWebSocket();
    const mockUpstreamResponse = {
      status: 101,
      webSocket: mockUpstreamWs,
    };

    globalThis.fetch = vi.fn().mockResolvedValue(mockUpstreamResponse);

    const request = new Request('https://campus-mind.pages.dev/api/voice/ws', {
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
      },
    });

    const context = {
      request,
      env: {
        WORKER_ORIGIN: 'https://rethink-worker.internal',
      },
    };

    const res = await pagesOnRequest(context);

    expect(res.status).toBe(101);
    expect((res as any).webSocket).toBeDefined();
  });

  it('非 websocket 请求透明转发至 app.fetch', async () => {
    const request = new Request('https://campus-mind.pages.dev/api/health', {
      method: 'GET',
    });

    const context = {
      request,
      env: {},
    };

    const res = await pagesOnRequest(context);
    expect(res).toBeDefined();
  });
});

describe('R3 影子大脑单轮纯净认知注入与堆叠污染消除 (No System Prompt History Stacking)', () => {
  it('ShadowReasoningPipeline.execute 返回纯净指令，绝不对上游 WebSocket 注入 conversation.item.create 帧', async () => {
    const mockUpstreamWs = new MockWebSocket() as unknown as WebSocket;
    const env = { EMBEDDING_API_KEY: 'test-emb' } as any;
    const config = {
      upstreamKey: 'test-up',
      openRouterKey: '',
      openRouterModel: 'test-model',
    };

    const pipeline = new ShadowReasoningPipeline(env, config);
    const controller = new AbortController();

    const hint = await pipeline.execute({
      userText: '模考考砸了，我很焦虑',
      dialogueHistory: [],
      studentName: '小明',
      situationalMemory: null,
      signal: controller.signal,
      isTurnValid: () => true,
    });

    // 验证返回策略提示词且 upstreamWs sentData 保持为 0，杜绝 system 消息堆叠污染
    expect(hint).toBeDefined();
    expect(typeof hint).toBe('string');
    expect((mockUpstreamWs as any).sentData.length).toBe(0);
  });

  it('RelaySessionCoordinator.triggerTurnResponse 将认知引导内联注入 response.create 单轮指令中', () => {
    const mockUpstreamWs = new MockWebSocket() as unknown as WebSocket;
    const coordinator = new BargeInCoordinator();
    const turn = coordinator.nextTurn();

    const cognitiveHint = '肯定其焦虑情绪，引导其区分现实事实与主观推论';
    (RelaySessionCoordinator as any).triggerTurnResponse(
      mockUpstreamWs,
      coordinator,
      turn.sequenceId,
      turn.signal,
      cognitiveHint,
    );

    expect((mockUpstreamWs as any).sentData.length).toBe(1);
    const sent = JSON.parse((mockUpstreamWs as any).sentData[0]);
    expect(sent.type).toBe('response.create');
    expect(sent.response?.instructions).toBeDefined();
    expect(sent.response.instructions).toContain(cognitiveHint);
    expect(sent.response.instructions).toContain('语速稍快轻快利落');
    expect(sent.response.instructions).toContain('严格控制在 1-2 句话内');
  });

  it('超时降级或无引导时，triggerTurnResponse 发送纯净默认 response.create', () => {
    const mockUpstreamWs = new MockWebSocket() as unknown as WebSocket;
    const coordinator = new BargeInCoordinator();
    const turn = coordinator.nextTurn();

    (RelaySessionCoordinator as any).triggerTurnResponse(
      mockUpstreamWs,
      coordinator,
      turn.sequenceId,
      turn.signal,
      null,
    );

    expect((mockUpstreamWs as any).sentData.length).toBe(1);
    const sent = JSON.parse((mockUpstreamWs as any).sentData[0]);
    expect(sent.type).toBe('response.create');
    expect(sent.response).toBeUndefined();
  });

  it('coordinateShadowTurn 在超时 (800ms) 触发后，迟到的影子结果被互斥锁阻断，不产生二次发送', async () => {
    const mockUpstreamWs = new MockWebSocket() as unknown as WebSocket;
    const coordinator = new BargeInCoordinator();
    const turn = coordinator.nextTurn();

    // 模拟一个需要 1200ms 的慢速影子管道
    const slowPipeline = {
      execute: vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('迟到的指导'), 1200)),
        ),
    } as unknown as ShadowReasoningPipeline;

    vi.useFakeTimers();

    (RelaySessionCoordinator as any).coordinateShadowTurn({
      shadowPipeline: slowPipeline,
      upstreamWs: mockUpstreamWs,
      coordinator,
      currentSeq: turn.sequenceId,
      signal: turn.signal,
      userText: '慢速测试',
      dialogueHistory: [],
      studentName: '',
      situationalMemory: null,
      getStudentName: () => '',
      setStudentName: () => {},
    });

    // 快进 850ms（超过 800ms 超时）
    await vi.advanceTimersByTimeAsync(850);

    // 应该已经降级发送了默认 response.create
    expect((mockUpstreamWs as any).sentData.length).toBe(1);
    const firstSent = JSON.parse((mockUpstreamWs as any).sentData[0]);
    expect(firstSent.type).toBe('response.create');
    expect(firstSent.response).toBeUndefined();

    // 继续快进至 1500ms（慢速影子管道结算）
    await vi.advanceTimersByTimeAsync(650);

    // 互斥锁生效：上游网关数据帧数仍保持为 1，绝不重复发送带 instructions 的帧
    expect((mockUpstreamWs as any).sentData.length).toBe(1);

    vi.useRealTimers();
  });
});
