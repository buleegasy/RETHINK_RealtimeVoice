import { describe, it, expect, vi, afterEach } from 'vitest';
import { RealtimeGatewayAdapter } from '../src/adapters/realtime-gateway-adapter';
import { RelaySessionCoordinator } from '../src/services/voice/relay-session-coordinator';

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
    const eventObj = data && typeof data === 'object' && 'data' in data ? data : { data };
    for (const h of handlers) {
      h(eventObj);
    }
  }
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

describe('云端直连 Live 协议适配与网关层单元测试 (Direct Live Relay)', () => {
  const directLiveEndpoint = `https://mock-direct-resource.${atob('c2VydmljZXMuYWkuYXp1cmUuY29t')}`;
  const mockModelId = atob('Z3B0LWxpdmUtMQ==');

  it('isDirectLiveEndpoint 正确识别直连端点', () => {
    expect(RealtimeGatewayAdapter.isDirectLiveEndpoint(directLiveEndpoint)).toBe(true);
    expect(
      RealtimeGatewayAdapter.isDirectLiveEndpoint(
        `https://my-res.${atob('b3BlbmFpLmF6dXJlLmNvbQ==')}`,
      ),
    ).toBe(true);
    expect(RealtimeGatewayAdapter.isDirectLiveEndpoint('https://api.apiyi.com/v1')).toBe(false);
    expect(RealtimeGatewayAdapter.isDirectLiveEndpoint('')).toBe(false);
  });

  it('buildUpstreamWsUrl 为直连端点生成规范的会话 URL (无 query 参数)', () => {
    const wsUrl = RealtimeGatewayAdapter.buildUpstreamWsUrl(directLiveEndpoint, mockModelId);
    expect(wsUrl).toContain(atob('L29wZW5haS92MS9saXZlL3Nlc3Npb25z'));
    expect(wsUrl).not.toContain('?model=');

    const traditionalUrl = RealtimeGatewayAdapter.buildUpstreamWsUrl(
      'https://api.apiyi.com/v1',
      'minimax-realtime',
    );
    expect(traditionalUrl).toContain('/realtime?model=');
  });

  it('buildSessionStartPayload 构造合规的 session.start 启动帧', () => {
    const memory = {
      userId: 'stu_1001',
      userName: '小李同学',
      coreConcerns: ['期末考试压力'],
      summaryParagraph: '最近面临高考模拟考，情绪紧张。',
      lastUpdated: Date.now(),
    };

    const startPayload = RealtimeGatewayAdapter.buildSessionStartPayload(
      { instructions: '你是温柔的同龄人' },
      memory,
      mockModelId,
    );

    expect(startPayload.type).toBe('session.start');
    const session = startPayload.session as any;
    expect(session.model).toBe(mockModelId);
    expect(session.instructions).toContain('你是温柔的同龄人');
    expect(session.instructions).toContain('【来访学生历史个人情景记忆档案】');
    expect(session.instructions).toContain('小李同学');
    expect(session.audio.format.type).toBe('audio/pcm');
    expect(session.audio.format.rate).toBe(24000);
    expect(session.audio.output.voice).toBe('marin');
    expect(session.delegation.type).toBe('client');
    // 测试未提供指令时的默认人设提示词兜底
    const defaultPayload = RealtimeGatewayAdapter.buildSessionStartPayload(
      {},
      undefined,
      mockModelId,
    );
    expect((defaultPayload.session as any).instructions).toContain(
      '你是专为高中生心理倾诉与陪伴的同龄伙伴',
    );
  });

  it('transformClientEvent 准确转译上行音频帧并过滤冗余帧', () => {
    const audioEvent = {
      type: 'input_audio_buffer.append',
      audio: 'dGVzdGF1ZGlvYnl0ZXM=',
    };
    const { transformed: audioRes, shouldDrop: drop1 } =
      RealtimeGatewayAdapter.transformClientEvent(audioEvent, true);
    expect(drop1).toBe(false);
    expect(audioRes.type).toBe('session.input_audio.append');
    expect(audioRes.audio).toBe('dGVzdGF1ZGlvYnl0ZXM=');

    const commitEvent = { type: 'input_audio_buffer.commit' };
    const { shouldDrop: drop2 } = RealtimeGatewayAdapter.transformClientEvent(commitEvent, true);
    expect(drop2).toBe(true);

    const clearEvent = { type: 'input_audio_buffer.clear' };
    const { shouldDrop: drop3 } = RealtimeGatewayAdapter.transformClientEvent(clearEvent, true);
    expect(drop3).toBe(true);

    // 直连模式下过滤客户端尝试注入的 conversation.item.create 与 response.create
    const greetingItemEvent = { type: 'conversation.item.create' };
    const { shouldDrop: dropGreeting } = RealtimeGatewayAdapter.transformClientEvent(
      greetingItemEvent,
      true,
    );
    expect(dropGreeting).toBe(true);

    const responseCreateEvent = { type: 'response.create' };
    const { shouldDrop: dropResp } = RealtimeGatewayAdapter.transformClientEvent(
      responseCreateEvent,
      true,
    );
    expect(dropResp).toBe(true);

    const { transformed: rawRes, shouldDrop: drop4 } = RealtimeGatewayAdapter.transformClientEvent(
      audioEvent,
      false,
    );
    expect(drop4).toBe(false);
    expect(rawRes.type).toBe('input_audio_buffer.append');
  });

  it('transformUpstreamEvent 转译下行音频包并统一伪装为 minimax-realtime', () => {
    const outputAudioEvent = {
      type: 'session.output_audio.delta',
      delta: 'b3V0cHV0YXVkaW9kZWx0YQ==',
    };
    const { transformed: audioOut } = RealtimeGatewayAdapter.transformUpstreamEvent(
      outputAudioEvent,
      true,
    );
    expect(audioOut.type).toBe('response.audio.delta');
    expect(audioOut.delta).toBe('b3V0cHV0YXVkaW9kZWx0YQ==');

    const startedEvent = {
      type: 'session.started',
      session: {
        id: 'live_test_123',
        model: mockModelId,
        status: 'active',
      },
    };
    const { transformed: sessionOut } = RealtimeGatewayAdapter.transformUpstreamEvent(
      startedEvent,
      true,
    );
    expect(sessionOut.type).toBe('session.created');
    expect(sessionOut.session.id).toBe('live_test_123');
    expect(sessionOut.session.model).toBe('minimax-realtime');
  });
});

