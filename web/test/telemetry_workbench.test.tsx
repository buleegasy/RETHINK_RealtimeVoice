import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

    // 严禁静态外露非 MiniMax/DeepSeek 外部厂商名，必须呈现为 DeepSeek V4 Flash
    expect(screen.getByText('DEEPSEEK V4 FLASH SHADOW')).toBeInTheDocument();
    expect(screen.getByText('RETHINK TELEMETRY')).toBeInTheDocument();
    expect(screen.getByText('网关往返时延 (RTT)')).toBeInTheDocument();
    expect(screen.getByText('首帧响应时延 (TTFT)')).toBeInTheDocument();
    expect(screen.getByText('抖动缓冲水位 (Jitter)')).toBeInTheDocument();
    expect(screen.getByText('启动通话')).toBeInTheDocument();
  });

  it('TestWorkbench 在通话进行与收到影子大脑指令时应实时呈现指导意见', () => {
    useBoothStore.setState({
      sessionStatus: 'connected',
      callDuration: 35,
      duplexPhase: 'speaking',
    });
    useTelemetryStore.getState().setIsConnected(true);
    useTelemetryStore.getState().setDuplexPhase('speaking');
    useTelemetryStore.getState().updateRtt(42);
    useTelemetryStore.getState().updateTtft(450);
    useTelemetryStore.getState().addShadowDirective({
      turnSequence: 2,
      userText: '大家都比我聪明，我怎么努力都没用。',
      cognitiveHint: '识别到全或无与过分概括，请使用苏格拉底式提问引导。',
      durationMs: 310,
      fallback: false,
      timestamp: Date.now(),
    });

    render(<TestWorkbench />);

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getAllByText(/大家都比我聪明/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/识别到全或无与过分概括/).length).toBeGreaterThan(0);
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
});
