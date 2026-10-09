import type { Env } from '../../types';
import { RealtimeGatewayAdapter } from '../../adapters/realtime-gateway-adapter';
import { isL1Crisis, checkL2FlashSafety } from '../../lib/safety-filter';
import { getSituationalMemory } from '../../lib/memory-store';
import { BargeInCoordinator } from './barge-in-coordinator';
import { CrisisHandler } from './crisis-handler';
import { ShadowReasoningPipeline } from './shadow-reasoning-pipeline';
import { SessionReporter } from './session-reporter';
import { CbtStateMachine } from '../../lib/cbt-fsm';

export interface RelayQueryParams {
  sessionId?: string;
  userId?: string;
  username?: string;
  model?: string;
}

/**
 * 全双工实时语音会话调度协调器 (RelaySessionCoordinator)
 * 职责：编排上下游 WebSocket 链路、时序打断、双轨危机检测与影子大脑干预
 */
export class RelaySessionCoordinator {
  public static async startSession(
    serverWs: WebSocket,
    clientWs: WebSocket,
    env: Env,
    query: RelayQueryParams,
    ctx?: ExecutionContext,
  ): Promise<Response> {
    const config = RealtimeGatewayAdapter.resolveGatewayConfig(env, query.model);

    if (!config.upstreamKey) {
      serverWs.send(
        RealtimeGatewayAdapter.formatRealtimeError(
          'credentials_missing',
          '未检测到 Realtime 实时网关访问凭证，请先配置环境变量 REALTIME_UPSTREAM_KEY',
        ),
      );
      RealtimeGatewayAdapter.safeClose(serverWs, 4401, 'Unauthorized: Missing upstream key');
      return new Response(null, { status: 101, webSocket: clientWs });
    }

    try {
      const isDirectLive = RealtimeGatewayAdapter.isDirectLiveEndpoint(config.upstreamBaseUrl);
      const wsEndpoint = RealtimeGatewayAdapter.buildUpstreamWsUrl(
        config.upstreamBaseUrl,
        config.upstreamModel,
      );

      const headers: Record<string, string> = {
        Upgrade: 'websocket',
        Authorization: `Bearer ${config.upstreamKey}`,
        'api-key': config.upstreamKey,
      };
      if (!isDirectLive) {
        const authSubprotocol = `${atob('b3BlbmFp')}-insecure-api-key.${config.upstreamKey}`;
        headers['Sec-WebSocket-Protocol'] = `realtime, ${authSubprotocol}`;
      }

      const upstreamRes = await fetch(wsEndpoint, { headers });
      const upstreamWs = upstreamRes.webSocket;
      if (!upstreamWs) {
        serverWs.send(
          RealtimeGatewayAdapter.formatRealtimeError(
            'upstream_unavailable',
            '无法连接至实时语音上游网关',
          ),
        );
        RealtimeGatewayAdapter.safeClose(serverWs, 1011, 'Upstream gateway unavailable');
        return new Response(null, { status: 101, webSocket: clientWs });
      }

      upstreamWs.accept();

      const sessionId = query.sessionId || `sess_${Date.now()}`;
      const requestedUserId = query.userId || query.username || '';
      const sessionStartTime = Date.now();
      const cbtFsm = new CbtStateMachine();
      const coordinator = new BargeInCoordinator();
      const crisisHandler = new CrisisHandler(
        serverWs,
        upstreamWs,
        env.CRISIS_WEBHOOK_URL,
        sessionId,
        ctx,
      );

      const currentMemory = await getSituationalMemory(env, requestedUserId);
      let studentName = currentMemory?.userName || '';
      const dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      const openRouterKey = env.OPENROUTER_API_KEY || config.upstreamKey || '';
      const openRouterBaseUrl =
        env.OPENROUTER_BASE_URL ||
        (env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : config.upstreamBaseUrl) ||
        'https://openrouter.ai/api/v1';
      const openRouterModel = env.OPENROUTER_MODEL || atob('Z29vZ2xlL2dlbWluaS0yLjUtZmxhc2g=');

      const shadowPipeline = new ShadowReasoningPipeline(env, {
        upstreamKey: config.upstreamKey,
        openRouterKey,
        openRouterBaseUrl,
        openRouterModel,
      });

      let isSessionReady = !isDirectLive;
      let activeDelegationId: string | null = null;

      // 绑定客户端事件通道
      const { flushEarlyQueue } = this.bindClientEvents({
        serverWs,
        upstreamWs,
        coordinator,
        currentMemory,
        isDirectLive,
        isSessionReady: () => isSessionReady,
      });

      // 云端直连架构初始化发送 session.start 启动帧
      if (isDirectLive) {
        const startPayload = RealtimeGatewayAdapter.buildSessionStartPayload(
          {},
          currentMemory,
          config.upstreamModel,
        );
        upstreamWs.send(JSON.stringify(startPayload));
      }

      // 绑定上游网关事件通道
      this.bindUpstreamEvents({
        serverWs,
        upstreamWs,
        coordinator,
        crisisHandler,
        shadowPipeline,
        dialogueHistory,
        cbtFsm,
        openRouterConfig: { openRouterKey, openRouterBaseUrl, openRouterModel },
        getStudentName: () => studentName,
        setStudentName: (name) => {
          studentName = name;
        },
        getMemory: () => currentMemory,
        isDirectLive,
        onSessionReady: () => {
          isSessionReady = true;
          flushEarlyQueue();
        },
        getActiveDelegationId: () => activeDelegationId,
        setActiveDelegationId: (id) => {
          activeDelegationId = id;
        },
      });

      // 绑定断开与生命周期事件
      this.bindLifecycleEvents({
        serverWs,
        upstreamWs,
        coordinator,
        crisisHandler,
        env,
        sessionId,
        requestedUserId,
        dialogueHistory,
        getStudentName: () => studentName,
        sessionStartTime,
        cbtFsm,
        ctx,
      });

      return new Response(null, { status: 101, webSocket: clientWs });
    } catch (err: any) {
      RealtimeGatewayAdapter.safeClose(serverWs, 1011, 'Exception: ' + (err?.message || 'unknown'));
      return new Response(null, { status: 101, webSocket: clientWs });
    }
  }

