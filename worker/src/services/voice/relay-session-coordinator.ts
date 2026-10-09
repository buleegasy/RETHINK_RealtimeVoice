import type { Env } from '../../types';
import { RealtimeGatewayAdapter } from '../../adapters/realtime-gateway-adapter';
import { getSituationalMemory } from '../../lib/memory-store';
import { BargeInCoordinator } from './barge-in-coordinator';
import { CrisisHandler } from './crisis-handler';
import { ShadowReasoningPipeline } from './shadow-reasoning-pipeline';
import { SessionReporter } from './session-reporter';
import { SidebandAgent } from './sideband-agent';

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
      const coordinator = new BargeInCoordinator();
      const crisisHandler = new CrisisHandler(
        serverWs,
        upstreamWs,
        env.CRISIS_WEBHOOK_URL,
        sessionId,
        ctx,
      );

      const currentMemory = await getSituationalMemory(env, requestedUserId);
      const studentName = currentMemory?.userName || '';

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

      const sidebandAgent = new SidebandAgent({
        sessionId,
        userId: requestedUserId,
        studentName,
        situationalMemory: currentMemory,
        serverWs,
        upstreamWs,
        coordinator,
        crisisHandler,
        shadowPipeline,
        openRouterConfig: { openRouterKey, openRouterBaseUrl, openRouterModel },
        isDirectLive,
        enableShadowReasoning: false,
      });

      let isSessionReady = !isDirectLive;

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

      // 绑定上游网关事件通道（全双工流转发与原生旁路智能体解耦）
      this.bindUpstreamEvents({
        serverWs,
        upstreamWs,
        sidebandAgent,
        isDirectLive,
        onSessionReady: () => {
          isSessionReady = true;
          flushEarlyQueue();
        },
      });

      // 绑定断开与生命周期事件
      this.bindLifecycleEvents({
        serverWs,
        upstreamWs,
        coordinator,
        crisisHandler,
        sidebandAgent,
        env,
        sessionId,
        requestedUserId,
        sessionStartTime,
        ctx,
      });

      return new Response(null, { status: 101, webSocket: clientWs });
    } catch (err: any) {
      console.error('[RelaySessionCoordinator] 启动会话异常:', err);
      try {
        serverWs.send(
          RealtimeGatewayAdapter.formatRealtimeError(
            'session_init_failed',
            err?.message || '会话初始化异常',
          ),
        );
      } catch {}
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
    sidebandAgent: SidebandAgent;
    isDirectLive: boolean;
    onSessionReady: () => void;
  }): void {
    const { serverWs, upstreamWs, sidebandAgent, isDirectLive, onSessionReady } = params;
    let isAssistantSpeaking = false;
    let assistantSilenceTimer: any = null;

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

          if (isDirectLive) {
            if (payload.type === 'session.output_audio.delta') {
              if (!isAssistantSpeaking) {
                isAssistantSpeaking = true;
                if (serverWs.readyState === WebSocket.OPEN) {
                  serverWs.send(JSON.stringify({ type: 'response.created' }));
                }
              }
              if (assistantSilenceTimer) {
                clearTimeout(assistantSilenceTimer);
              }
              assistantSilenceTimer = setTimeout(() => {
                if (isAssistantSpeaking) {
                  isAssistantSpeaking = false;
                  if (serverWs.readyState === WebSocket.OPEN) {
                    serverWs.send(JSON.stringify({ type: 'response.done' }));
                  }
                  sidebandAgent.finalizeAssistantTurn();
                }
              }, 450);
            } else if (payload.type === 'session.output_audio.done') {
              if (assistantSilenceTimer) {
                clearTimeout(assistantSilenceTimer);
                assistantSilenceTimer = null;
              }
              if (isAssistantSpeaking) {
                isAssistantSpeaking = false;
                sidebandAgent.finalizeAssistantTurn();
              }
            }
          }

          const { transformed } = RealtimeGatewayAdapter.transformUpstreamEvent(
            payload,
            isDirectLive,
          );

          if (serverWs.readyState === WebSocket.OPEN) {
            serverWs.send(JSON.stringify(transformed));
          }

          // 委托原生旁路智能体托管会话转写监听、L1/L2 安全熔断与认知引导
          await sidebandAgent.handleUpstreamEvent(payload);
        }
      } catch {}
    });
  }

  public static triggerTurnResponse(
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

  public static coordinateShadowTurn(params: any): void {
    if (params.dualTrack) {
      this.coordinateDualTrackTurn(params);
    } else {
      this.coordinateSingleTrackTurn(params);
    }
  }

  private static coordinateDualTrackTurn(params: any): void {
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

    if (!isDirectLive) {
      this.triggerTurnResponse(upstreamWs, coordinator, currentSeq, signal, null);
    }

    shadowPipeline
      ?.execute({
        userText,
        dialogueHistory,
        studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(currentSeq) && !signal.aborted,
        onExtractedName: (name: string) => {
          if (!getStudentName?.()) setStudentName?.(name);
        },
      })
      ?.then((hint: string) => {
        if (signal.aborted || !coordinator.isValid(currentSeq)) return;
        if (serverWs && serverWs.readyState === WebSocket.OPEN) {
          serverWs.send(
            JSON.stringify({
              type: 'rethink.telemetry.shadow_directive',
              turnSequence: currentSeq,
              userText,
              cognitiveHint: hint,
              fallback: !hint,
              timestamp: Date.now(),
            }),
          );
        }
        if (hint && upstreamWs?.readyState === WebSocket.OPEN) {
          const delegationId = getActiveDelegationId?.();
          if (isDirectLive && delegationId) {
            upstreamWs.send(
              JSON.stringify({
                type: 'session.thinking.append',
                delegation_id: delegationId,
                thinking: `【影子大脑认知指导】：${hint.trim()}`,
              }),
            );
          } else if (!isDirectLive) {
            upstreamWs.send(
              JSON.stringify({
                type: 'session.update',
                session: {
                  type: 'realtime',
                  instructions: `【影子大脑认知指导】：${hint.trim()}`,
                },
              }),
            );
          }
        }
      })
      ?.catch(() => null);
  }

  private static coordinateSingleTrackTurn(params: any): void {
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
      timeoutMs = 2500,
    } = params;

    let hasResponded = false;
    let timer: any = null;
    const shadowStartTime = Date.now();

    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        resolve(null);
      }, timeoutMs);
    });

    signal?.addEventListener?.(
      'abort',
      () => {
        if (timer) clearTimeout(timer);
      },
      { once: true },
    );

    const shadowPromise = shadowPipeline
      ?.execute({
        userText,
        dialogueHistory,
        studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(currentSeq) && !hasResponded,
        onExtractedName: (name: string) => {
          if (!getStudentName?.()) setStudentName?.(name);
        },
      })
      ?.catch(() => null);

    void Promise.race([shadowPromise, timeoutPromise]).then((hint) => {
      if (timer) clearTimeout(timer);
      if (hasResponded) return;
      hasResponded = true;
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

      this.triggerTurnResponse(upstreamWs, coordinator, currentSeq, signal, hint);
    });
  }

  private static bindLifecycleEvents(params: {
    serverWs: WebSocket;
    upstreamWs: WebSocket;
    coordinator: BargeInCoordinator;
    crisisHandler: CrisisHandler;
    sidebandAgent: SidebandAgent;
    env: Env;
    sessionId: string;
    requestedUserId: string;
    sessionStartTime: number;
    ctx?: ExecutionContext;
  }): void {
    const {
      serverWs,
      upstreamWs,
      coordinator,
      crisisHandler,
      sidebandAgent,
      env,
      sessionId,
      requestedUserId,
      sessionStartTime,
      ctx,
    } = params;

    serverWs.addEventListener('close', async (event) => {
      coordinator.abort();
      RealtimeGatewayAdapter.safeClose(upstreamWs, event.code, event.reason);

      const dialogueHistory = sidebandAgent.getDialogueHistory();
      if (dialogueHistory.length >= 1) {
        const closeTask = (async () => {
          try {
            const studentName = sidebandAgent.getStudentName();
            const fullTranscript = dialogueHistory
              .map((d) => `${d.role === 'user' ? studentName || '学生' : '智能体'}: ${d.content}`)
              .join('\n');
            const duration = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
            const stage = crisisHandler.isTriggered
              ? 'Crisis_Escalation'
              : sidebandAgent.getCbtStage();

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
