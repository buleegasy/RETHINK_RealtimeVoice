import { create } from 'zustand';

export interface ShadowDirectiveLog {
  id: string;
  turnSequence: number;
  userText: string;
  cognitiveHint: string | null;
  durationMs: number;
  fallback: boolean;
  timestamp: number;
}

export interface LiveTranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface JitterMetricsData {
  bufferedSec: number;
  bufferedMs: number;
  isBuffering: boolean;
  queuedBuffers: number;
  scheduledCount: number;
  targetSec: number;
  rebufferSec: number;
}

export interface SafetyCheckLog {
  turnSequence: number;
  isCrisis: boolean;
  durationMs: number;
  timestamp: number;
}

export interface TelemetryState {
  // 影子大脑实时状态
  latestShadowDirective: ShadowDirectiveLog | null;
  shadowDirectives: ShadowDirectiveLog[];

  // 语音转写双轨实时流
  streamingUserText: string;
  streamingAssistantText: string;
  transcriptFeed: LiveTranscriptItem[];

  // 网络与交互时延 (ms)
  rttMs: number;
  avgRttMs: number;
  rttHistory: number[];
  ttftMs: number;
  lastShadowDurationMs: number;
  turnCount: number;

  // 音频抖动缓冲 (Jitter Buffer)
  jitter: JitterMetricsData;
  inputAudioLevel: number;
  outputAudioLevel: number;
  totalAudioChunks: number;
  totalBargeIns: number;

  // 危机与系统状态
  latestSafetyCheck: SafetyCheckLog | null;
  activeCbtStage: string;
  duplexPhase: string;
  isConnected: boolean;

  // Actions
  addShadowDirective: (directive: Omit<ShadowDirectiveLog, 'id'>) => void;
  setStreamingUserText: (text: string) => void;
  setStreamingAssistantText: (text: string) => void;
  appendFinalTranscript: (item: Omit<LiveTranscriptItem, 'id' | 'isFinal'>) => void;
  updateRtt: (rtt: number) => void;
  updateTtft: (ttft: number) => void;
  updateJitterMetrics: (metrics: JitterMetricsData) => void;
  updateAudioLevels: (input: number, output: number) => void;
  incrementAudioChunks: () => void;
  incrementBargeIns: () => void;
  setSafetyCheck: (check: SafetyCheckLog) => void;
  setCbtStage: (stage: string) => void;
  setDuplexPhase: (phase: string) => void;
  setIsConnected: (connected: boolean) => void;
  clearTelemetry: () => void;
}

const initialJitter: JitterMetricsData = {
  bufferedSec: 0,
  bufferedMs: 0,
  isBuffering: true,
  queuedBuffers: 0,
  scheduledCount: 0,
  targetSec: 0.04,
  rebufferSec: 0.02,
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  latestShadowDirective: null,
  shadowDirectives: [],

  streamingUserText: '',
  streamingAssistantText: '',
  transcriptFeed: [],

  rttMs: 0,
  avgRttMs: 0,
  rttHistory: [],
  ttftMs: 0,
  lastShadowDurationMs: 0,
  turnCount: 0,

  jitter: initialJitter,
  inputAudioLevel: 0,
  outputAudioLevel: 0,
  totalAudioChunks: 0,
  totalBargeIns: 0,

  latestSafetyCheck: null,
  activeCbtStage: 'Active_Listening',
  duplexPhase: 'idle',
  isConnected: false,

  addShadowDirective: (directive) =>
    set((state) => {
      const newItem: ShadowDirectiveLog = {
        ...directive,
        id: `shadow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      };
      return {
        latestShadowDirective: newItem,
        shadowDirectives: [newItem, ...state.shadowDirectives].slice(0, 50),
        lastShadowDurationMs: directive.durationMs,
        turnCount: Math.max(state.turnCount, directive.turnSequence),
      };
    }),

  setStreamingUserText: (text) => set({ streamingUserText: text }),
  setStreamingAssistantText: (text) => set({ streamingAssistantText: text }),

  appendFinalTranscript: (item) =>
    set((state) => {
      const newItem: LiveTranscriptItem = {
        ...item,
        id: `ts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        isFinal: true,
      };
      return {
        transcriptFeed: [...state.transcriptFeed, newItem],
        streamingUserText: item.role === 'user' ? '' : state.streamingUserText,
        streamingAssistantText: item.role === 'assistant' ? '' : state.streamingAssistantText,
      };
    }),

  updateRtt: (rtt) =>
    set((state) => {
      const history = [...state.rttHistory, rtt].slice(-20);
      const avg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
      return {
        rttMs: rtt,
        avgRttMs: avg,
        rttHistory: history,
      };
    }),

  updateTtft: (ttft) => set({ ttftMs: ttft }),

  updateJitterMetrics: (metrics) => set({ jitter: metrics }),

  updateAudioLevels: (input, output) =>
    set({
      inputAudioLevel: Math.round(input * 100),
      outputAudioLevel: Math.round(output * 100),
    }),

  incrementAudioChunks: () => set((state) => ({ totalAudioChunks: state.totalAudioChunks + 1 })),

  incrementBargeIns: () => set((state) => ({ totalBargeIns: state.totalBargeIns + 1 })),

  setSafetyCheck: (check) => set({ latestSafetyCheck: check }),
  setCbtStage: (stage) => set({ activeCbtStage: stage }),
  setDuplexPhase: (phase) => set({ duplexPhase: phase }),
  setIsConnected: (connected) => set({ isConnected: connected }),

  clearTelemetry: () =>
    set({
      latestShadowDirective: null,
      shadowDirectives: [],
      streamingUserText: '',
      streamingAssistantText: '',
      transcriptFeed: [],
      rttMs: 0,
      avgRttMs: 0,
      rttHistory: [],
      ttftMs: 0,
      lastShadowDurationMs: 0,
      turnCount: 0,
      jitter: initialJitter,
      inputAudioLevel: 0,
      outputAudioLevel: 0,
      totalAudioChunks: 0,
      totalBargeIns: 0,
      latestSafetyCheck: null,
    }),
}));