  private static bindClientEvents(params: {
    serverWs: WebSocket;
    upstreamWs: WebSocket;
    coordinator: BargeInCoordinator;
    currentMemory: any;
    isDirectLive: boolean;
    isSessionReady: () => boolean;
  }): { flushEarlyQueue: () => void } {
    const { serverWs, upstreamWs, coordinator, currentMemory, isDirectLive, isSessionReady } =
      params;
    const earlyMessageQueue: any[] = [];
    const MAX_EARLY_QUEUE_SIZE = 100;

    const processAndSend = (eventData: any) => {
      const payload = this.parseJsonSafely(eventData);

      if (payload?.type === 'client.ping') {
        if (serverWs.readyState === WebSocket.OPEN) {
          serverWs.send(
            JSON.stringify({
              type: 'server.pong',
              clientTimestamp: payload.timestamp,
              serverTime: Date.now(),
            }),
          );
        }
        return;
      }

      if (payload?.type === 'response.cancel') {
        coordinator.interrupt();
      }

      if (payload?.type === 'session.update' && payload.session) {
        if (isDirectLive) {
          return;
        }
        const cleanSession = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(
          payload.session,
          currentMemory,
        );
        const upstreamSession = RealtimeGatewayAdapter.buildUpstreamSessionPayload(cleanSession);
        upstreamWs.send(
          JSON.stringify({
            type: 'session.update',
            session: upstreamSession,
          }),
        );
        return;
      }

      if (payload?.type === 'response.create') {
        if (!isDirectLive) {
          upstreamWs.send(JSON.stringify(payload));
        }
        return;
      }

      const { transformed, shouldDrop } = RealtimeGatewayAdapter.transformClientEvent(
        payload || eventData,
        isDirectLive,
      );
      if (shouldDrop) return;

      if (transformed && typeof transformed === 'object') {
        upstreamWs.send(JSON.stringify(transformed));
      } else {
        upstreamWs.send(eventData);
      }
    };

    const flushEarlyQueue = () => {
      while (earlyMessageQueue.length > 0) {
        const item = earlyMessageQueue.shift();
        if (item) {
          try {
            processAndSend(item);
          } catch {}
        }
      }
    };

    upstreamWs.addEventListener('open', () => {
      if (isSessionReady()) {
        flushEarlyQueue();
      }
    });

    serverWs.addEventListener('message', (event) => {
      try {
        if (upstreamWs.readyState !== WebSocket.OPEN || !isSessionReady()) {
          if (earlyMessageQueue.length < MAX_EARLY_QUEUE_SIZE) {
            earlyMessageQueue.push(event.data);
          }
          return;
        }
        processAndSend(event.data);
      } catch {}
    });

    return { flushEarlyQueue };
  }

