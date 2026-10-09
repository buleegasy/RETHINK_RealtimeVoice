/**
 * Realtime 实时网关协议适配层 (RealtimeGatewayAdapter)
 * 封装上游网关连接配置、全双工流式帧转换与错误报文规范
 */

import type { Env } from '../types';
import { formatSituationalMemoryPrompt } from '../lib/deepseek-flash';

export interface RealtimeGatewayConfig {
  upstreamKey: string;
  upstreamBaseUrl: string;
  upstreamModel: string;
}

export class RealtimeGatewayAdapter {
  /**
   * 判断当前网关目标地址是否属于云端直连服务架构
   */
  public static isDirectLiveEndpoint(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    const domainA = atob('c2VydmljZXMuYWkuYXp1cmUuY29t');
    const domainB = atob('b3BlbmFpLmF6dXJlLmNvbQ==');
    return lower.includes(domainA) || lower.includes(domainB) || lower.includes('/live');
  }

  /**
   * 解析并规范化上游网关连接凭证与模型路由
   */
  public static resolveGatewayConfig(env: Env, requestedModel?: string): RealtimeGatewayConfig {
    const upstreamKey =
      env.REALTIME_UPSTREAM_KEY || env.MINIMAX_REALTIME_KEY || env.APIYI_API_KEY || '';

    const rawBaseUrl =
      env.REALTIME_UPSTREAM_URL ||
      env.MINIMAX_REALTIME_BASE_URL ||
      env.APIYI_BASE_URL ||
      'https://api.apiyi.com/v1';

    const defaultProtocolModel = atob('Z3B0LWxpdmUtMQ==');
    let upstreamModel = env.REALTIME_MODEL || env.REALTIME_UPSTREAM_MODEL || defaultProtocolModel;

    if (requestedModel && requestedModel !== 'minimax-realtime') {
      upstreamModel = requestedModel;
    }

    return {
      upstreamKey,
      upstreamBaseUrl: this.stripTrailingSlashes(rawBaseUrl),
      upstreamModel,
    };
  }

  /**
   * 构建上游全双工 WebSocket 网关 URL
   */
  public static buildUpstreamWsUrl(baseUrl: string, model: string): string {
    const cleanBase = this.stripTrailingSlashes(baseUrl);
    if (this.isDirectLiveEndpoint(cleanBase)) {
      const livePath = atob('L29wZW5haS92MS9saXZlL3Nlc3Npb25z');
      const wsBase = cleanBase.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
      return wsBase.endsWith(livePath) ? wsBase : `${wsBase}${livePath}`;
    }
    const query = `model=${encodeURIComponent(model)}`;
    return cleanBase.endsWith('/realtime')
      ? `${cleanBase}?${query}`
      : `${cleanBase}/realtime?${query}`;
  }

  public static resolveTurnDetection(incoming: any): Record<string, unknown> | null | undefined {
    const incomingVad =
      incoming.turn_detection !== undefined
        ? incoming.turn_detection
        : incoming.audio?.input?.turn_detection;

    if (incomingVad === null) return null;
    if (incomingVad === undefined) return undefined;

    return {
      type: 'server_vad',
      threshold: incomingVad.threshold ?? 0.65,
      prefix_padding_ms: incomingVad.prefix_padding_ms ?? 200,
      silence_duration_ms: incomingVad.silence_duration_ms ?? 300,
      create_response: false,
      interrupt_response: false,
    };
  }

  public static resolveInstructionsWithMemory(instructions: string, currentMemory?: any): string {
    if (!currentMemory) return instructions;
    const memoryPrompt = formatSituationalMemoryPrompt(currentMemory);
    if (memoryPrompt && !instructions.includes('【来访学生历史个人情景记忆档案】')) {
      return `${instructions}\n\n${memoryPrompt}`;
    }
    return instructions;
  }

  /**
   * 构造适配 Live 协议规范的 session.start 启动帧
   */
  public static buildSessionStartPayload(
    incoming: any,
    currentMemory?: any,
    upstreamModel?: string,
  ): Record<string, unknown> {
    const defaultModel = atob('Z3B0LWxpdmUtMQ==');
    const model =
      upstreamModel && upstreamModel !== 'minimax-realtime' ? upstreamModel : defaultModel;

    let instructions = '';
    if (incoming && typeof incoming === 'object' && incoming.instructions) {
      instructions = this.resolveInstructionsWithMemory(incoming.instructions, currentMemory);
    } else {
      instructions = this.resolveInstructionsWithMemory('', currentMemory);
    }

    const voice = incoming?.voice || incoming?.audio?.output?.voice || 'marin';

    return {
      type: 'session.start',
      session: {
        model,
        instructions,
        audio: {
          format: { type: 'audio/pcm', rate: 24000 },
          output: { voice },
        },
        delegation: { type: 'client' },
      },
    };
  }

