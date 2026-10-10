import { useRef, useCallback, useEffect } from 'react';
import { useBoothStore } from '../store/boothStore';
import { useAuthStore } from '../store/authStore';
import { useTelemetryStore } from '../store/telemetryStore';
import { MiniMaxRealtimeClient } from '../lib/minimax/client';
import { RealtimeToolDispatcher } from '../lib/tools/toolDispatcher';
import { DefaultRagProvider } from '../lib/pipelines/rag/defaultRagProvider';
import { BufferedTranscriptionPipeline } from '../lib/pipelines/transcription/bufferedTranscription';
import { safeRandomId } from '../lib/utils';
import { useVoiceAudio } from './useVoiceAudio';
import { useSessionPersistence } from './useSessionPersistence';
import { finalizeDialogueTurns, applyLocalInterrupt } from './voice/turnFinalizer';
import { buildVoiceClientCallbacks } from './voice/sessionCallbacks';
import { startSessionTimers, stopSessionTimers } from './voice/sessionTimers';
import { formatAudioInitError } from './voice/voiceUtils';
import { ensureKioskAuthToken } from './voice/kioskAuth';
import {
  bindStreamingTranscriptSubscription,
  bindCrisisEndCallListener,
} from './voice/voiceSubscriptions';

/**
 * useVoiceSession
 * 顶层语音对话会话协调 Hook
 * 组合音频抽象 (useVoiceAudio)、会话持久化 (useSessionPersistence)、网关协议 (MiniMaxRealtimeClient) 与 CBT 工具调度
 */
