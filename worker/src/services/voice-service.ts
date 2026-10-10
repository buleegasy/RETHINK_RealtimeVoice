/**
 * 实时语音核心服务层 (VoiceService)
 * 职责：作为语音服务的统一门面 (Facade)，编排 WebSocket 中继、REST 降级会话、知识库检索与评估持久化
 */

import type { Env, PersistSessionPayload } from '../types';
import { BgeRetriever } from '../lib/rag';
import { getSituationalMemory } from '../lib/memory-store';
import { RealtimeGatewayAdapter } from '../adapters/realtime-gateway-adapter';
import { RelaySessionCoordinator, type RelayQueryParams } from './voice/relay-session-coordinator';
import { SessionReporter } from './voice/session-reporter';
import { handleRestChat } from './voice/rest-voice-chat';

export { BargeInCoordinator } from './voice/barge-in-coordinator';

export class VoiceService {
  /**
   * 处理 WebRTC SDP Offer 协商与自适应降级
   */
  public static async handleWebRtcOffer(
    env: Env,
    payload: {
      sdp?: string;
      sessionId?: string;
      userId?: string;
      username?: string;
      model?: string;
      [key: string]: any;
    },
    _ctx?: ExecutionContext,
  ): Promise<{
    ok: boolean;
    sdp?: string;
    fallbackToWs?: boolean;
    wsUrl?: string;
    status?: number;
    error?: string;
  }> {
    const sdp = (payload.sdp || '').trim();
    if (!sdp) {
      return { ok: false, error: 'Missing SDP offer' };
    }

    const config = RealtimeGatewayAdapter.resolveGatewayConfig(env, payload.model);
    const currentMemory = await getSituationalMemory(env, payload.userId || '');
    const cleanSession = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(
      payload,
      currentMemory,
    );
    const upstreamSession = RealtimeGatewayAdapter.buildUpstreamSessionPayload(
      cleanSession,
      config.upstreamModel,
    );

    return RealtimeGatewayAdapter.negotiateWebRtcOffer(config, sdp, { session: upstreamSession });
  }

  /**
   * 处理全双工 WebSocket 实时语音流转与智能体影子大脑接入
   */
  public static async handleWebSocketRelay(
    serverWs: WebSocket,
    clientWs: WebSocket,
    env: Env,
    query: RelayQueryParams,
    ctx?: ExecutionContext,
  ): Promise<Response> {
    return RelaySessionCoordinator.startSession(serverWs, clientWs, env, query, ctx);
  }

  /**
   * 处理文本/降级 REST 语音对话
   */
  public static async handleChat(
    env: Env,
    body: { text?: string; stage?: string; history?: any[] },
    ctx?: ExecutionContext,
  ) {
    return handleRestChat(env, body, ctx);
  }

  /**
   * 持久化保存会话记录与提炼个案简报
   */
  public static async handlePersistSession(
    env: Env,
    payload: Partial<PersistSessionPayload>,
    ctx?: ExecutionContext,
  ) {
    const { session_id, duration, encrypted_payload, stage, username, transcript_text, is_crisis } =
      payload;
    const effectiveSessionId = session_id || `sess_${Date.now()}`;

    return SessionReporter.generateAndPersist(
      env,
      {
        sessionId: effectiveSessionId,
        duration: duration || 0,
        stage: stage || 'Active_Listening',
        studentName: username || '',
        userId: username || effectiveSessionId,
        transcriptText: transcript_text || '',
        isCrisisExplicit: Boolean(is_crisis),
        encryptedPayload: encrypted_payload || '',
      },
      ctx,
    );
  }

  /**
   * 心理学专业知识与干预话术向量检索
   */
  public static async handleKnowledgeQuery(env: Env, query: string, topK: number = 2) {
    const retriever = new BgeRetriever({
      embeddingApiKey:
        env.EMBEDDING_API_KEY ||
        env.REALTIME_UPSTREAM_KEY ||
        env.MINIMAX_REALTIME_KEY ||
        env.APIYI_API_KEY,
      embeddingApiUrl: env.EMBEDDING_API_URL,
      rerankApiKey: env.RERANK_API_KEY,
      rerankApiUrl: env.RERANK_API_URL,
    });

    const [strategyHint, searchResults] = await Promise.all([
      retriever.getStrategyHint(query, { topK: 1 }),
      retriever.search(query, { topK }),
    ]);

    const chunks = searchResults.map((r) => ({
      id: r.capsule.id,
      title: r.capsule.title,
      content: r.capsule.content,
      score: Number(r.score.toFixed(4)),
      category: r.capsule.category,
      empathyLead: r.capsule.empathyLead,
      socraticPivot: r.capsule.socraticPivot,
      tabooPhrases: r.capsule.tabooPhrases,
    }));

    return {
      ok: true,
      query,
      strategy_hint: strategyHint,
      chunks,
    };
  }

  /**
   * 读取来访学生历史情景记忆档案
   */
  public static async getMemory(env: Env, userId: string) {
    return getSituationalMemory(env, userId);
  }
}
