import { useRef, useCallback, useEffect } from 'react';
import { useBoothStore } from '../store/boothStore';
import { useAuthStore } from '../store/authStore';
import { useModeStore } from '../store/modeStore';
import { useTelemetryStore } from '../store/telemetryStore';
import { MiniMaxRealtimeClient } from '../lib/minimax/client';
import { RealtimeToolDispatcher } from '../lib/tools/toolDispatcher';
import { DefaultRagProvider } from '../lib/pipelines/rag/defaultRagProvider';
import { BufferedTranscriptionPipeline } from '../lib/pipelines/transcription/bufferedTranscription';
import { safeRandomId } from '../lib/utils';
import { apiFetch } from '../lib/api';
import { useVoiceAudio } from './useVoiceAudio';
import { useSessionPersistence } from './useSessionPersistence';

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

    try {
      let currentToken = useAuthStore.getState().token;
      let currentUser = useAuthStore.getState().user;
      if (!currentToken) {
        try {
          const deviceId =
            useModeStore.getState().runMode === 'test' ? 'telemetry-test-bench' : 'kiosk-booth-01';
          const res = await apiFetch('/api/auth/kiosk-login', {
            method: 'POST',
            body: JSON.stringify({ deviceId }),
          });
          const data = await res.json();
          if (data.success && data.user && data.token) {
            useAuthStore.getState().login(data.user, data.token);
            currentToken = data.token;
            currentUser = data.user;
          }
        } catch (authErr) {
          console.warn('[VoiceSession] 自动获取访客 Token 失败:', authErr);
        }
      }

      const audioGraph = getAudioGraph();
      audioGraph.setOnPlaybackStateChange((isPlaying) => {
        if (isPlaying) {
          clientRef.current?.updateTurnDetection('speaking');
          setDuplexPhase('speaking');
          useTelemetryStore.getState().setDuplexPhase('speaking');
        } else {
          clientRef.current?.updateTurnDetection('listening');
          setDuplexPhase('listening');
          useTelemetryStore.getState().setDuplexPhase('listening');
        }
      });

      audioGraph.setOnLocalInterrupt((playedMs) => {
        useTelemetryStore.getState().incrementBargeIns();
        clientRef.current?.updateTurnDetection('listening');
        const itemId = clientRef.current?.getCurrentResponseItemId();
        clientRef.current?.interrupt({
          itemId: itemId || undefined,
          audioEndMs: playedMs,
        });
        setDuplexPhase('listening');
        useTelemetryStore.getState().setDuplexPhase('listening');
        const asstSeg = transcriptionRef.current.finalizeCurrentTurn('assistant');
        if (asstSeg?.text) {
          addDialogueTurn({
            id: asstSeg.id,
            role: 'assistant',
            content: asstSeg.text,
            timestamp: asstSeg.timestamp,
            stage: useBoothStore.getState().cbtStage,
          });
          useTelemetryStore.getState().appendFinalTranscript({
            role: 'assistant',
            text: asstSeg.text,
            timestamp: asstSeg.timestamp,
          });
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

      clientRef.current = new MiniMaxRealtimeClient({
        sessionId: sessionIdRef.current,
        userId: currentUser?.uid || currentUser?.userName || user?.uid || user?.userName,
        username:
          currentUser?.displayName || currentUser?.userName || user?.displayName || user?.userName,
        token: currentToken || undefined,
        callbacks: {
          onOpen: () => {
            setSessionStatus('connected');
            setHookState('connected');
            setDuplexPhase('listening');
            useTelemetryStore.getState().setIsConnected(true);
            useTelemetryStore.getState().setDuplexPhase('listening');
          },
          onClose: () => {
            useTelemetryStore.getState().setIsConnected(false);
            useTelemetryStore.getState().setDuplexPhase('idle');
            if (useBoothStore.getState().sessionStatus === 'connected') {
              endCallRef.current?.();
            } else if (useBoothStore.getState().sessionStatus === 'connecting') {
              setErrorMessage('语音服务器连接失败，请检查网络或稍后重试');
              setSessionStatus('error');
              setHookState('on_hook');
              if (clientRef.current) {
                clientRef.current.disconnect();
                clientRef.current = null;
              }
              cleanupAudio();
            }
          },
          onError: (err: any) => {
            console.warn('[VoiceSession] 中继网络通知:', err);
            if (useBoothStore.getState().sessionStatus === 'connecting') {
              setErrorMessage('语音中继链路异常，请确认网络环境或刷新重试');
            }
          },
          onAudioDelta: (chunk) => {
            audioGraph.enqueueAudioChunk(chunk);
            useTelemetryStore.getState().incrementAudioChunks();
          },
          onTextDelta: (text) => {
            transcriptionRef.current.feedDelta('assistant', text);
            useTelemetryStore.getState().setStreamingAssistantText(text);
          },
          onTranscriptDelta: (transcript) => {
            transcriptionRef.current.feedDelta('user', transcript);
            useTelemetryStore.getState().setStreamingUserText(transcript);
          },
          onSpeechStarted: (details) => {
            const isPlaying = audioGraph.isPlaybackActive();
            const playedMs = audioGraph.getPlaybackDurationMs();
            // 若 AI 正在播音，但在最初 350ms 内捕获到的多为本地扬声器瞬态泄漏或杂音，予以保护忽略
            if (isPlaying && playedMs < 350) {
              return;
            }
            if (isPlaying) {
              useTelemetryStore.getState().incrementBargeIns();
              audioGraph.stopPlayback(150);
              const itemId = details?.itemId || clientRef.current?.getCurrentResponseItemId();
              clientRef.current?.interrupt({
                itemId: itemId || undefined,
                audioEndMs: playedMs,
              });
              setDuplexPhase('listening');
              useTelemetryStore.getState().setDuplexPhase('listening');
              const asstSeg = transcriptionRef.current.finalizeCurrentTurn('assistant');
              if (asstSeg?.text) {
                addDialogueTurn({
                  id: asstSeg.id,
                  role: 'assistant',
                  content: asstSeg.text,
                  timestamp: asstSeg.timestamp,
                  stage: useBoothStore.getState().cbtStage,
                });
                useTelemetryStore.getState().appendFinalTranscript({
                  role: 'assistant',
                  text: asstSeg.text,
                  timestamp: asstSeg.timestamp,
                });
              }
            }
          },
          onSpeechStopped: () => {
            if (
              useBoothStore.getState().sessionStatus === 'connected' &&
              useBoothStore.getState().duplexPhase === 'listening'
            ) {
              setDuplexPhase('thinking');
              useTelemetryStore.getState().setDuplexPhase('thinking');
            }
          },
          onTurnStart: () => {
            if (audioGraph.isPlaybackActive()) {
              setDuplexPhase('speaking');
              useTelemetryStore.getState().setDuplexPhase('speaking');
            } else {
              setDuplexPhase('thinking');
              useTelemetryStore.getState().setDuplexPhase('thinking');
            }
            audioGraph.setAiSpeaking(true);
          },
          onTurnEnd: () => {
            // 注意：此处为服务端 WebSocket 数据流传输完毕，客户端可能仍在平滑播放。
            // 严禁在此粗暴切断 setAiSpeaking(false)，避免截断尚未播完的尾音并产生自打断。
            if (!audioGraph.isPlaybackActive()) {
              setDuplexPhase('listening');
              useTelemetryStore.getState().setDuplexPhase('listening');
            }
            const asstSeg = transcriptionRef.current.finalizeCurrentTurn('assistant');
            if (asstSeg?.text) {
              addDialogueTurn({
                id: asstSeg.id,
                role: 'assistant',
                content: asstSeg.text,
                timestamp: asstSeg.timestamp,
                stage: useBoothStore.getState().cbtStage,
              });
              useTelemetryStore.getState().appendFinalTranscript({
                role: 'assistant',
                text: asstSeg.text,
                timestamp: asstSeg.timestamp,
              });
            }
            const userSeg = transcriptionRef.current.finalizeCurrentTurn('user');
            if (userSeg?.text) {
              const currentStage = useBoothStore.getState().cbtStage;
              addDialogueTurn({
                id: userSeg.id,
                role: 'user',
                content: userSeg.text,
                timestamp: userSeg.timestamp,
                stage: currentStage,
              });
              useTelemetryStore.getState().appendFinalTranscript({
                role: 'user',
                text: userSeg.text,
                timestamp: userSeg.timestamp,
              });
              if (toolDispatcherRef.current) {
                const pacing = toolDispatcherRef.current.getFsm().recordTurn('user');
                if (pacing.autoPromotedStage) {
                  setCBTStage(pacing.autoPromotedStage);
                  useTelemetryStore.getState().setCbtStage(pacing.autoPromotedStage);
                }
              }
            }
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
          },
          onTTFT: (ttftMs) => {
            useTelemetryStore.getState().updateTtft(ttftMs);
          },
        },
      });

      await audioGraph.startRecording((pcm16Base64) => {
        if (clientRef.current?.ready) {
          clientRef.current.sendAudioChunk(pcm16Base64);
        }
      });

      clientRef.current.connect();
      startVisualizer();

      setCallDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      if (telemetryTimerRef.current) clearInterval(telemetryTimerRef.current);
      telemetryTimerRef.current = setInterval(() => {
        if (audioGraphRef.current) {
          const metrics = audioGraphRef.current.getJitterMetrics();
          const inLvl = audioGraphRef.current.getInputLevel();
          const outLvl = audioGraphRef.current.getOutputLevel();
          useTelemetryStore.getState().updateJitterMetrics(metrics);
          useTelemetryStore.getState().updateAudioLevels(inLvl, outLvl);
        }
      }, 100);
    } catch (err: any) {
      console.error('[VoiceSession] 启动失败:', err);
      let friendlyMsg = '麦克风设备授权或初始化失败';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        friendlyMsg = '麦克风权限已被拒绝，请在浏览器地址栏中允许使用麦克风后重试';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        friendlyMsg = '未检测到可用的麦克风输入设备，请连接麦克风后重试';
      } else if (typeof window !== 'undefined' && !window.isSecureContext) {
        friendlyMsg = '浏览器安全限制：语音通话需要 HTTPS 安全环境支持';
      } else if (err?.message) {
        friendlyMsg = `启动失败: ${err.message}`;
      }
      setErrorMessage(friendlyMsg);
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
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (telemetryTimerRef.current) {
      clearInterval(telemetryTimerRef.current);
      telemetryTimerRef.current = null;
    }
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

    const asstSeg = transcriptionRef.current.finalizeCurrentTurn('assistant');
    if (asstSeg?.text) {
      addDialogueTurn({
        id: asstSeg.id,
        role: 'assistant',
        content: asstSeg.text,
        timestamp: asstSeg.timestamp,
        stage: useBoothStore.getState().cbtStage,
      });
      useTelemetryStore.getState().appendFinalTranscript({
        role: 'assistant',
        text: asstSeg.text,
        timestamp: asstSeg.timestamp,
      });
    }
    const userSeg = transcriptionRef.current.finalizeCurrentTurn('user');
    if (userSeg?.text) {
      addDialogueTurn({
        id: userSeg.id,
        role: 'user',
        content: userSeg.text,
        timestamp: userSeg.timestamp,
        stage: useBoothStore.getState().cbtStage,
      });
      useTelemetryStore.getState().appendFinalTranscript({
        role: 'user',
        text: userSeg.text,
        timestamp: userSeg.timestamp,
      });
    }

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
    addDialogueTurn,
    persistSession,
    user,
    setLatestReport,
  ]);
  endCallRef.current = endCall;

  const interrupt = useCallback(() => {
    useTelemetryStore.getState().incrementBargeIns();
    const playedMs = audioGraphRef.current ? audioGraphRef.current.getPlaybackDurationMs() : 0;
    if (audioGraphRef.current) {
      audioGraphRef.current.stopPlayback(150);
    }
    if (clientRef.current) {
      clientRef.current.updateTurnDetection('listening');
      const itemId = clientRef.current.getCurrentResponseItemId();
      clientRef.current.interrupt({
        itemId: itemId || undefined,
        audioEndMs: playedMs,
      });
    }
    setDuplexPhase('listening');
    useTelemetryStore.getState().setDuplexPhase('listening');
    const asstSeg = transcriptionRef.current.finalizeCurrentTurn('assistant');
    if (asstSeg?.text) {
      addDialogueTurn({
        id: asstSeg.id,
        role: 'assistant',
        content: asstSeg.text,
        timestamp: asstSeg.timestamp,
        stage: useBoothStore.getState().cbtStage,
      });
      useTelemetryStore.getState().appendFinalTranscript({
        role: 'assistant',
        text: asstSeg.text,
        timestamp: asstSeg.timestamp,
      });
    }
  }, [audioGraphRef, setDuplexPhase, addDialogueTurn]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioGraphRef.current) {
      audioGraphRef.current.setMute(nextMuted);
    }
  }, [isMuted, setIsMuted, audioGraphRef]);

  useEffect(() => {
    const handleCrisisEndCall = () => {
      void endCall();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('rethink:crisis:end_call', handleCrisisEndCall);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('rethink:crisis:end_call', handleCrisisEndCall);
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (telemetryTimerRef.current) clearInterval(telemetryTimerRef.current);
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