export function useVoiceSession() {
  const {
    hookState,
    sessionStatus,
    duplexPhase,
    cbtStage,
    isMuted,
    callDuration,
    setHookState,
    setSessionStatus,
    setDuplexPhase,
    setCBTStage,
    setIsMuted,
    addDialogueTurn,
    setLatestReport,
    setCrisisOverlayOpen,
    setErrorMessage,
    setCallDuration,
  } = useBoothStore();

  const user = useAuthStore((s) => s.user);
  const updateUserName = useAuthStore((s) => s.updateUserName);

  const { audioGraphRef, getAudioGraph, startVisualizer, stopVisualizer, cleanupAudio } =
    useVoiceAudio();

  const { persistSession } = useSessionPersistence();

  const clientRef = useRef<MiniMaxRealtimeClient | null>(null);
  const toolDispatcherRef = useRef<RealtimeToolDispatcher | null>(null);
  const ragProviderRef = useRef<DefaultRagProvider>(new DefaultRagProvider());
  const transcriptionRef = useRef<BufferedTranscriptionPipeline>(
    new BufferedTranscriptionPipeline(),
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const telemetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string>('');
  const endCallRef = useRef<(() => Promise<void>) | null>(null);
  const userSpeechStartTimeRef = useRef<number | null>(null);
  const asstSpeechStartTimeRef = useRef<number | null>(null);
  const lastUserTurnIdRef = useRef<string | null>(null);
  const lastUserTurnTimestampRef = useRef<number | null>(null);

  const startCall = useCallback(async () => {
    setErrorMessage(null);
    setHookState('connected');
    setSessionStatus('connecting');
    setDuplexPhase('thinking');

    useTelemetryStore.getState().clearTelemetry();
    useTelemetryStore.getState().setCbtStage(useBoothStore.getState().cbtStage);
    useTelemetryStore.getState().setDuplexPhase('thinking');

    sessionIdRef.current = safeRandomId('kiosk');
    transcriptionRef.current.reset();
    userSpeechStartTimeRef.current = null;
    asstSpeechStartTimeRef.current = null;
    lastUserTurnIdRef.current = null;
    lastUserTurnTimestampRef.current = null;

    try {
      const { token: currentToken, user: currentUser } = await ensureKioskAuthToken();
      const audioGraph = await getAudioGraph();

      audioGraph.setOnLocalInterrupt((_playedMs) => {
        interrupt();
      });

      audioGraph.setOnPlaybackStateChange((isPlaying) => {
        if (!isPlaying) {
          if (useBoothStore.getState().sessionStatus === 'connected') {
            setDuplexPhase('listening');
            useTelemetryStore.getState().setDuplexPhase('listening');
          }
        }
      });

      toolDispatcherRef.current = new RealtimeToolDispatcher({
        ragProvider: ragProviderRef.current,
        onStageChange: (nextStage) => {
          setCBTStage(nextStage);
          useTelemetryStore.getState().setCbtStage(nextStage);
        },
        onCrisisEscalate: (_sev, _text) => {
          setCBTStage('Crisis_Escalation');
          useTelemetryStore.getState().setCbtStage('Crisis_Escalation');
          setCrisisOverlayOpen(true);
        },
        onSaveUserInfo: (name) => {
          updateUserName(name);
        },
      });

      const clientCallbacks = buildVoiceClientCallbacks({
        audioGraph,
        transcriptionRef,
        toolDispatcherRef,
        clientRef,
        endCallRef,
        userSpeechStartTimeRef,
        asstSpeechStartTimeRef,
        lastUserTurnIdRef,
        lastUserTurnTimestampRef,
        cleanupAudio,
        setSessionStatus,
        setHookState,
        setDuplexPhase,
        setErrorMessage,
        setCBTStage,
        setCrisisOverlayOpen,
        addDialogueTurn,
      });

      clientRef.current = new MiniMaxRealtimeClient({
        sessionId: sessionIdRef.current,
        userId: currentUser?.uid || currentUser?.userName || user?.uid || user?.userName,
        username:
          currentUser?.displayName || currentUser?.userName || user?.displayName || user?.userName,
        token: currentToken || undefined,
        transport: 'webrtc',
        callbacks: clientCallbacks,
      });

      await audioGraph.startRecording((pcm16Base64) => {
        if (clientRef.current?.ready) {
          clientRef.current.sendAudioChunk(pcm16Base64);
        }
      });

      const micStream = audioGraph.getMicrophoneStream();
      await clientRef.current.connect(micStream || undefined);
      startVisualizer();

      setCallDuration(() => 0);
      startSessionTimers(timerRef, telemetryTimerRef, audioGraphRef, setCallDuration);
    } catch (err: any) {
      console.error('[VoiceSession] 启动失败:', err);
      setErrorMessage(formatAudioInitError(err));
      setSessionStatus('error');
      setHookState('on_hook');
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
      cleanupAudio();
    }
  }, [
    getAudioGraph,
    setHookState,
    setSessionStatus,
    setDuplexPhase,
    setCBTStage,
    setCrisisOverlayOpen,
    updateUserName,
    setErrorMessage,
    addDialogueTurn,
    startVisualizer,
    cleanupAudio,
    setCallDuration,
    user,
  ]);

  const endCall = useCallback(async () => {
    stopSessionTimers(timerRef, telemetryTimerRef);
    useTelemetryStore.getState().setIsConnected(false);
    useTelemetryStore.getState().setDuplexPhase('idle');

    stopVisualizer();
    cleanupAudio();

    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    setHookState('on_hook');
    setSessionStatus('idle');
    setDuplexPhase('idle');

    finalizeDialogueTurns(
      transcriptionRef.current,
      userSpeechStartTimeRef.current,
      asstSpeechStartTimeRef.current,
    );
    userSpeechStartTimeRef.current = null;
    asstSpeechStartTimeRef.current = null;

    const turns = useBoothStore.getState().dialogueHistory;
    const duration = useBoothStore.getState().callDuration;
    const stageReached = useBoothStore.getState().cbtStage;
    const currentSessionId = sessionIdRef.current || safeRandomId('kiosk');

    await persistSession({
      sessionId: currentSessionId,
      duration,
      stageReached,
      user,
      turns,
      onReportGenerated: (report) => {
        setLatestReport(report);
      },
    });
  }, [
    stopVisualizer,
    cleanupAudio,
    setHookState,
    setSessionStatus,
    setDuplexPhase,
    persistSession,
    user,
    setLatestReport,
  ]);
  endCallRef.current = endCall;

  const interrupt = useCallback(() => {
    const interruptTime = Date.now();
    userSpeechStartTimeRef.current = userSpeechStartTimeRef.current || interruptTime;
    applyLocalInterrupt({
      audioGraph: audioGraphRef.current,
      client: clientRef.current,
      transcription: transcriptionRef.current,
      asstStartTime: asstSpeechStartTimeRef.current,
      interruptTime,
    });
    asstSpeechStartTimeRef.current = null;
  }, [audioGraphRef]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioGraphRef.current) {
      audioGraphRef.current.setMute(nextMuted);
    }
  }, [isMuted, setIsMuted, audioGraphRef]);

  useEffect(() => {
    return bindStreamingTranscriptSubscription(transcriptionRef.current);
  }, []);

  useEffect(() => {
    const unbindCrisis = bindCrisisEndCallListener(endCall);
    return () => {
      unbindCrisis();
      stopSessionTimers(timerRef, telemetryTimerRef);
      stopVisualizer();
      cleanupAudio();
      if (clientRef.current) clientRef.current.disconnect();
    };
  }, [endCall, stopVisualizer, cleanupAudio]);

  return {
    startCall,
    endCall,
    interrupt,
    toggleMute,
    hookState,
    sessionStatus,
    duplexPhase,
    cbtStage,
    isMuted,
    callDuration,
  };
}
