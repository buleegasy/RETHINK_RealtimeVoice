import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useTelemetryStore } from '../src/store/telemetryStore';
import { useBoothStore } from '../src/store/boothStore';
import { useModeStore } from '../src/store/modeStore';
import { TestWorkbench } from '../src/components/test/TestWorkbench';

// Mock useVoiceSession hook
const mockStartCall = vi.fn();
const mockEndCall = vi.fn();
const mockInterrupt = vi.fn();
const mockToggleMute = vi.fn();

vi.mock('../src/hooks/useVoiceSession', () => ({
  useVoiceSession: () => ({
    startCall: mockStartCall,
    endCall: mockEndCall,
    interrupt: mockInterrupt,
    toggleMute: mockToggleMute,
  }),
}));

describe('遥测工作台与影子大脑数据流测试 (Telemetry Workbench & Shadow Engine)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTelemetryStore.getState().clearTelemetry();
    useBoothStore.setState({
      sessionStatus: 'idle',
      callDuration: 0,
      isMuted: false,
      cbtStage: 'Active_Listening',
      duplexPhase: 'idle',
    });
    useModeStore.getState().setRunMode('test');
  });

  it('useTelemetryStore 应正确聚合 RTT 历史与移动平均值', () => {
    const store = useTelemetryStore.getState();
    store.updateRtt(50);
    store.updateRtt(70);
    store.updateRtt(60);

    const state = useTelemetryStore.getState();
    expect(state.rttMs).toBe(60);
    expect(state.avgRttMs).toBe(60);
    expect(state.rttHistory).toEqual([50, 70, 60]);
  });

  it('useTelemetryStore 应正确记录影子大脑注入指令与耗时', () => {
    const store = useTelemetryStore.getState();
    store.addShadowDirective({
      turnSequence: 1,
      userText: '我最近模拟考考差了，感觉一切都完了。',
      cognitiveHint: '来访者存在灾难化思维，请以温柔平等的同理心接纳，引导其探索证据。',
      durationMs: 245,
      fallback: false,
      timestamp: Date.now(),
    });

    const state = useTelemetryStore.getState();
    expect(state.latestShadowDirective).not.toBeNull();
    expect(state.latestShadowDirective?.turnSequence).toBe(1);
    expect(state.latestShadowDirective?.cognitiveHint).toContain('灾难化思维');
    expect(state.lastShadowDurationMs).toBe(245);
    expect(state.shadowDirectives.length).toBe(1);
  });

  it('useTelemetryStore 应正确更新音频抖动缓冲指标', () => {
    const store = useTelemetryStore.getState();
    store.updateJitterMetrics({
      bufferedSec: 0.12,
      bufferedMs: 120,
      isBuffering: false,
      queuedBuffers: 3,
      scheduledCount: 1,
      targetSec: 0.12,
      rebufferSec: 0.06,
    });

    const state = useTelemetryStore.getState();
    expect(state.jitter.bufferedMs).toBe(120);
    expect(state.jitter.isBuffering).toBe(false);
    expect(state.jitter.queuedBuffers).toBe(3);
  });

  it('TestWorkbench 初始空状态下应准确渲染 HUD 指标与品牌伪装标识', () => {
    render(<TestWorkbench />);

    // 必须呈现为 Live-1 Direct 极速架构与 DeepSeek V4 Flash 深度评估标识
    expect(screen.getByText('LIVE-1 DIRECT · CBT EMBEDDED')).toBeInTheDocument();
    expect(screen.getByText('DEEPSEEK V4 FLASH EVAL')).toBeInTheDocument();
    expect(screen.getByText('RETHINK TELEMETRY')).toBeInTheDocument();
    expect(screen.getByText('网关往返时延 (RTT)')).toBeInTheDocument();
    expect(screen.getByText('首帧响应时延 (TTFT)')).toBeInTheDocument();
    expect(screen.getByText('抖动缓冲水位 (Jitter)')).toBeInTheDocument();
    expect(screen.getByText('启动通话')).toBeInTheDocument();
  });

  it('TestWorkbench 在通话进行与收到语音转写时应实时呈现对话流', () => {
    useBoothStore.setState({
      sessionStatus: 'connected',
      callDuration: 35,
      duplexPhase: 'speaking',
    });
    useTelemetryStore.getState().setIsConnected(true);
    useTelemetryStore.getState().setDuplexPhase('speaking');
    useTelemetryStore.getState().updateRtt(42);
    useTelemetryStore.getState().updateTtft(450);
    useTelemetryStore.getState().appendFinalTranscript({
      role: 'user',
      text: '大家都比我聪明，我怎么努力都没用。',
      timestamp: Date.now(),
    });
    useTelemetryStore.getState().appendFinalTranscript({
      role: 'assistant',
      text: '听得出来你现在特别受挫，觉得自己被落下了对吗？',
      timestamp: Date.now(),
    });

    render(<TestWorkbench />);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('大家都比我聪明，我怎么努力都没用。')).toBeInTheDocument();
    expect(screen.getByText('听得出来你现在特别受挫，觉得自己被落下了对吗？')).toBeInTheDocument();
    expect(screen.getByText('挂机')).toBeInTheDocument();
  });

  it('点击通话、打断与静音按键应正确调度 useVoiceSession 动作', () => {
    useBoothStore.setState({
      sessionStatus: 'connected',
      duplexPhase: 'speaking',
      isMuted: false,
    });
    useTelemetryStore.getState().setDuplexPhase('speaking');

    render(<TestWorkbench />);

    const interruptBtn = screen.getByTitle(/立即打断 AI 当前播报/);
    fireEvent.click(interruptBtn);
    expect(mockInterrupt).toHaveBeenCalled();

    const muteBtn = screen.getByText('静音');
    fireEvent.click(muteBtn);
    expect(mockToggleMute).toHaveBeenCalled();

    const endCallBtn = screen.getByText('挂机');
    fireEvent.click(endCallBtn);
    expect(mockEndCall).toHaveBeenCalled();
  });

  it('链路状态应锁定展示纯粹 WebRTC (UDP/Opus 直连) 徽标与数据流配置', () => {
    render(<TestWorkbench />);

    // 默认 activeTransport 为 webrtc
    expect(screen.getByText('WEBRTC OPUS')).toBeInTheDocument();
    expect(screen.getByText('WebRTC (UDP/Opus 直连)')).toBeInTheDocument();
    expect(screen.getByText('RTCDataChannel 直通')).toBeInTheDocument();
    expect(screen.getByText('WebRTC Opus 48kHz (硬件AEC)')).toBeInTheDocument();
    expect(useTelemetryStore.getState().preferredTransport).toBe('webrtc');
  });

  it('appendFinalTranscript 与 addDialogueTurn 应严格按时间戳递增排序且同时间戳 User 优先', () => {
    // 1. 验证 telemetryStore.appendFinalTranscript
    const tele = useTelemetryStore.getState();
    tele.clearTelemetry();

    // 先插入一个较晚的 assistant，再插入一个较早的 user，再插入一个同时间戳的 user 与 assistant
    tele.appendFinalTranscript({ role: 'assistant', text: '助手晚发言', timestamp: 3000 });
    tele.appendFinalTranscript({ role: 'user', text: '用户早发言', timestamp: 1000 });
    tele.appendFinalTranscript({ role: 'assistant', text: '助手同时间戳', timestamp: 2000 });
    tele.appendFinalTranscript({ role: 'user', text: '用户同时间戳', timestamp: 2000 });

    const feed = useTelemetryStore.getState().transcriptFeed;
    expect(feed.map((f) => ({ role: f.role, text: f.text, timestamp: f.timestamp }))).toEqual([
      { role: 'user', text: '用户早发言', timestamp: 1000 },
      { role: 'user', text: '用户同时间戳', timestamp: 2000 },
      { role: 'assistant', text: '助手同时间戳', timestamp: 2000 },
      { role: 'assistant', text: '助手晚发言', timestamp: 3000 },
    ]);

    // 2. 验证 boothStore.addDialogueTurn
    const booth = useBoothStore.getState();
    booth.resetBooth();

    booth.addDialogueTurn({ id: '1', role: 'assistant', content: '助手晚', timestamp: 5000 });
    booth.addDialogueTurn({ id: '2', role: 'user', content: '用户早', timestamp: 2000 });
    booth.addDialogueTurn({ id: '3', role: 'assistant', content: '助手并列', timestamp: 3000 });
    booth.addDialogueTurn({ id: '4', role: 'user', content: '用户并列', timestamp: 3000 });

    const turns = useBoothStore.getState().dialogueHistory;
    expect(
      turns.map((t) => ({ role: t.role, content: t.content, timestamp: t.timestamp })),
    ).toEqual([
      { role: 'user', content: '用户早', timestamp: 2000 },
      { role: 'user', content: '用户并列', timestamp: 3000 },
      { role: 'assistant', content: '助手并列', timestamp: 3000 },
      { role: 'assistant', content: '助手晚', timestamp: 5000 },
    ]);
  });

  it('appendFinalTranscript 与 addDialogueTurn 应支持按 ID 原位更新并去重', () => {
    // 1. boothStore 原位更新
    const booth = useBoothStore.getState();
    booth.resetBooth();
    booth.addDialogueTurn({
      id: 'turn-user-1',
      role: 'user',
      content: '流式半句话',
      timestamp: 1000,
    });
    booth.addDialogueTurn({
      id: 'turn-asst-1',
      role: 'assistant',
      content: '模型回答',
      timestamp: 2000,
    });
    // 收到实时语音转写终态更新
    booth.addDialogueTurn({
      id: 'turn-user-1',
      role: 'user',
      content: '流式完整一句话',
      timestamp: 1000,
    });

    const turns = useBoothStore.getState().dialogueHistory;
    expect(turns.length).toBe(2);
    expect(turns[0].content).toBe('流式完整一句话');
    expect(turns[1].content).toBe('模型回答');

    // 2. telemetryStore 原位更新
    const tele = useTelemetryStore.getState();
    tele.clearTelemetry();
    tele.appendFinalTranscript({
      id: 'feed-user-1',
      role: 'user',
      text: '草稿文本',
      timestamp: 1000,
    });
    tele.appendFinalTranscript({
      id: 'feed-asst-1',
      role: 'assistant',
      text: '回答文本',
      timestamp: 2000,
    });
    tele.appendFinalTranscript({
      id: 'feed-user-1',
      role: 'user',
      text: '终态校正文本',
      timestamp: 1000,
    });

    const feed = useTelemetryStore.getState().transcriptFeed;
    expect(feed.length).toBe(2);
    expect(feed[0].text).toBe('终态校正文本');
    expect(feed[1].text).toBe('回答文本');
  });

  it('useTelemetryStore 应正确聚合 RAG 知识检索日志并在影子大脑带有 ragRecall 时自动联动', () => {
    const store = useTelemetryStore.getState();
    store.clearTelemetry();

    // 1. 手动添加 RAG 日志
    store.addRagRetrieval({
      query: '我考前容易手抖慌张',
      status: 'matched',
      score: 0.88,
      topic: '心慌发抖感官着陆缓解法',
      category: 'somatic',
      empathyLead: '心跳加速确实会让人发慌',
      socraticPivot: '手掌贴在胸口能感受到温热吗',
      tabooPhrases: ['别抖了看着烦'],
      durationMs: 35,
      timestamp: Date.now(),
      source: 'manual_test',
    });

    let state = useTelemetryStore.getState();
    expect(state.ragRetrievals.length).toBe(1);
    expect(state.latestRagRetrieval?.topic).toBe('心慌发抖感官着陆缓解法');
    expect(state.latestRagRetrieval?.score).toBe(0.88);

    // 2. 影子大脑带 ragRecall 自动注入
    store.addShadowDirective({
      turnSequence: 2,
      userText: '我喘不上气好难受',
      cognitiveHint: '来访者疑似过度通气，请安抚',
      durationMs: 200,
      fallback: false,
      timestamp: Date.now(),
      ragRecall: {
        status: 'matched',
        topic: '过度通气箱式呼吸法',
        category: 'somatic',
        score: 0.92,
        empathyGuideline: '听得出来你呼吸急促',
        socraticPivot: '跟着慢吸四秒再呼四秒好吗',
        tabooPhrases: ['别大惊小怪'],
      },
    });

    state = useTelemetryStore.getState();
    expect(state.ragRetrievals.length).toBe(2);
    expect(state.latestRagRetrieval?.topic).toBe('过度通气箱式呼吸法');
    expect(state.latestRagRetrieval?.source).toBe('live_shadow');
  });

  it('useTelemetryStore 应正确同步 CBT 状态机快照与情绪效价负向锁定状态', () => {
    const store = useTelemetryStore.getState();
    store.clearTelemetry();

    store.updateCbtFsmState({
      stage: 'Active_Listening',
      turnsInStage: 3,
      totalTurns: 5,
      fallbackCooldown: 1,
      isCrisis: false,
      emotionalValence: -0.65,
      cognitiveExposure: 0.35,
      isEmotionallyLocked: true,
      history: [
        {
          from: 'Pre_Info_Collection',
          to: 'Active_Listening',
          turn: 2,
          timestamp: Date.now(),
          reason: '信息采集完成推进',
        },
      ],
    });

    const state = useTelemetryStore.getState();
    expect(state.cbtFsmState.stage).toBe('Active_Listening');
    expect(state.cbtFsmState.emotionalValence).toBe(-0.65);
    expect(state.cbtFsmState.isEmotionallyLocked).toBe(true);
    expect(state.cbtFsmState.history.length).toBe(1);
  });

  it('TestWorkbench 应正常渲染 RAG 召回与 CBT 状态机 4 大工作台选项卡', () => {
    render(<TestWorkbench />);

    expect(screen.getByText('RAG 知识召回')).toBeInTheDocument();
    expect(screen.getByText('CBT 状态机')).toBeInTheDocument();
    expect(screen.getByText('声学与传输')).toBeInTheDocument();
    expect(screen.getByText('事件与原始帧')).toBeInTheDocument();
    expect(screen.getByText('交互式 RAG 靶向评测沙盒')).toBeInTheDocument();
  });

  it('点击选项卡能切换各面板视图并维持沙盒与状态机展示', () => {
    render(<TestWorkbench />);

    const fsmTabBtn = screen.getByText('CBT 状态机');
    fireEvent.click(fsmTabBtn);

    expect(screen.getByText('CBT 状态机流转拓扑 (Cognitive State Machine)')).toBeInTheDocument();
    expect(screen.getByText('情绪效价与暴露度动力学 (Dynamics & Watchdog)')).toBeInTheDocument();

    const acousticTabBtn = screen.getByText('声学与传输');
    fireEvent.click(acousticTabBtn);
    expect(screen.getByText('音频抖动缓冲与流式播发 (Jitter Buffer)')).toBeInTheDocument();

    const eventsTabBtn = screen.getByText('事件与原始帧');
    fireEvent.click(eventsTabBtn);
    expect(screen.getByText('端到端遥测诊断流')).toBeInTheDocument();
    expect(screen.getByText('复制 JSON')).toBeInTheDocument();
  });

  it('在 RAG 沙盒中执行查询应调用检索器并展示命中的 CBT 胶囊与打分', async () => {
    render(<TestWorkbench />);

    const input = screen.getByPlaceholderText(/输入来访学生诉求/);
    fireEvent.change(input, { target: { value: '手抖身体发抖心跳过速' } });

    const searchBtn = screen.getByRole('button', { name: /测试检索/ });
    fireEvent.click(searchBtn);

    expect(await screen.findByText(/心慌发抖/)).toBeInTheDocument();
    expect(useTelemetryStore.getState().ragRetrievals.length).toBeGreaterThan(0);
    expect(useTelemetryStore.getState().latestRagRetrieval?.source).toBe('manual_test');
  });

  it('点击 RAG 预设用例按钮能自动填充并触发靶向检索', async () => {
    render(<TestWorkbench />);

    const presetBtn = screen.getByRole('button', { name: '过度通气' });
    fireEvent.click(presetBtn);

    await waitFor(() => {
      const latest = useTelemetryStore.getState().latestRagRetrieval;
      expect(latest?.topic).toContain('过度通气');
    });
  });

  it('CBT 状态机面板在负向情绪效价时应展示负向锁定告警', () => {
    useTelemetryStore.getState().updateCbtFsmState({
      stage: 'Active_Listening',
      emotionalValence: -0.75,
      cognitiveExposure: 0.2,
      isEmotionallyLocked: true,
    });

    render(<TestWorkbench />);

    const fsmTabBtn = screen.getByText('CBT 状态机');
    fireEvent.click(fsmTabBtn);

    expect(screen.getAllByText(/负向锁定/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/-0.75/)[0]).toBeInTheDocument();
    expect(screen.getByText(/强制锁定积极倾听阶段/)).toBeInTheDocument();
  });
});
