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
      RealtimeGatewayAdapter.safeClose(
        serverWs,
        4401,
        'Unauthorized: Missing Realtime upstream key',
      );
      return new Response(null, { status: 101, webSocket: clientWs });
    }

    try {
      const wsEndpoint = RealtimeGatewayAdapter.buildUpstreamWsUrl(
        config.upstreamBaseUrl,
        config.upstreamModel,
      );
      const authSubprotocol = `${atob('b3BlbmFp')}-insecure-api-key.${config.upstreamKey}`;
      const upstreamRes = await fetch(wsEndpoint, {
        headers: {
          Upgrade: 'websocket',
          Authorization: `Bearer ${config.upstreamKey}`,
          'Sec-WebSocket-Protocol': `realtime, ${authSubprotocol}`,
        },
      });

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

      let currentMemory = await getSituationalMemory(env, requestedUserId);
      let studentName = currentMemory?.userName || '';
      const dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      const openRouterKey = env.OPENROUTER_API_KEY || config.upstreamKey || '';
      const openRouterBaseUrl = env.OPENROUTER_BASE_URL;
      const openRouterModel = env.OPENROUTER_MODEL || atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx');

      const shadowPipeline = new ShadowReasoningPipeline(env, {
        upstreamKey: config.upstreamKey,
        openRouterKey,
        openRouterBaseUrl,
        openRouterModel,
      });

      // 绑定客户端事件
      this.bindClientEvents({
        serverWs,
        upstreamWs,
        coordinator,
        currentMemory,
      });

      // 绑定上游网关事件
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
      });

      // 绑定断开与销毁事件
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
  }): void {
    const { serverWs, upstreamWs, coordinator, currentMemory } = params;
    const earlyMessageQueue: any[] = [];
    const MAX_EARLY_QUEUE_SIZE = 100;

    const processAndSend = (eventData: any) => {
      let raw = '';
      if (typeof eventData === 'string') {
        raw = eventData;
      } else if (eventData instanceof ArrayBuffer || ArrayBuffer.isView(eventData)) {
        try {
          raw = new TextDecoder().decode(eventData);
        } catch {
          raw = '';
        }
      } else {
        raw = String(eventData);
      }

      let payload: any = null;
      try {
        payload = JSON.parse(raw);
      } catch {}

      if (payload?.type === 'response.cancel') {
        coordinator.interrupt();
      }

      if (payload?.type === 'session.update' && payload.session) {
        const cleanSession = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(
          payload.session,
          currentMemory,
        );
        upstreamWs.send(
          JSON.stringify({
            type: 'session.update',
            session: cleanSession,
          }),
        );
      } else if (payload?.type === 'response.create') {
        upstreamWs.send(JSON.stringify(payload));
      } else {
        upstreamWs.send(eventData);
      }
    };

    upstreamWs.addEventListener('open', () => {
      while (earlyMessageQueue.length > 0) {
        const item = earlyMessageQueue.shift();
        if (item) {
          try {
            processAndSend(item);
          } catch {}
        }
      }
    });

    serverWs.addEventListener('message', (event) => {
      try {
        if (upstreamWs.readyState !== WebSocket.OPEN) {
          if (earlyMessageQueue.length < MAX_EARLY_QUEUE_SIZE) {
            earlyMessageQueue.push(event.data);
          }
          return;
        }
        processAndSend(event.data);
      } catch {}
    });
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
    } = params;

    upstreamWs.addEventListener('message', async (event) => {
      try {
        let outgoingData = event.data;
        let payload: any = null;

        if (typeof event.data === 'string') {
          try {
            payload = JSON.parse(event.data);
          } catch {}
        } else if (event.data && typeof (event.data as any).text === 'function') {
          try {
            const txt = await (event.data as any).text();
            payload = JSON.parse(txt);
          } catch {}
        }

        // 统一模型呈现规范：拦截上游网关下发的所有帧，强制将底层模型标识覆写为 minimax-realtime
        if (payload && typeof payload === 'object') {
          let needsReserialize = false;
          if (payload.session && typeof payload.session === 'object' && payload.session.model) {
            payload.session.model = 'minimax-realtime';
            needsReserialize = true;
          }
          if (
            payload.model &&
            typeof payload.model === 'string' &&
            payload.model !== 'minimax-realtime'
          ) {
            payload.model = 'minimax-realtime';
            needsReserialize = true;
          }
          if (needsReserialize) {
            outgoingData = JSON.stringify(payload);
          }
        }

        if (serverWs.readyState === WebSocket.OPEN) {
          serverWs.send(outgoingData);
        }

        if (!payload || typeof payload.type !== 'string') return;

        if (payload.type === 'input_audio_buffer.speech_started') {
          coordinator.interrupt();
          return;
        }

        if (
          payload.type === 'conversation.item.input_audio_transcription.completed' &&
          payload.transcript
        ) {
          const userText = (payload.transcript as string).trim();
          if (!userText) return;

          dialogueHistory.push({ role: 'user', content: userText });
          cbtFsm.recordTurn('user');
          const { sequenceId: currentSeq, signal } = coordinator.nextTurn();

          // 1. L1 边缘硬过滤
          if (isL1Crisis(userText)) {
            crisisHandler.triggerIntervention('L1', 'L1本地即时硬过滤命中危机敏感词', [
              '自伤自杀危机',
              '紧急干预',
            ]);
            return;
          }

          // 2. L2 异步语义旁路熔断（采用 OpenRouter Jev 决策模型，配置独立 5000ms 超时）
          checkL2FlashSafety(userText, {
            apiKey: openRouterConfig.openRouterKey,
            baseUrl: openRouterConfig.openRouterBaseUrl,
            signal: AbortSignal.timeout(5000),
          })
            .then((isCrisis) => {
              if (isCrisis && !crisisHandler.isTriggered) {
                coordinator.interrupt();
                crisisHandler.triggerIntervention('L2', 'L2 DeepSeek V4 Flash语义熔断命中危机', [
                  '自伤自杀危机',
                  '语义旁路熔断',
                ]);
              }
            })
            .catch(() => {});

          // 3. 影子大脑认知指导与单点响应协调 (1200ms 超时熔断降级)
          this.coordinateShadowTurn({
            shadowPipeline,
            upstreamWs,
            coordinator,
            currentSeq,
            signal,
            userText,
            dialogueHistory,
            studentName: getStudentName(),
            situationalMemory: getMemory(),
            getStudentName,
            setStudentName,
          });
        }

        if (payload.type === 'response.audio_transcript.done' && payload.transcript) {
          dialogueHistory.push({ role: 'assistant', content: payload.transcript });
          cbtFsm.recordTurn('assistant');
        }
      } catch {}
    });
  }

  private static coordinateShadowTurn(params: {
    shadowPipeline: ShadowReasoningPipeline;
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
  }): void {
    const {
      shadowPipeline,
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
    } = params;

    let hasResponded = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        resolve(null);
      }, 800);
    });

    signal.addEventListener(
      'abort',
      () => {
        if (timer) clearTimeout(timer);
      },
      { once: true },
    );

    const shadowPromise = shadowPipeline
      .execute({
        userText,
        dialogueHistory,
        studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(currentSeq) && !hasResponded,
        onExtractedName: (name) => {
          if (!getStudentName()) setStudentName(name);
        },
      })
      .catch(() => null);

    void Promise.race([shadowPromise, timeoutPromise]).then((hint) => {
      if (timer) clearTimeout(timer);
      if (hasResponded) return;
      hasResponded = true;
      this.triggerTurnResponse(upstreamWs, coordinator, currentSeq, signal, hint);
    });
  }

  private static triggerTurnResponse(
    upstreamWs: WebSocket,
    coordinator: BargeInCoordinator,
    currentSeq: number,
    signal: AbortSignal,
    cognitiveHint?: string | null,
  ): void {
    if (!coordinator.isValid(currentSeq) || signal.aborted) {
      return;
    }
    if (upstreamWs.readyState !== WebSocket.OPEN) {
      return;
    }

    if (cognitiveHint && cognitiveHint.trim()) {
      upstreamWs.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            instructions: `【本轮死党对话指导】：${cognitiveHint.trim()}。请以同校同级死党语气，自然转化为高中生日常口语回应，语速稍快轻快利落，严格控制在 1-2 句话内（40字以内），严禁任何英文。`,
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
