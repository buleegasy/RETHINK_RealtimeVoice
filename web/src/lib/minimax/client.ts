import {
  AUDIO_SAMPLE_RATE,
  DEFAULT_VOICE,
  CBT_VOICE_TOOLS,
  DEFAULT_VOICE_INSTRUCTIONS,
  OPENING_GREETING,
} from './constants';
import type { MiniMaxClientCallbacks, MiniMaxSessionConfig, MiniMaxServerEvent } from './types';
import { getWsUrl } from '../api';

export interface MiniMaxClientOptions {
  relayUrl?: string;
  sessionConfig?: MiniMaxSessionConfig;
  callbacks?: MiniMaxClientCallbacks;
  maxReconnectAttempts?: number;
  sendGreetingOnConnect?: boolean;
  userId?: string;
  username?: string;
  sessionId?: string;
  token?: string;
}

function validateWebSocketUrl(rawUrl: string): string {
  const parsed = new URL(
    rawUrl,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  );
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`[MiniMaxClient] 非法 WebSocket 协议: ${parsed.protocol}`);
  }
  return parsed.toString();
}

export class MiniMaxRealtimeClient {
  private ws: WebSocket | null = null;
  private readonly options: MiniMaxClientOptions;
  private readonly callbacks: MiniMaxClientCallbacks;
  private isConnected: boolean = false;
  private isExplicitlyClosed: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: Record<string, unknown>[] = [];
  private currentResponseItemId: string | null = null;
  private currentToolCallItemId: string | null = null;
  private playbackEpoch: number = 0;
  private readonly canceledResponseItemIds: Set<string> = new Set();
  private currentTurnDetectionMode: 'speaking' | 'listening' | null = null;
  private speechStopTime: number = 0;

  constructor(options?: MiniMaxClientOptions) {
    this.options = options || {};
    this.callbacks = options?.callbacks || {};
  }

