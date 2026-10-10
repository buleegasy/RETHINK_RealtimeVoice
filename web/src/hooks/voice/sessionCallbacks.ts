import type { MutableRefObject } from 'react';
import type { MiniMaxClientCallbacks } from '../../lib/minimax/types';
import type { MiniMaxRealtimeClient } from '../../lib/minimax/client';
import type { RealtimeToolDispatcher } from '../../lib/tools/toolDispatcher';
import type { BufferedTranscriptionPipeline } from '../../lib/pipelines/transcription/bufferedTranscription';
import type { AudioGraphController } from '../../lib/audio/audioGraph';
import { useBoothStore } from '../../store/boothStore';
import { useTelemetryStore } from '../../store/telemetryStore';
import { finalizeDialogueTurns } from './turnFinalizer';

export interface VoiceCallbackDependencies {
  audioGraph: AudioGraphController;
  transcriptionRef: MutableRefObject<BufferedTranscriptionPipeline>;
  toolDispatcherRef: MutableRefObject<RealtimeToolDispatcher | null>;
  clientRef: MutableRefObject<MiniMaxRealtimeClient | null>;
  endCallRef: MutableRefObject<(() => Promise<void>) | null>;
  userSpeechStartTimeRef: MutableRefObject<number | null>;
  asstSpeechStartTimeRef: MutableRefObject<number | null>;
  lastUserTurnIdRef: MutableRefObject<string | null>;
  lastUserTurnTimestampRef: MutableRefObject<number | null>;
  cleanupAudio: () => void;
  setSessionStatus: (status: any) => void;
  setHookState: (state: any) => void;
  setDuplexPhase: (phase: any) => void;
  setErrorMessage: (msg: string | null) => void;
  setCBTStage: (stage: any) => void;
  setCrisisOverlayOpen: (open: boolean) => void;
  addDialogueTurn: (turn: any) => void;
}

