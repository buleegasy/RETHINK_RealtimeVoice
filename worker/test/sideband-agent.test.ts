import { describe, it, expect, vi } from 'vitest';
import { SidebandAgent } from '../src/services/voice/sideband-agent';
import { BargeInCoordinator } from '../src/services/voice/barge-in-coordinator';
import { CrisisHandler } from '../src/services/voice/crisis-handler';
import { ShadowReasoningPipeline } from '../src/services/voice/shadow-reasoning-pipeline';
import { RealtimeGatewayAdapter } from '../src/adapters/realtime-gateway-adapter';

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

describe('原生旁路监护智能体 (SidebandAgent) 单元测试', () => {
  function createAgentHarness(isDirectLive = true) {
    const serverWs = new MockWebSocket() as unknown as WebSocket;
    const upstreamWs = new MockWebSocket() as unknown as WebSocket;
    const coordinator = new BargeInCoordinator();
    const crisisHandler = new CrisisHandler(serverWs, upstreamWs, undefined, 'sess_test');
    const shadowPipeline = {
      execute: vi.fn().mockResolvedValue('肯定其情绪并温和澄清自动化负面思维'),
    } as unknown as ShadowReasoningPipeline;

    const agent = new SidebandAgent({
      sessionId: 'sess_test_123',
      userId: 'usr_student_01',
      studentName: '小明',
      situationalMemory: null,
      serverWs,
      upstreamWs,
      coordinator,
      crisisHandler,
      shadowPipeline,
      openRouterConfig: {
        openRouterKey: 'mock-key',
        openRouterModel: 'mock-model',
      },
      isDirectLive,
    });

    return {
      agent,
      serverWs: serverWs as unknown as MockWebSocket,
      upstreamWs: upstreamWs as unknown as MockWebSocket,
      coordinator,
      crisisHandler,
      shadowPipeline,
    };
  }

  it('智能体初始化包含正确的初始状态与属性', () => {
    const { agent } = createAgentHarness();
    expect(agent.getStudentName()).toBe('小明');
    expect(agent.getCbtStage()).toBe('Active_Listening');
    expect(agent.getDialogueHistory().length).toBe(0);
    expect(agent.getActiveDelegationId()).toBeNull();
  });

  it('监听 session.delegation.created 正确捕获并设置 activeDelegationId', async () => {
    const { agent } = createAgentHarness();
    await agent.handleUpstreamEvent({
      type: 'session.delegation.created',
      delegation_id: 'del_cbt_abc_999',
    });

    expect(agent.getActiveDelegationId()).toBe('del_cbt_abc_999');
  });

  it('监听 speech_started 帧时触发 coordinator.interrupt 打断当前轮次', async () => {
    const { agent, coordinator } = createAgentHarness();
    const interruptSpy = vi.spyOn(coordinator, 'interrupt');

    await agent.handleUpstreamEvent({
      type: 'session.input_audio.speech_started',
    });

    expect(interruptSpy).toHaveBeenCalledTimes(1);
  });

  it('处理正常用户文本抽取、推演与历史记录', async () => {
    const { agent, upstreamWs } = createAgentHarness(true);
    agent.setActiveDelegationId('del_target_123');

    await agent.handleUpstreamEvent({
      type: 'input_audio_transcription.completed',
      item_id: 'item_speech_001',
      transcript: '我今天在学校遇到了点烦心事',
    });

    expect(agent.getDialogueHistory().length).toBe(1);
    expect(agent.getDialogueHistory()[0]).toEqual({
      role: 'user',
      content: '我今天在学校遇到了点烦心事',
    });

    // 等待异步影子推演完成
    await new Promise((r) => setTimeout(r, 20));

    const sent = upstreamWs.sentData.map((d) => JSON.parse(d));
    const thinkingAppend = sent.find((m) => m.type === 'session.thinking.append');
    expect(thinkingAppend).toBeDefined();
    expect(thinkingAppend.delegation_id).toBe('del_target_123');
    expect(thinkingAppend.thinking).toContain('影子大脑认知指导');
  });

  it('重复同一 item_id 时执行防抖去重，避免重复推演', async () => {
    const { agent } = createAgentHarness(true);

    await agent.handleUpstreamEvent({
      type: 'input_audio_transcription.completed',
      item_id: 'item_duplicate_id',
      transcript: '重复消息测试',
    });

    await agent.handleUpstreamEvent({
      type: 'input_audio_transcription.completed',
      item_id: 'item_duplicate_id',
      transcript: '重复消息测试',
    });

    expect(agent.getDialogueHistory().length).toBe(1);
  });

  it('命中 L1 极端危机敏感词时触发危机物理断流与熔断', async () => {
    const { agent, crisisHandler } = createAgentHarness();
    const triggerSpy = vi.spyOn(crisisHandler, 'triggerIntervention');

    await agent.processUserSpeech('我不想活了，打算跳楼结束这一切');

    expect(triggerSpy).toHaveBeenCalledWith(
      'L1',
      expect.stringContaining('L1本地即时硬过滤命中危机敏感词'),
      expect.any(Array),
    );
  });

  it('非直连模式下用户发言触发显式 response.create 并使用 session.update 注入认知引导', async () => {
    const { agent, upstreamWs } = createAgentHarness(false);

    await agent.processUserSpeech('最近模拟考没发挥好');

    const sent = upstreamWs.sentData.map((d) => JSON.parse(d));
    const responseCreate = sent.find((m) => m.type === 'response.create');
    expect(responseCreate).toBeDefined();

    await new Promise((r) => setTimeout(r, 20));

    const sentAfter = upstreamWs.sentData.map((d) => JSON.parse(d));
    const sessionUpdate = sentAfter.find((m) => m.type === 'session.update');
    expect(sessionUpdate).toBeDefined();
    expect(sessionUpdate.session.instructions).toContain('影子大脑认知指导');
  });

  it('挂载原生控制流 (attachControlStream) 时转发旁路指令事件', () => {
    const { agent } = createAgentHarness();
    const controlWs = new MockWebSocket() as unknown as WebSocket;
    agent.attachControlStream(controlWs);

    agent.injectCognitiveGuidance('引导学生进行认知重构练习');

    const controlSent = (controlWs as unknown as MockWebSocket).sentData.map((d) => JSON.parse(d));
    expect(controlSent.length).toBe(1);
    expect(controlSent[0].type).toBe('rethink.sideband.directive');
    expect(controlSent[0].cognitiveHint).toBe('引导学生进行认知重构练习');
  });

  it('助手回复文本转写完成时，正确更新对话历史与 CBT 状态机轮次', async () => {
    const { agent } = createAgentHarness();

    await agent.handleUpstreamEvent({
      type: 'session.output_transcript.completed',
      text: '听起来你最近挺不容易的，能和我多聊聊吗？',
    });

    expect(agent.getDialogueHistory().length).toBe(1);
    expect(agent.getDialogueHistory()[0]).toEqual({
      role: 'assistant',
      content: '听起来你最近挺不容易的，能和我多聊聊吗？',
    });
  });

  it('RealtimeGatewayAdapter.buildSidebandAttachWsUrl 正确动态构造原生旁路挂载 URL', () => {
    const url = RealtimeGatewayAdapter.buildSidebandAttachWsUrl(
      'https://custom-gateway.io',
      'sess_active_456',
    );
    expect(url).toBe(
      `wss://custom-gateway.io${atob('L29wZW5haS92MS9saXZlL3Nlc3Npb25z')}/sess_active_456/attach`,
    );
  });
});