  public get ready(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  public getCurrentResponseItemId(): string | null {
    return this.currentResponseItemId;
  }

  public getPlaybackEpoch(): number {
    return this.playbackEpoch;
  }

  public getCanceledResponseItemIds(): ReadonlySet<string> {
    return this.canceledResponseItemIds;
  }

  public connect(): void {
    this.isExplicitlyClosed = false;
    this.currentTurnDetectionMode = null;
    this.cleanupSocket();

    const wsUrl =
      this.options.relayUrl ||
      getWsUrl({
        userId: this.options.userId,
        username: this.options.username,
        sessionId: this.options.sessionId,
        token: this.options.token,
      });

    try {
      const sanitizedUrl = validateWebSocketUrl(wsUrl);
      const ws = new WebSocket(sanitizedUrl);
      this.ws = ws;

      ws.onopen = () => {
        console.log('[MiniMaxClient] 实时语音链路已建立');
        const isReconnection = this.reconnectAttempts > 0;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.flushQueue();
        this.sendSessionUpdate();

        // 仅在首次建立连接时发送开场白，重连后跳过开场白以保持会话连续
        if (!isReconnection && this.options.sendGreetingOnConnect !== false) {
          this.sendGreeting();
        }

        this.startKeepalive();
        this.callbacks.onOpen?.();
        if (isReconnection) {
          this.callbacks.onReconnected?.();
        }
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      ws.onerror = (err) => {
        console.error('[MiniMaxClient] WebSocket 异常:', err);
        this.callbacks.onError?.(err);
      };

      ws.onclose = (event) => {
        console.warn(
          `[MiniMaxClient] WebSocket 关闭 (code: ${event.code}, reason: ${event.reason})`,
        );
        this.isConnected = false;
        this.stopKeepalive();

        const isNormalClose = event.code === 1000 || event.code === 1005;
        if (this.isExplicitlyClosed || isNormalClose) {
          this.callbacks.onClose?.(event.code, event.reason);
        } else {
          // 非正常断开（如大陆网络常见 1006 异常或短时信号切换），进入自适应重连
          this.scheduleReconnect(event.code, event.reason);
        }
      };
    } catch (err) {
      console.error('[MiniMaxClient] 初始化失败:', err);
      this.callbacks.onError?.(err);
      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect(1006, '初始化失败');
      } else {
        this.callbacks.onClose?.(1006, '连接初始化失败');
      }
    }
  }

  public sendSessionUpdate(customConfig?: MiniMaxSessionConfig): void {
    const config = { ...this.options.sessionConfig, ...customConfig };
    const vadConfig =
      config.turnDetection !== undefined
        ? config.turnDetection
        : {
            type: 'server_vad',
            threshold: 0.65,
            prefix_padding_ms: 200,
            silence_duration_ms: 300,
            create_response: true,
          };

    const sessionPayload: Record<string, unknown> = {
      type: 'realtime',
      modalities: ['text', 'audio'],
      instructions: config.instructions || DEFAULT_VOICE_INSTRUCTIONS,
      voice: config.voice || DEFAULT_VOICE,
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: atob('d2hpc3Blci0x') },
      turn_detection: vadConfig,
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: AUDIO_SAMPLE_RATE },
          transcription: { model: atob('d2hpc3Blci0x') },
          turn_detection: vadConfig,
        },
        output: {
          format: { type: 'audio/pcm', rate: AUDIO_SAMPLE_RATE },
          voice: config.voice || DEFAULT_VOICE,
        },
      },
      tools: config.tools || CBT_VOICE_TOOLS,
    };

    this.send({
      type: 'session.update',
      session: sessionPayload,
    });
  }

  public sendGreeting(customGreeting?: string): void {
    const greeting = customGreeting || OPENING_GREETING;
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '（通话已建立，请立刻向来访者致以简短开场问候）',
          },
        ],
      },
    });
    this.send({
      type: 'response.create',
      response: {
        modalities: ['audio', 'text'],
        instructions: `你必须严格只字面说：“${greeting}”，绝对禁止添加任何多余的开场白、问候语或解释！`,
      },
    });
  }

  public updateTurnDetection(mode: 'speaking' | 'listening'): void {
    if (!this.ready || this.currentTurnDetectionMode === mode) return;
    this.currentTurnDetectionMode = mode;
    const vadConfig =
      mode === 'speaking'
        ? {
            type: 'server_vad',
            threshold: 0.85,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
          }
        : {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            create_response: true,
          };

    this.send({
      type: 'session.update',
      session: {
        turn_detection: vadConfig,
        audio: {
          input: {
            turn_detection: vadConfig,
          },
        },
      },
    });
  }

  public sendAudioChunk(pcm16Base64: string): void {
    if (!pcm16Base64) return;
    this.send({
      type: 'input_audio_buffer.append',
      audio: pcm16Base64,
    });
  }

  public commitAudio(): void {
    this.send({
      type: 'input_audio_buffer.commit',
    });
  }

  public truncateItem(itemId: string, audioEndMs: number, contentIndex: number = 0): void {
    if (!itemId) return;
    this.send({
      type: 'conversation.item.truncate',
      item_id: itemId,
      content_index: contentIndex,
      audio_end_ms: Math.round(Math.max(0, audioEndMs)),
    });
  }

  public interrupt(options?: { itemId?: string; audioEndMs?: number }): void {
    this.playbackEpoch++;
    if (this.currentToolCallItemId) {
      this.send({
        type: 'conversation.item.delete',
        item_id: this.currentToolCallItemId,
      });
      this.currentToolCallItemId = null;
    }
    this.send({
      type: 'response.cancel',
    });
    const targetItemId = options?.itemId || this.currentResponseItemId;
    if (targetItemId) {
      this.canceledResponseItemIds.add(targetItemId);
      if (this.canceledResponseItemIds.size > 20) {
        const oldest = this.canceledResponseItemIds.values().next().value;
        if (oldest) this.canceledResponseItemIds.delete(oldest);
      }
      if (typeof options?.audioEndMs === 'number') {
        this.truncateItem(targetItemId, options.audioEndMs);
      }
    }
    this.currentResponseItemId = null;
  }

  public sendToolOutput(callId: string, output: Record<string, unknown>): void {
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output),
      },
    });

    this.send({
      type: 'response.create',
    });
  }

  public send(payload: Record<string, unknown>): void {
    if (this.ready && this.ws) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        console.error('[MiniMaxClient] 发送帧失败:', err);
      }
    } else {
      this.messageQueue.push(payload);
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.currentTurnDetectionMode = null;
    this.stopKeepalive();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.isConnected = false;
  }

  private handleMessage(rawData: string | ArrayBuffer): void {
    if (typeof rawData !== 'string') return;

    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }

    try {
      const event = JSON.parse(rawData) as MiniMaxServerEvent;
      const type = event.type;

      if (
        type === 'response.output_item.added' ||
        type === 'response.output_audio.delta' ||
        type === 'response.audio.delta' ||
        type === 'response.audio_transcript.delta' ||
        type === 'response.output_audio_transcript.delta'
      ) {
        if (event.item_id) {
          this.currentResponseItemId = event.item_id;
        } else if (event.item?.id) {
          this.currentResponseItemId = event.item.id;
        }
      }

      if (type === 'response.output_audio.delta' || type === 'response.audio.delta') {
        const itemId = event.item_id || event.item?.id || this.currentResponseItemId;
        if (itemId && this.canceledResponseItemIds.has(itemId)) {
          // 物理丢弃在途到达的幽灵音频分片，杜绝打断后多说半句
          return;
        }
        if (this.speechStopTime > 0) {
          const ttft = Date.now() - this.speechStopTime;
          this.speechStopTime = 0;
          this.callbacks.onTTFT?.(ttft);
        }
        const audio = event.delta || event.audio;
        if (audio) {
          this.callbacks.onAudioDelta?.(audio);
        }
      }

      if (
        type === 'response.output_text.delta' ||
        type === 'response.text.delta' ||
        type === 'response.output_audio_transcript.delta' ||
        type === 'response.audio_transcript.delta'
      ) {
        const itemId = event.item_id || event.item?.id || this.currentResponseItemId;
        if (itemId && this.canceledResponseItemIds.has(itemId)) {
          return;
        }
        const text = event.delta || event.text || event.transcript || (event as any).transcript;
        if (text) {
          this.callbacks.onTextDelta?.(text);
        }
      }

      if (type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = event.transcript || (event as any).transcript || (event as any).text;
        if (transcript) {
          this.callbacks.onTranscriptDelta?.(transcript);
        }
      } else if (type === 'conversation.item.created' && (event as any).item?.role === 'user') {
        const contents = Array.isArray((event as any).item?.content)
          ? (event as any).item.content
          : [];
        for (const c of contents) {
          const t = c.transcript || c.text;
          if (t) {
            this.callbacks.onTranscriptDelta?.(t);
          }
        }
      }

      if (type === 'input_audio_buffer.speech_started') {
        const targetItemId = event.item_id || this.currentResponseItemId;
        this.callbacks.onSpeechStarted?.({
          audioStartMs: event.audio_start_ms,
          itemId: targetItemId || undefined,
        });
      }

      if (type === 'input_audio_buffer.speech_stopped') {
        this.speechStopTime = Date.now();
        this.callbacks.onSpeechStopped?.();
      }

      if (type === 'response.created') {
        this.playbackEpoch++;
        this.callbacks.onTurnStart?.();
      }

      if (type === 'response.done') {
        this.callbacks.onTurnEnd?.();
        this.currentResponseItemId = null;
      }

      if (
        type === 'response.function_call_arguments.done' ||
        (event.item?.type === 'function_call' && event.item?.content)
      ) {
        const name = event.name || (event.item as any)?.name;
        const callId = event.call_id || (event.item as any)?.call_id;
        const argsStr = event.arguments || (event.item as any)?.arguments || '{}';

        if (name && callId) {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(argsStr);
          } catch {
            parsedArgs = { raw: argsStr };
          }
          this.callbacks.onToolCall?.({ name, callId, args: parsedArgs });
        }
      }

      if (
        type === 'response.function_call_arguments.delta' ||
        (type === 'response.output_item.added' &&
          (event.item?.type === 'function_call' || event.item?.type === 'function_call_output'))
      ) {
        const itemId = event.item_id || event.item?.id;
        if (itemId) {
          this.currentToolCallItemId = itemId;
        }
      }

      if (type === 'response.function_call_arguments.done') {
        this.currentToolCallItemId = null;
      }

      if (type === 'conversation.item.truncated') {
        this.callbacks.onItemTruncated?.({
          itemId: typeof event.item_id === 'string' ? event.item_id : undefined,
          audioEndMs: typeof event.audio_end_ms === 'number' ? event.audio_end_ms : undefined,
        });
      }

      if (type === 'rethink.crisis_intercepted') {
        const msg =
          typeof (event as any).message === 'string'
            ? (event as any).message
            : '检测到安全危机，已启动紧急干预';
        const tier = typeof (event as any).tier === 'string' ? (event as any).tier : undefined;
        this.callbacks.onCrisisInterception?.({ message: msg, tier });
      }

      if (type === 'rethink.telemetry.shadow_directive') {
        this.callbacks.onShadowDirective?.({
          turnSequence: Number((event as any).turnSequence || 0),
          userText: String((event as any).userText || ''),
          cognitiveHint:
            typeof (event as any).cognitiveHint === 'string' ? (event as any).cognitiveHint : null,
          durationMs: Number((event as any).durationMs || 0),
          fallback: Boolean((event as any).fallback),
          timestamp: Number((event as any).timestamp || Date.now()),
        });
      }

      if (type === 'rethink.telemetry.safety_check') {
        this.callbacks.onSafetyCheck?.({
          turnSequence: Number((event as any).turnSequence || 0),
          isCrisis: Boolean((event as any).isCrisis),
          durationMs: Number((event as any).durationMs || 0),
          timestamp: Number((event as any).timestamp || Date.now()),
        });
      }

      if (type === 'server.pong') {
        if (this.pongTimeoutTimer) {
          clearTimeout(this.pongTimeoutTimer);
          this.pongTimeoutTimer = null;
        }
        const sentTime = Number((event as any).clientTimestamp || 0);
        if (sentTime > 0) {
          const rtt = Math.max(1, Date.now() - sentTime);
          this.callbacks.onPingPong?.(rtt);
        }
        return;
      }

      if (type === 'error') {
        const errCode = event.error?.code;
        if (errCode === 'response_cancel_not_allowed') {
          return;
        }
        console.error('[MiniMaxClient] 收到服务端错误:', event.error);
        this.callbacks.onError?.(event.error);
      }
    } catch (err) {
      console.warn('[MiniMaxClient] 解析下行帧失败:', err);
    }
  }

  private flushQueue(): void {
    if (!this.ready || !this.ws) return;
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg) {
        try {
          this.ws.send(JSON.stringify(msg));
        } catch (e) {
          console.error('[MiniMaxClient] 排空发送队列失败:', e);
        }
      }
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();

    // 握手就绪后延迟 500ms 发送首个 Ping，确保握手协议帧（session.update / greeting）严格先行
    setTimeout(() => {
      if (this.ready) {
        this.send({ type: 'client.ping', timestamp: Date.now() });
      }
    }, 500);

    this.keepaliveTimer = setInterval(() => {
      if (this.ready) {
        this.send({ type: 'client.ping', timestamp: Date.now() });
        if (this.pongTimeoutTimer) {
          clearTimeout(this.pongTimeoutTimer);
        }
        this.pongTimeoutTimer = setTimeout(() => {
          console.warn('[MiniMaxClient] 心跳无响应 (Pong Timeout)，判定为死连接，主动重连');
          this.cleanupSocket();
          this.scheduleReconnect(1006, '心跳超时无响应');
        }, 15000);
      }
    }, 4000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }

  private scheduleReconnect(lastCode?: number, lastReason?: string): void {
    const maxAttempts = this.options.maxReconnectAttempts ?? 6;
    if (this.reconnectAttempts >= maxAttempts) {
      console.error('[MiniMaxClient] 已达最大重连次数，停止重连');
      this.callbacks.onMaxReconnectFailed?.();
      this.callbacks.onClose?.(lastCode || 1006, lastReason || '重连次数已达上限');
      return;
    }

    this.reconnectAttempts++;
    const baseDelay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 6000);
    const jitter = Math.random() * 400;
    const delay = Math.round(baseDelay + jitter);
    console.log(
      `[MiniMaxClient] 将在 ${delay}ms 后进行第 ${this.reconnectAttempts}/${maxAttempts} 次重连...`,
    );

    this.callbacks.onReconnecting?.(this.reconnectAttempts, maxAttempts, delay);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cleanupSocket(): void {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'Client closed');
        }
      } catch {}
      this.ws = null;
    }
  }
}