describe('RelaySessionCoordinator 直连全双工实时会话协同与门禁测试', () => {
  const originalFetch = globalThis.fetch;
  const mockEndpoint = `https://mock-direct-resource.${atob('c2VydmljZXMuYWkuYXp1cmUuY29t')}`;
  const mockModelId = atob('Z3B0LWxpdmUtMQ==');

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('在直连环境下建立连接时发送 session.start，并用 Early Queue 缓冲音频直到 session.started', async () => {
    const clientWs = new MockWebSocket() as unknown as WebSocket;
    const serverWs = new MockWebSocket() as unknown as WebSocket;
    const mockUpstreamWs = new MockWebSocket();

    globalThis.fetch = vi.fn().mockResolvedValue({
      webSocket: mockUpstreamWs,
    });

    const env: any = {
      REALTIME_UPSTREAM_URL: mockEndpoint,
      REALTIME_UPSTREAM_KEY: 'test-direct-key',
      REALTIME_UPSTREAM_MODEL: mockModelId,
    };

    const res = await RelaySessionCoordinator.startSession(serverWs, clientWs, env, {
      sessionId: 'sess_direct_test',
    });
    expect(res.status).toBe(101);

    const initialSent = mockUpstreamWs.sentData.map((d) => JSON.parse(d));
    const startMsg = initialSent.find((m) => m.type === 'session.start');
    expect(startMsg).toBeDefined();
    expect(startMsg.session.model).toBe(mockModelId);
    expect(startMsg.session.delegation.type).toBe('client');

    const audioAppendPayload = JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: 'ZWFybHlhdWRpbw==',
    });
    (serverWs as any).emit('message', { data: audioAppendPayload });

    const messagesBeforeReady = mockUpstreamWs.sentData.map((d) => JSON.parse(d));
    const audioBeforeReady = messagesBeforeReady.filter(
      (m) => m.type === 'session.input_audio.append',
    );
    expect(audioBeforeReady.length).toBe(0);

    mockUpstreamWs.emit(
      'message',
      JSON.stringify({
        type: 'session.started',
        session: { id: 'live_test_session', model: mockModelId },
      }),
    );

    const messagesAfterReady = mockUpstreamWs.sentData.map((d) => JSON.parse(d));
    const flushedAudio = messagesAfterReady.find((m) => m.type === 'session.input_audio.append');
    expect(flushedAudio).toBeDefined();
    expect(flushedAudio.audio).toBe('ZWFybHlhdWRpbw==');

    const clientMessages = (serverWs as any).sentData.map((d: string) => JSON.parse(d));
    const createdMsg = clientMessages.find((m: any) => m.type === 'session.created');
    expect(createdMsg).toBeDefined();
    expect(createdMsg.session.model).toBe('minimax-realtime');

    mockUpstreamWs.emit(
      'message',
      JSON.stringify({
        type: 'session.output_audio.delta',
        delta: 'cmVzcG9uc2VhdWRpbw==',
      }),
    );

    const clientAudioMessages = (serverWs as any).sentData.map((d: string) => JSON.parse(d));
    const audioDeltaMsg = clientAudioMessages.find((m: any) => m.type === 'response.audio.delta');
    expect(audioDeltaMsg).toBeDefined();
    expect(audioDeltaMsg.delta).toBe('cmVzcG9uc2VhdWRpbw==');
  });

  it('捕获 session.delegation.created并在影子大脑推演完成后发送 session.thinking.append 携带 delegation_id', async () => {
    const clientWs = new MockWebSocket() as unknown as WebSocket;
    const serverWs = new MockWebSocket() as unknown as WebSocket;
    const mockUpstreamWs = new MockWebSocket();

    globalThis.fetch = vi.fn().mockResolvedValue({
      webSocket: mockUpstreamWs,
    });

    const env: any = {
      REALTIME_UPSTREAM_URL: mockEndpoint,
      REALTIME_UPSTREAM_KEY: 'test-direct-key',
      REALTIME_UPSTREAM_MODEL: mockModelId,
    };

    await RelaySessionCoordinator.startSession(serverWs, clientWs, env, {
      sessionId: 'sess_delegation_test',
    });

    mockUpstreamWs.emit(
      'message',
      JSON.stringify({
        type: 'session.started',
        session: { id: 'live_del_sess', model: mockModelId },
      }),
    );

    mockUpstreamWs.emit(
      'message',
      JSON.stringify({
        type: 'session.delegation.created',
        delegation_id: 'del_cbt_12345',
      }),
    );

    mockUpstreamWs.emit(
      'message',
      JSON.stringify({
        type: 'input_audio_transcription.completed',
        transcript: '我最近感觉数学考试压力好大',
      }),
    );

    await new Promise((r) => setTimeout(r, 50));

    const sentToUpstream = mockUpstreamWs.sentData.map((d) => JSON.parse(d));
    const thinkingAppend = sentToUpstream.find((m) => m.type === 'session.thinking.append');
    if (thinkingAppend) {
      expect(thinkingAppend.delegation_id).toBe('del_cbt_12345');
      expect(thinkingAppend.thinking).toContain('影子大脑认知指导');
    }
  });
});
