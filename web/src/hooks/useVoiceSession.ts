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
      audioGraph.setAiThinking(true);
      audioGraph.setOnPlaybackStateChange((isPlaying) => {
        if (isPlaying) {
          clientRef.current?.updateTurnDetection('speaking');
          setDuplexPhase('speaking');
          useTelemetryStore.getState().setDuplexPhase('speaking');
          audioGraph.setAiThinking(false);
          audioGraph.setAiSpeaking(true);
        } else {
          clientRef.current?.updateTurnDetection('listening');
          setDuplexPhase('listening');
          useTelemetryStore.getState().setDuplexPhase('listening');
          audioGraph.setAiThinking(false);
          audioGraph.setAiSpeaking(false);
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
        audioGraph.setAiThinking(false);
        audioGraph.setAiSpeaking(false);
        const interruptTime = Date.now();
        userSpeechStartTimeRef.current = userSpeechStartTimeRef.current || interruptTime;
        const asstStartTime = asstSpeechStartTimeRef.current;
        asstSpeechStartTimeRef.current = null;
        const truncatedAsstTime =
          asstStartTime && asstStartTime < interruptTime ? asstStartTime : interruptTime - 1;
        const asstSeg = transcriptionRef.current.finalizeCurrentTurn(
          'assistant',
          truncatedAsstTime,
        );
        if (asstSeg?.text) {
          addDialogueTurn({
            id: asstSeg.id,
            role: 'assistant',
            content: asstSeg.text,
            timestamp: asstSeg.timestamp,
            stage: useBoothStore.getState().cbtStage,
          });
          useTelemetryStore.getState().appendFinalTranscript({
            id: asstSeg.id,
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

      const preferredTransport = useTelemetryStore.getState().preferredTransport || 'auto';
      clientRef.current = new MiniMaxRealtimeClient({
        sessionId: sessionIdRef.current,
        userId: currentUser?.uid || currentUser?.userName || user?.uid || user?.userName,
        username:
          currentUser?.displayName || currentUser?.userName || user?.displayName || user?.userName,
        token: currentToken || undefined,
        transport: preferredTransport,
        callbacks: {
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
                const failReason = reason
                  ? `连接中断: ${reason}`
                  : `语音连接意外断开 (错误码: ${code})`;
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
            // 播放期间忽略服务端 VAD 的 speech_started，完全由本地带回声抑制的 BargeInDetector 处理真实打断
            if (audioGraph.isPlaybackActive()) {
              return;
            }
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
            // 注意：此处为服务端 WebSocket 数据流传输完毕，客户端可能仍在平滑播放。
            // 严禁在此粗暴切断 setAiSpeaking(false)，避免截断尚未播完的尾音并产生自打断。
            if (!audioGraph.isPlaybackActive()) {
              setDuplexPhase('listening');
              useTelemetryStore.getState().setDuplexPhase('listening');
              audioGraph.setAiThinking(false);
              audioGraph.setAiSpeaking(false);
            }

            let userStartTime = userSpeechStartTimeRef.current;
            let asstStartTime = asstSpeechStartTimeRef.current;

            // 强制因果物理时序保障：模型回复必然因用户发言而起，User 发言物理起点必须严格早于 Assistant
            if (asstStartTime) {
              if (!userStartTime || userStartTime >= asstStartTime) {
                userStartTime = asstStartTime - 1;
              }
            } else if (userStartTime) {
              asstStartTime = Date.now();
              if (userStartTime >= asstStartTime) {
                userStartTime = asstStartTime - 1;
              }
            }

            // 严格先结算用户轮次 (User Turn)，确保先入历史与仪表盘双轨流
            userSpeechStartTimeRef.current = null;
            const userSeg = transcriptionRef.current.finalizeCurrentTurn(
              'user',
              userStartTime || undefined,
            );
            if (userSeg?.text) {
              lastUserTurnIdRef.current = userSeg.id;
              lastUserTurnTimestampRef.current = userSeg.timestamp;
              const currentStage = useBoothStore.getState().cbtStage;
              addDialogueTurn({
                id: userSeg.id,
                role: 'user',
                content: userSeg.text,
                timestamp: userSeg.timestamp,
                stage: currentStage,
              });
              useTelemetryStore.getState().appendFinalTranscript({
                id: userSeg.id,
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

            // 随后结算助手轮次 (Assistant Turn)
            asstSpeechStartTimeRef.current = null;
            const asstSeg = transcriptionRef.current.finalizeCurrentTurn(
              'assistant',
              asstStartTime || undefined,
            );
            if (asstSeg?.text) {
              if (userSeg?.text && asstSeg.timestamp <= userSeg.timestamp) {
                asstSeg.timestamp = userSeg.timestamp + 1;
              }
              addDialogueTurn({
                id: asstSeg.id,
                role: 'assistant',
                content: asstSeg.text,
                timestamp: asstSeg.timestamp,
                stage: useBoothStore.getState().cbtStage,
              });
              useTelemetryStore.getState().appendFinalTranscript({
                id: asstSeg.id,
                role: 'assistant',
                text: asstSeg.text,
                timestamp: asstSeg.timestamp,
              });
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

            // 优先结算可能残留的用户发言
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
            audioGraph.setupWebRtcRemoteStream(stream);
          },
          onTransportChange: (transport) => {
            useTelemetryStore.getState().setActiveTransport(transport);
          },
        },
      });

      await audioGraph.startRecording((pcm16Base64) => {
        if (clientRef.current?.ready) {
          clientRef.current.sendAudioChunk(pcm16Base64);
        }
      });

      const micStream = audioGraph.getMicrophoneStream();
      clientRef.current.connect(micStream || undefined);
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

    // 挂机前优先结算可能残留的用户发言
    let userStartTime = userSpeechStartTimeRef.current;
    let asstStartTime = asstSpeechStartTimeRef.current;
    if (asstStartTime && (!userStartTime || userStartTime >= asstStartTime)) {
      userStartTime = asstStartTime - 1;
    }
    userSpeechStartTimeRef.current = null;
    const userSeg = transcriptionRef.current.finalizeCurrentTurn(
      'user',
      userStartTime || undefined,
    );
    if (userSeg?.text) {
      addDialogueTurn({
        id: userSeg.id,
        role: 'user',
        content: userSeg.text,
        timestamp: userSeg.timestamp,
        stage: useBoothStore.getState().cbtStage,
      });
      useTelemetryStore.getState().appendFinalTranscript({
        id: userSeg.id,
        role: 'user',
        text: userSeg.text,
        timestamp: userSeg.timestamp,
      });
    }

    // 随后结算助手最后回复
    asstSpeechStartTimeRef.current = null;
    const asstSeg = transcriptionRef.current.finalizeCurrentTurn(
      'assistant',
      asstStartTime || undefined,
    );
    if (asstSeg?.text) {
      if (userSeg?.text && asstSeg.timestamp <= userSeg.timestamp) {
        asstSeg.timestamp = userSeg.timestamp + 1;
      }
      addDialogueTurn({
        id: asstSeg.id,
        role: 'assistant',
        content: asstSeg.text,
        timestamp: asstSeg.timestamp,
        stage: useBoothStore.getState().cbtStage,
      });
      useTelemetryStore.getState().appendFinalTranscript({
        id: asstSeg.id,
        role: 'assistant',
        text: asstSeg.text,
        timestamp: asstSeg.timestamp,
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
    const interruptTime = Date.now();
    userSpeechStartTimeRef.current = userSpeechStartTimeRef.current || interruptTime;
    const playedMs = audioGraphRef.current ? audioGraphRef.current.getPlaybackDurationMs() : 0;
    if (audioGraphRef.current) {
      audioGraphRef.current.stopPlayback(150);
      audioGraphRef.current.setAiThinking(false);
      audioGraphRef.current.setAiSpeaking(false);
    }
    if (clientRef.current) {
      clientRef.current.updateTurnDetection('listening');
      const itemId = clientRef.current?.getCurrentResponseItemId();
      clientRef.current.interrupt({
        itemId: itemId || undefined,
        audioEndMs: playedMs,
      });
    }
    setDuplexPhase('listening');
    useTelemetryStore.getState().setDuplexPhase('listening');
    const asstStartTime = asstSpeechStartTimeRef.current;
    asstSpeechStartTimeRef.current = null;
    const truncatedAsstTime =
      asstStartTime && asstStartTime < interruptTime ? asstStartTime : interruptTime - 1;
    const asstSeg = transcriptionRef.current.finalizeCurrentTurn('assistant', truncatedAsstTime);
    if (asstSeg?.text) {
      addDialogueTurn({
        id: asstSeg.id,
        role: 'assistant',
        content: asstSeg.text,
        timestamp: asstSeg.timestamp,
        stage: useBoothStore.getState().cbtStage,
      });
      useTelemetryStore.getState().appendFinalTranscript({
        id: asstSeg.id,
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
    const unsub = transcriptionRef.current.subscribe((seg) => {
      if (!seg.isFinal) {
        if (seg.speaker === 'user') {
          useTelemetryStore.getState().setStreamingUserText(seg.text);
        } else {
          useTelemetryStore.getState().setStreamingAssistantText(seg.text);
        }
      }
    });
    return () => {
      unsub();
    };
  }, []);

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