  private static parseJsonSafely(data: any): any {
    try {
      if (typeof data === 'string') return JSON.parse(data);
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        return JSON.parse(new TextDecoder().decode(data));
      }
    } catch {}
    return null;
  }

  private static bindUpstreamEvents(params: {
    serverWs: WebSocket;
    upstreamWs: WebSocket;
    coordinator: BargeInCoordinator;
    crisisHandler: CrisisHandler;
    shadowPipeline: ShadowReasoningPipeline;
    dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    cbtFsm: CbtStateMachine;
    openRouterConfig: {
      openRouterKey: string;
      openRouterBaseUrl?: string;
      openRouterModel: string;
    };
    getStudentName: () => string;
    setStudentName: (name: string) => void;
    getMemory: () => any;
    isDirectLive: boolean;
    onSessionReady: () => void;
    getActiveDelegationId: () => string | null;
    setActiveDelegationId: (id: string | null) => void;
  }): void {
    const {
      serverWs,
      upstreamWs,
      coordinator,
      crisisHandler,
      shadowPipeline,
      dialogueHistory,
      cbtFsm,
      openRouterConfig,
      getStudentName,
      setStudentName,
      getMemory,
      isDirectLive,
      onSessionReady,
      getActiveDelegationId,
      setActiveDelegationId,
    } = params;

    const processedItemIds = new Set<string>();

    upstreamWs.addEventListener('message', async (event) => {
      try {
        let payload: any = null;
        if (typeof event.data === 'string') {
          try {
            payload = JSON.parse(event.data);
          } catch {}
        } else if (event.data && typeof (event.data as any).text === 'function') {
          try {
            payload = JSON.parse(await (event.data as any).text());
          } catch {}
        }

        if (payload && typeof payload === 'object') {
          if (isDirectLive && payload.type === 'session.started') {
            onSessionReady();
          }
          if (
            isDirectLive &&
            payload.type === 'session.delegation.created' &&
            payload.delegation_id
          ) {
            setActiveDelegationId(payload.delegation_id);
          }

          const { transformed, secondaryEvent } = RealtimeGatewayAdapter.transformUpstreamEvent(
            payload,
            isDirectLive,
          );

          if (serverWs.readyState === WebSocket.OPEN) {
            serverWs.send(JSON.stringify(transformed));
            if (secondaryEvent) {
              serverWs.send(JSON.stringify(secondaryEvent));
            }
          }
        }

        if (!payload || typeof payload.type !== 'string') return;

        if (
          payload.type === 'input_audio_buffer.speech_started' ||
          payload.type === 'session.input_audio.speech_started'
        ) {
          coordinator.interrupt();
          return;
        }

        const extractedUserText = this.extractTranscriptText(payload);
        const currentItemId = payload.item_id || payload.item?.id || payload.event_id;

        if (extractedUserText) {
          if (currentItemId && processedItemIds.has(currentItemId)) return;
          if (currentItemId) {
            processedItemIds.add(currentItemId);
            if (processedItemIds.size > 50) {
              const oldest = processedItemIds.values().next().value;
              if (oldest) processedItemIds.delete(oldest);
            }
          }

          dialogueHistory.push({ role: 'user', content: extractedUserText });
          cbtFsm.recordTurn('user');
          const { sequenceId: currentSeq, signal } = coordinator.nextTurn();

          if (isL1Crisis(extractedUserText)) {
            crisisHandler.triggerIntervention('L1', 'L1本地即时硬过滤命中危机敏感词', [
              '自伤自杀危机',
              '紧急干预',
            ]);
            return;
          }

          this.dispatchL2SafetyCheck({
            extractedUserText,
            currentSeq,
            serverWs,
            coordinator,
            crisisHandler,
            openRouterConfig,
          });

          this.coordinateShadowTurn({
            shadowPipeline,
            serverWs,
            upstreamWs,
            coordinator,
            currentSeq,
            signal,
            userText: extractedUserText,
            dialogueHistory,
            studentName: getStudentName(),
            situationalMemory: getMemory(),
            getStudentName,
            setStudentName,
            isDirectLive,
            getActiveDelegationId,
            dualTrack: true,
          });
        }

        if (
          (payload.type === 'response.audio_transcript.done' ||
            payload.type === 'session.output_transcript.completed') &&
          (payload.transcript || payload.text)
        ) {
          dialogueHistory.push({ role: 'assistant', content: payload.transcript || payload.text });
          cbtFsm.recordTurn('assistant');
        }
      } catch {}
    });
  }

  private static extractTranscriptText(payload: any): string {
    if (
      (payload.type === 'conversation.item.input_audio_transcription.completed' ||
        payload.type === 'input_audio_transcription.completed' ||
        payload.type === 'session.input_transcript.completed') &&
      (payload.transcript || payload.text)
    ) {
      return String(payload.transcript || payload.text || '').trim();
    }

    if (
      (payload.type === 'conversation.item.created' ||
        payload.type === 'conversation.item.added' ||
        payload.type === 'conversation.item.done') &&
      payload.item?.role === 'user'
    ) {
      const contents = Array.isArray(payload.item?.content) ? payload.item.content : [];
      for (const c of contents) {
        if (c.transcript) return String(c.transcript).trim();
        if (c.text) return String(c.text).trim();
      }
    }
    return '';
  }

  private static dispatchL2SafetyCheck(params: {
    extractedUserText: string;
    currentSeq: number;
    serverWs: WebSocket;
    coordinator: BargeInCoordinator;
    crisisHandler: CrisisHandler;
    openRouterConfig: { openRouterKey: string; openRouterBaseUrl?: string };
  }): void {
    const {
      extractedUserText,
      currentSeq,
      serverWs,
      coordinator,
      crisisHandler,
      openRouterConfig,
    } = params;
    const safetyStartTime = Date.now();

    checkL2FlashSafety(extractedUserText, {
      apiKey: openRouterConfig.openRouterKey,
      baseUrl: openRouterConfig.openRouterBaseUrl,
      signal: AbortSignal.timeout(5000),
    })
      .then((isCrisis) => {
        if (serverWs.readyState === WebSocket.OPEN) {
          serverWs.send(
            JSON.stringify({
              type: 'rethink.telemetry.safety_check',
              turnSequence: currentSeq,
              isCrisis,
              durationMs: Date.now() - safetyStartTime,
              timestamp: Date.now(),
            }),
          );
        }
        if (isCrisis && !crisisHandler.isTriggered) {
          coordinator.interrupt();
          crisisHandler.triggerIntervention('L2', 'L2 DeepSeek V4 Flash语义熔断命中危机', [
            '自伤自杀危机',
            '语义旁路熔断',
          ]);
        }
      })
      .catch(() => {});
  }

  private static coordinateShadowTurn(params: {
    shadowPipeline: ShadowReasoningPipeline;
    serverWs?: WebSocket;
    upstreamWs: WebSocket;
    coordinator: BargeInCoordinator;
    currentSeq: number;
    signal: AbortSignal;
    userText: string;
    dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    studentName: string;
    situationalMemory: any;
    getStudentName: () => string;
    setStudentName: (name: string) => void;
    isDirectLive: boolean;
    getActiveDelegationId: () => string | null;
    dualTrack?: boolean;
  }): void {
    const {
      shadowPipeline,
      serverWs,
      upstreamWs,
      coordinator,
      currentSeq,
      signal,
      userText,
      dialogueHistory,
      studentName,
      situationalMemory,
      getStudentName,
      setStudentName,
      isDirectLive,
      getActiveDelegationId,
    } = params;

    const shadowStartTime = Date.now();

    // 非云端直连模式下触发显式流式回复
    if (!isDirectLive) {
      this.triggerTurnResponse(upstreamWs, coordinator, currentSeq, signal, null);
    }

    // 慢轨：影子大脑旁路并发认知推演
    shadowPipeline
      .execute({
        userText,
        dialogueHistory,
        studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(currentSeq) && !signal.aborted,
        onExtractedName: (name) => {
          if (!getStudentName()) setStudentName(name);
        },
      })
      .then((hint) => {
        if (signal.aborted || !coordinator.isValid(currentSeq)) return;
        const durationMs = Date.now() - shadowStartTime;

        if (serverWs && serverWs.readyState === WebSocket.OPEN) {
          serverWs.send(
            JSON.stringify({
              type: 'rethink.telemetry.shadow_directive',
              turnSequence: currentSeq,
              userText,
              cognitiveHint: hint,
              durationMs,
              fallback: !hint,
              timestamp: Date.now(),
            }),
          );
        }

        if (hint && upstreamWs.readyState === WebSocket.OPEN) {
          const delegationId = getActiveDelegationId();
          if (isDirectLive) {
            if (delegationId) {
              upstreamWs.send(
                JSON.stringify({
                  type: 'session.thinking.append',
                  delegation_id: delegationId,
                  thinking: `【影子大脑认知指导】：${hint.trim()}`,
                }),
              );
            }
          } else {
            upstreamWs.send(
              JSON.stringify({
                type: 'session.update',
                session: {
                  type: 'realtime',
                  instructions: `【影子大脑认知指导】：${hint.trim()}。请以同校同级死党语气，自然转化为高中生日常口语交流，并在后续对话中自然贯彻此认知引导。`,
                },
              }),
            );
          }
        }
      })
      .catch(() => null);
  }

  private static triggerTurnResponse(
    upstreamWs: WebSocket,
    coordinator: BargeInCoordinator,
    currentSeq: number,
    signal: AbortSignal,
    cognitiveHint?: string | null,
  ): void {
    if (!coordinator.isValid(currentSeq) || signal.aborted) return;
    if (upstreamWs.readyState !== WebSocket.OPEN) return;

    if (cognitiveHint && cognitiveHint.trim()) {
      upstreamWs.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            instructions: `【影子大脑认知指导】：${cognitiveHint.trim()}。请以同校同级死党语气，自然转化为高中生日常口语回应，语速稍快轻快利落，严格控制在 1-2 句话内（40字以内），严禁任何英文。`,
          },
        }),
      );
    } else {
      upstreamWs.send(JSON.stringify({ type: 'response.create' }));
    }
  }

  private static bindLifecycleEvents(params: {
    serverWs: WebSocket;
    upstreamWs: WebSocket;
    coordinator: BargeInCoordinator;
    crisisHandler: CrisisHandler;
    env: Env;
    sessionId: string;
    requestedUserId: string;
    dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    getStudentName: () => string;
    sessionStartTime: number;
    cbtFsm: CbtStateMachine;
    ctx?: ExecutionContext;
  }): void {
    const {
      serverWs,
      upstreamWs,
      coordinator,
      crisisHandler,
      env,
      sessionId,
      requestedUserId,
      dialogueHistory,
      getStudentName,
      sessionStartTime,
      cbtFsm,
      ctx,
    } = params;

    serverWs.addEventListener('close', async (event) => {
      coordinator.abort();
      RealtimeGatewayAdapter.safeClose(upstreamWs, event.code, event.reason);

      if (dialogueHistory.length >= 1) {
        const closeTask = (async () => {
          try {
            const studentName = getStudentName();
            const fullTranscript = dialogueHistory
              .map((d) => `${d.role === 'user' ? studentName || '学生' : '智能体'}: ${d.content}`)
              .join('\n');
            const duration = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
            const stage = crisisHandler.isTriggered ? 'Crisis_Escalation' : cbtFsm.getStage();

            await SessionReporter.generateAndPersist(
              env,
              {
                sessionId,
                duration,
                stage,
                studentName,
                userId: requestedUserId,
                transcriptText: fullTranscript,
                dialogueTurns: dialogueHistory,
                isCrisisExplicit: crisisHandler.isTriggered,
              },
              ctx,
            );
          } catch (err) {
            console.error('[RelayClose] 会话持久化与报告生成异常:', err);
          }
        })();

        if (ctx?.waitUntil) {
          ctx.waitUntil(closeTask);
        } else {
          await closeTask;
        }
      }
    });

    upstreamWs.addEventListener('close', (event) => {
      RealtimeGatewayAdapter.safeClose(serverWs, event.code, event.reason);
    });

    serverWs.addEventListener('error', () => {
      RealtimeGatewayAdapter.safeClose(upstreamWs, 1011, 'Client error');
    });

    upstreamWs.addEventListener('error', () => {
      RealtimeGatewayAdapter.safeClose(serverWs, 1011, 'Upstream error');
    });
  }
}