export function buildVoiceClientCallbacks(deps: VoiceCallbackDependencies): MiniMaxClientCallbacks {
  const {
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
  } = deps;

  return {
    onOpen: () => {
      setSessionStatus('connected');
      setHookState('connected');
      setDuplexPhase('listening');
      useTelemetryStore.getState().setIsConnected(true);
      useTelemetryStore.getState().setDuplexPhase('listening');
      audioGraph.setAiThinking(false);
      audioGraph.setAiSpeaking(false);
    },
    onReconnecting: (attempt: number, maxAttempts: number) => {
      useTelemetryStore.getState().setIsConnected(false);
      setSessionStatus('connecting');
      setErrorMessage(`网络波动，正在重新建立语音链路 (${attempt}/${maxAttempts})...`);
    },
    onReconnected: () => {
      setSessionStatus('connected');
      setHookState('connected');
      setDuplexPhase('listening');
      setErrorMessage(null);
      useTelemetryStore.getState().setIsConnected(true);
      useTelemetryStore.getState().setDuplexPhase('listening');
      audioGraph.setAiThinking(false);
      audioGraph.setAiSpeaking(false);
    },
    onMaxReconnectFailed: () => {
      setErrorMessage('网络信号持续不稳定，已达最大重试上限，请检查网络后重试');
    },
    onClose: (code?: number, reason?: string) => {
      useTelemetryStore.getState().setIsConnected(false);
      useTelemetryStore.getState().setDuplexPhase('idle');
      const currentStatus = useBoothStore.getState().sessionStatus;
      if (currentStatus === 'connected' || currentStatus === 'connecting') {
        if (code && code !== 1000 && code !== 1005) {
          const failReason = reason ? `连接中断: ${reason}` : `语音连接意外断开 (错误码: ${code})`;
          setErrorMessage(failReason);
          setSessionStatus('error');
          setHookState('on_hook');
          if (clientRef.current) {
            clientRef.current.disconnect();
            clientRef.current = null;
          }
          cleanupAudio();
        } else {
          endCallRef.current?.();
        }
      }
    },
    onError: (err: any) => {
      console.warn('[VoiceSession] 中继网络通知:', err);
      const msg = err?.message || (typeof err === 'string' ? err : '语音中继链路异常');
      if (useBoothStore.getState().sessionStatus === 'connecting') {
        setErrorMessage(`语音中继链路异常: ${msg}`);
      } else if (useBoothStore.getState().sessionStatus === 'connected') {
        setErrorMessage(`实时语音异常: ${msg}`);
      }
    },
    onAudioDelta: (chunk) => {
      audioGraph.enqueueAudioChunk(chunk);
      useTelemetryStore.getState().incrementAudioChunks();
    },
    onTextDelta: (text) => {
      if (!asstSpeechStartTimeRef.current) {
        asstSpeechStartTimeRef.current = Date.now();
      }
      transcriptionRef.current.feedDelta('assistant', text);
    },
    onTranscriptDelta: (transcript) => {
      if (!userSpeechStartTimeRef.current) {
        userSpeechStartTimeRef.current = asstSpeechStartTimeRef.current
          ? asstSpeechStartTimeRef.current - 1
          : Date.now();
      }
      transcriptionRef.current.feedDelta('user', transcript);
    },
    onTranscriptCompleted: (fullTranscript) => {
      transcriptionRef.current.setCompletedTranscript?.('user', fullTranscript);
      if (lastUserTurnIdRef.current) {
        const cleaned = fullTranscript
          .replace(
            /^(?:[呃啊嗯哦喔哎呀]|那个|就是说|然后呢|然后|这个|就是|要是你想说啥|[.,!?，。！？、…~～:：;；\s—\-_])+/u,
            '',
          )
          .trim();
        if (cleaned) {
          const currentStage = useBoothStore.getState().cbtStage;
          const turnTimestamp = lastUserTurnTimestampRef.current || Date.now() - 1;
          addDialogueTurn({
            id: lastUserTurnIdRef.current,
            role: 'user',
            content: cleaned,
            timestamp: turnTimestamp,
            stage: currentStage,
          });
          useTelemetryStore.getState().appendFinalTranscript({
            id: lastUserTurnIdRef.current,
            role: 'user',
            text: cleaned,
            timestamp: turnTimestamp,
          });
        }
      }
    },
    onSpeechStarted: () => {
      lastUserTurnIdRef.current = null;
      lastUserTurnTimestampRef.current = null;
      if (audioGraph.isPlaybackActive()) return;
      if (!userSpeechStartTimeRef.current) {
        userSpeechStartTimeRef.current = Date.now();
      }
      setDuplexPhase('listening');
      useTelemetryStore.getState().setDuplexPhase('listening');
      audioGraph.setAiThinking(false);
    },
    onSpeechStopped: () => {
      if (
        useBoothStore.getState().sessionStatus === 'connected' &&
        !audioGraph.isPlaybackActive()
      ) {
        setDuplexPhase('thinking');
        useTelemetryStore.getState().setDuplexPhase('thinking');
        audioGraph.setAiThinking(true);
      }
    },
    onTurnStart: () => {
      if (!asstSpeechStartTimeRef.current) {
        asstSpeechStartTimeRef.current = Date.now();
      }
      if (audioGraph.isPlaybackActive()) {
        setDuplexPhase('speaking');
        useTelemetryStore.getState().setDuplexPhase('speaking');
        audioGraph.setAiThinking(false);
        audioGraph.setAiSpeaking(true);
      } else {
        setDuplexPhase('thinking');
        useTelemetryStore.getState().setDuplexPhase('thinking');
        audioGraph.setAiThinking(true);
      }
    },
    onTurnEnd: () => {
      if (!audioGraph.isPlaybackActive()) {
        setDuplexPhase('listening');
        useTelemetryStore.getState().setDuplexPhase('listening');
        audioGraph.setAiThinking(false);
        audioGraph.setAiSpeaking(false);
      }

      const { lastUserTurnId, lastUserTurnTimestamp } = finalizeDialogueTurns(
        transcriptionRef.current,
        userSpeechStartTimeRef.current,
        asstSpeechStartTimeRef.current,
        toolDispatcherRef.current,
      );
      userSpeechStartTimeRef.current = null;
      asstSpeechStartTimeRef.current = null;
      lastUserTurnIdRef.current = lastUserTurnId;
      lastUserTurnTimestampRef.current = lastUserTurnTimestamp;
    },
    onToolCall: async (toolCall) => {
      if (toolDispatcherRef.current) {
        await toolDispatcherRef.current.dispatch(toolCall, clientRef.current);
      }
    },
    onCrisisInterception: (details) => {
      audioGraph.stopPlayback(50);
      audioGraph.stopRecording();
      toolDispatcherRef.current?.getFsm().escalateCrisis(details.message);
      setCBTStage('Crisis_Escalation');
      useTelemetryStore.getState().setCbtStage('Crisis_Escalation');
      setCrisisOverlayOpen(true);

      const userStartTime = userSpeechStartTimeRef.current || Date.now() - 1;
      userSpeechStartTimeRef.current = null;
      const userSeg = transcriptionRef.current.finalizeCurrentTurn('user', userStartTime);
      if (userSeg?.text) {
        addDialogueTurn({
          id: userSeg.id,
          role: 'user',
          content: userSeg.text,
          timestamp: userSeg.timestamp,
          stage: 'Crisis_Escalation',
        });
        useTelemetryStore.getState().appendFinalTranscript({
          id: userSeg.id,
          role: 'user',
          text: userSeg.text,
          timestamp: userSeg.timestamp,
        });
      }

      addDialogueTurn({
        id: `turn_${Date.now()}`,
        role: 'assistant',
        content: details.message,
        timestamp: Date.now(),
        stage: 'Crisis_Escalation',
      });
    },
    onShadowDirective: (directive) => {
      useTelemetryStore.getState().addShadowDirective(directive);
    },
    onSafetyCheck: (check) => {
      useTelemetryStore.getState().setSafetyCheck(check);
    },
    onPingPong: (rttMs) => {
      useTelemetryStore.getState().updateRtt(rttMs);
      audioGraph.updateNetworkQuality(rttMs);
    },
    onTTFT: (ttftMs) => {
      useTelemetryStore.getState().updateTtft(ttftMs);
    },
    onRemoteStream: (stream) => {
      audioGraph.setupWebRtcRemoteStream(stream).catch((err) => {
        console.error('[SessionCallbacks] 设置远程音频流失败:', err);
      });
    },
    onTransportChange: (transport) => {
      useTelemetryStore.getState().setActiveTransport(transport);
    },
  };
}
