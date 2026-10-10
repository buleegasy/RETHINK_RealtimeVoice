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

  it('链路选择器应允许在待机时切换 preferredTransport，且正确展示 WebRTC / WS 状态徽标', () => {
    const { unmount } = render(<TestWorkbench />);

    // 默认 activeTransport 为 webrtc
    expect(screen.getByText('WEBRTC OPUS')).toBeInTheDocument();
    expect(screen.getByText('RTCDataChannel 直通')).toBeInTheDocument();
    expect(screen.getByText('WebRTC Opus 48kHz (硬件AEC)')).toBeInTheDocument();

    // 点击切换为 WebSocket
    const wsBtn = screen.getByText('WS');
    fireEvent.click(wsBtn);
    expect(useTelemetryStore.getState().preferredTransport).toBe('websocket');

    // 卸载当前 DOM
    unmount();

    // 模拟活跃通道切为 websocket 并连接成功
    useTelemetryStore.getState().setActiveTransport('websocket');
    useTelemetryStore.getState().setIsConnected(true);

    // 重新渲染验证界面徽标响应
    render(<TestWorkbench />);
    expect(screen.getByText('WS PCM16')).toBeInTheDocument();
    expect(screen.getByText('WebSocket 帧传输')).toBeInTheDocument();
    expect(screen.getByText('24kHz 16bit PCM')).toBeInTheDocument();
    expect(screen.getByText('WebSocket 全双工网关已连接')).toBeInTheDocument();
  });
});