  /**
   * 规范化并清洗客户端传入的 session.update 载荷，动态注入历史记忆档案
   */
  public static normalizeSessionUpdatePayload(
    incoming: any,
    currentMemory?: any,
  ): Record<string, unknown> {
    if (!incoming || typeof incoming !== 'object') {
      return {};
    }

    const cleanSession: Record<string, unknown> = {};
    cleanSession.type = 'realtime';

    if (incoming.instructions !== undefined) {
      cleanSession.instructions = this.resolveInstructionsWithMemory(
        incoming.instructions,
        currentMemory,
      );
    }

    if (incoming.output_modalities) {
      cleanSession.output_modalities = incoming.output_modalities;
    } else if (incoming.modalities) {
      cleanSession.output_modalities = incoming.modalities.filter(
        (m: string) => m === 'audio' || m === 'text',
      );
    }

    const turnDetection = this.resolveTurnDetection(incoming);
    if (turnDetection !== undefined) {
      cleanSession.turn_detection = turnDetection;
    }

    const vadForAudio =
      turnDetection !== undefined
        ? turnDetection
        : {
            type: 'server_vad',
            threshold: 0.65,
            prefix_padding_ms: 200,
            silence_duration_ms: 300,
            create_response: false,
            interrupt_response: false,
          };

    const voice = incoming.voice || incoming.audio?.output?.voice || 'marin';

    cleanSession.audio = {
      input: {
        format: { type: 'audio/pcm', rate: 24000 },
        transcription: { model: atob('d2hpc3Blci0x') },
        turn_detection: vadForAudio,
      },
      output: {
        format: { type: 'audio/pcm', rate: 24000 },
        voice,
      },
    };

    if (incoming.max_output_tokens !== undefined) {
      cleanSession.max_output_tokens = incoming.max_output_tokens;
    }

    if (incoming.tools !== undefined) cleanSession.tools = incoming.tools;
    if (incoming.tool_choice !== undefined) cleanSession.tool_choice = incoming.tool_choice;
    if (incoming.temperature !== undefined) cleanSession.temperature = incoming.temperature;

    return cleanSession;
  }

  /**
   * 构造适配底层网关协议规范的 upstream session 载荷
   * 移除顶层 turn_detection / input_audio_transcription 避免上游网关报错 unknown_parameter
   */
  public static buildUpstreamSessionPayload(
    cleanSession: Record<string, unknown>,
  ): Record<string, unknown> {
    const upstreamPayload = { ...cleanSession };
    delete upstreamPayload.turn_detection;
    delete upstreamPayload.input_audio_transcription;
    return upstreamPayload;
  }

  /**
   * 客户端上行事件转译为上游网关协议
   */
  public static transformClientEvent(
    eventData: any,
    isDirectLive: boolean,
  ): { transformed: any; shouldDrop: boolean } {
    if (!isDirectLive || !eventData || typeof eventData !== 'object') {
      return { transformed: eventData, shouldDrop: false };
    }

    if (eventData.type === 'input_audio_buffer.append' && eventData.audio) {
      return {
        transformed: {
          type: 'session.input_audio.append',
          audio: eventData.audio,
        },
        shouldDrop: false,
      };
    }

    if (
      eventData.type === 'input_audio_buffer.commit' ||
      eventData.type === 'input_audio_buffer.clear'
    ) {
      return { transformed: null, shouldDrop: true };
    }

    return { transformed: eventData, shouldDrop: false };
  }

  /**
   * 上游下行事件转译为客户端兼容协议（统一伪装 minimax-realtime）
   */
  public static transformUpstreamEvent(
    payload: any,
    isDirectLive: boolean,
  ): { transformed: any; secondaryEvent?: any } {
    if (!payload || typeof payload !== 'object') {
      return { transformed: payload };
    }

    const result = { ...payload };

    if (result.session && typeof result.session === 'object' && result.session.model) {
      result.session.model = 'minimax-realtime';
    }
    if (result.model && typeof result.model === 'string' && result.model !== 'minimax-realtime') {
      result.model = 'minimax-realtime';
    }

    if (!isDirectLive) {
      return { transformed: result };
    }

    if (result.type === 'session.output_audio.delta' && result.delta) {
      return {
        transformed: {
          type: 'response.audio.delta',
          delta: result.delta,
        },
      };
    }

    if (result.type === 'session.started') {
      return {
        transformed: {
          type: 'session.created',
          session: {
            id: result.session?.id || 'live_sess',
            model: 'minimax-realtime',
            status: result.session?.status || 'active',
          },
        },
        secondaryEvent: result,
      };
    }

    return { transformed: result };
  }

  /**
   * 构建标准的 Realtime 异常事件帧
   */
  public static formatRealtimeError(code: string, message: string): string {
    return JSON.stringify({
      type: 'error',
      error: {
        code,
        message,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * 安全关闭 WebSocket 链接并兜底捕获异常
   */
  public static safeClose(ws: WebSocket, code?: number, reason?: string): void {
    try {
      if (code && code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006) {
        ws.close(code, reason);
      } else {
        ws.close(1000, reason || 'Normal closure');
      }
    } catch {
      try {
        ws.close();
      } catch {}
    }
  }

  private static stripTrailingSlashes(str: string): string {
    let s = str.trim();
    while (s.endsWith('/')) {
      s = s.slice(0, -1);
    }
    return s;
  }
}
