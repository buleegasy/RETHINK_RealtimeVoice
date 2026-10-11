import { create } from 'zustand';

function generateTelemetryId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now()}`;
}

export interface RagRecallData {
  status: 'matched' | 'no_relevant_context';
  category?: string;
  topic?: string;
  score?: number;
  empathyGuideline?: string;
  socraticPivot?: string;
  tabooReminder?: string;
  tabooPhrases?: string[];
  conciseDirective?: string;
}

export interface ShadowDirectiveLog {
  id: string;
  turnSequence: number;
  userText: string;
  cognitiveHint: string | null;
  durationMs: number;
  fallback: boolean;
  timestamp: number;
  ragRecall?: RagRecallData | null;
}

export interface RagRetrievalLog {
  id: string;
  turnSequence?: number;
  query: string;
  status: 'matched' | 'no_relevant_context';
  score: number;
  topic?: string;
  category?: string;
  empathyLead?: string;
  socraticPivot?: string;
  tabooPhrases?: string[];
  conciseDirective?: string;
  durationMs: number;
  timestamp: number;
  source: 'live_shadow' | 'live_tool' | 'manual_test';
}

export interface CbtFsmTransitionLog {
  from: string;
  to: string;
  turn: number;
  timestamp: number;
  reason?: string;
}

export interface CbtFsmTelemetryState {
  stage: string;
  turnsInStage: number;
  totalTurns: number;
  fallbackCooldown: number;
  isCrisis: boolean;
  emotionalValence: number;
  cognitiveExposure: number;
  isEmotionallyLocked: boolean;
  history: CbtFsmTransitionLog[];
}

export interface LiveTranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  isFinal: boolean;
  cbtStage?: string;
  ragTopic?: string;
  shadowHint?: string | null;
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

export interface WebRtcStatsData {
  connectionState: string;
  iceConnectionState: string;
  dataChannelState: string;
  packetsLost?: number;
  audioBitrateKbps?: number;
}

export interface TelemetryState {
  // 影子大脑实时状态
  latestShadowDirective: ShadowDirectiveLog | null;
  shadowDirectives: ShadowDirectiveLog[];

  // RAG 知识检索与干预胶囊日志
  latestRagRetrieval: RagRetrievalLog | null;
  ragRetrievals: RagRetrievalLog[];

  // CBT 状态机与情绪动力学快照
  cbtFsmState: CbtFsmTelemetryState;

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

  // 音频抖动缓冲 (Jitter Buffer) 与声学管线
  jitter: JitterMetricsData;
  inputAudioLevel: number;
  outputAudioLevel: number;
  totalAudioChunks: number;
  totalBargeIns: number;

  // WebRTC 链路细节
  webRtcStats: WebRtcStatsData;

  // 危机与系统状态
  latestSafetyCheck: SafetyCheckLog | null;
  activeCbtStage: string;
  duplexPhase: string;
  isConnected: boolean;
  activeTransport: 'webrtc' | 'websocket';
  preferredTransport: 'auto' | 'webrtc' | 'websocket';

  // Actions
  addShadowDirective: (directive: Omit<ShadowDirectiveLog, 'id'>) => void;
  addRagRetrieval: (log: Omit<RagRetrievalLog, 'id'>) => void;
  updateCbtFsmState: (fsm: Partial<CbtFsmTelemetryState>) => void;
  updateWebRtcStats: (stats: Partial<WebRtcStatsData>) => void;
  setStreamingUserText: (text: string) => void;
  setStreamingAssistantText: (text: string) => void;
  appendFinalTranscript: (
    item: Omit<LiveTranscriptItem, 'id' | 'isFinal'> & { id?: string },
  ) => void;
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
  setActiveTransport: (transport: 'webrtc' | 'websocket') => void;
  setPreferredTransport: (transport: 'auto' | 'webrtc' | 'websocket') => void;
  clearTelemetry: () => void;
}

const initialJitter: JitterMetricsData = {
  bufferedSec: 0,
  bufferedMs: 0,
  isBuffering: false,
  queuedBuffers: 0,
  scheduledCount: 0,
  targetSec: 0.04,
  rebufferSec: 0.02,
};

const initialCbtFsm: CbtFsmTelemetryState = {
  stage: 'Active_Listening',
  turnsInStage: 0,
  totalTurns: 0,
  fallbackCooldown: 0,
  isCrisis: false,
  emotionalValence: 0.0,
  cognitiveExposure: 0.0,
  isEmotionallyLocked: false,
  history: [],
};

const initialWebRtcStats: WebRtcStatsData = {
  connectionState: 'idle',
  iceConnectionState: 'idle',
  dataChannelState: 'closed',
};

export const useTelemetryStore = create<TelemetryState>((set) => ({
  latestShadowDirective: null,
  shadowDirectives: [],

  latestRagRetrieval: null,
  ragRetrievals: [],

  cbtFsmState: initialCbtFsm,

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

  webRtcStats: initialWebRtcStats,

  latestSafetyCheck: null,
  activeCbtStage: 'Active_Listening',
  duplexPhase: 'idle',
  isConnected: false,
  activeTransport: 'webrtc',
  preferredTransport: 'webrtc',

  addShadowDirective: (directive) =>
    set((state) => {
      const newItem: ShadowDirectiveLog = {
        ...directive,
        id: generateTelemetryId('shadow'),
      };
      const updatedShadows = [newItem, ...state.shadowDirectives].slice(0, 50);

      // 若携带 RAG 召回信息，同步汇聚至 RAG 召回流水
      let updatedRag = state.ragRetrievals;
      let latestRag = state.latestRagRetrieval;
      if (directive.ragRecall) {
        const ragItem: RagRetrievalLog = {
          id: generateTelemetryId('rag'),
          turnSequence: directive.turnSequence,
          query: directive.userText,
          status: directive.ragRecall.status,
          score: directive.ragRecall.score ?? 0.85,
          topic: directive.ragRecall.topic,
          category: directive.ragRecall.category,
          empathyLead: directive.ragRecall.empathyGuideline,
          socraticPivot: directive.ragRecall.socraticPivot,
          tabooPhrases: directive.ragRecall.tabooPhrases,
          conciseDirective: directive.ragRecall.conciseDirective,
          durationMs: Math.max(10, Math.round(directive.durationMs * 0.25)),
          timestamp: directive.timestamp,
          source: 'live_shadow',
        };
        latestRag = ragItem;
        updatedRag = [ragItem, ...state.ragRetrievals].slice(0, 50);
      }

      return {
        latestShadowDirective: newItem,
        shadowDirectives: updatedShadows,
        latestRagRetrieval: latestRag,
        ragRetrievals: updatedRag,
        lastShadowDurationMs: directive.durationMs,
        turnCount: Math.max(state.turnCount, directive.turnSequence),
      };
    }),

  addRagRetrieval: (log) =>
    set((state) => {
      const newItem: RagRetrievalLog = {
        ...log,
        id: generateTelemetryId('rag'),
      };
      return {
        latestRagRetrieval: newItem,
        ragRetrievals: [newItem, ...state.ragRetrievals].slice(0, 50),
      };
    }),

  updateCbtFsmState: (fsm) =>
    set((state) => {
      const merged: CbtFsmTelemetryState = {
        ...state.cbtFsmState,
        ...fsm,
      };
      return {
        cbtFsmState: merged,
        activeCbtStage: merged.stage || state.activeCbtStage,
      };
    }),

  updateWebRtcStats: (stats) =>
    set((state) => ({
      webRtcStats: {
        ...state.webRtcStats,
        ...stats,
      },
    })),

  setStreamingUserText: (text) => set({ streamingUserText: text }),
  setStreamingAssistantText: (text) => set({ streamingAssistantText: text }),

  appendFinalTranscript: (item) =>
    set((state) => {
      const id = item.id || generateTelemetryId('ts');
      const newItem: LiveTranscriptItem = {
        ...item,
        id,
        isFinal: true,
        cbtStage: item.cbtStage || state.activeCbtStage,
        ragTopic: item.ragTopic || state.latestRagRetrieval?.topic,
        shadowHint: item.shadowHint || state.latestShadowDirective?.cognitiveHint,
      };
      const existingIdx = state.transcriptFeed.findIndex((f) => f.id === id);
      let list: LiveTranscriptItem[];
      if (existingIdx >= 0) {
        list = [...state.transcriptFeed];
        list[existingIdx] = newItem;
      } else {
        list = [...state.transcriptFeed, newItem];
      }
      const updated = list.sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }
        if (a.role === 'user' && b.role !== 'user') return -1;
        if (a.role !== 'user' && b.role === 'user') return 1;
        return 0;
      });
      return {
        transcriptFeed: updated,
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
  setCbtStage: (stage) =>
    set((state) => ({
      activeCbtStage: stage,
      cbtFsmState: {
        ...state.cbtFsmState,
        stage,
      },
    })),
  setDuplexPhase: (phase) => set({ duplexPhase: phase }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setActiveTransport: (activeTransport) => set({ activeTransport }),
  setPreferredTransport: (preferredTransport) => set({ preferredTransport }),

  clearTelemetry: () =>
    set({
      latestShadowDirective: null,
      shadowDirectives: [],
      latestRagRetrieval: null,
      ragRetrievals: [],
      cbtFsmState: initialCbtFsm,
      webRtcStats: initialWebRtcStats,
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
