import type { Env } from '../../types';
import { RealtimeGatewayAdapter } from '../../adapters/realtime-gateway-adapter';
import { getSituationalMemory } from '../../lib/memory-store';
import { BargeInCoordinator } from './barge-in-coordinator';
import { CrisisHandler } from './crisis-handler';
import { ShadowReasoningPipeline } from './shadow-reasoning-pipeline';
import { SidebandAgent } from './sideband-agent';
import { ShadowTurnCoordinator } from './relay/shadow-turn-coordinator';
import { ClientEventBinder } from './relay/client-event-binder';
import { UpstreamEventBinder } from './relay/upstream-event-binder';
import { LifecycleEventBinder } from './relay/lifecycle-event-binder';

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
  public static triggerTurnResponse(
    upstreamWs: WebSocket,
    coordinator: BargeInCoordinator,
    currentSeq: number,
    signal: AbortSignal,
    cognitiveHint?: string | null,
  ): void {
    ShadowTurnCoordinator.triggerTurnResponse(
      upstreamWs,
      coordinator,
      currentSeq,
      signal,
      cognitiveHint,
    );
  }

  public static coordinateShadowTurn(params: any): void {
    ShadowTurnCoordinator.coordinateShadowTurn(params);
  }

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
      const { flushEarlyQueue } = ClientEventBinder.bindClientEvents({
        serverWs,
        upstreamWs,
        coordinator,
        currentMemory,
        isDirectLive,
        upstreamModel: config.upstreamModel,
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
      UpstreamEventBinder.bindUpstreamEvents({
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
      LifecycleEventBinder.bindLifecycleEvents({
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
}
