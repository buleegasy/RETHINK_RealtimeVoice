import type { MiniMaxClientCallbacks, MiniMaxSessionConfig, MiniMaxClientOptions } from './types';
import { getWsUrl } from '../api';
import { MiniMaxWebRtcClient } from './webrtcClient';
import {
  buildSessionPayload,
  buildGreetingEvents,
  buildTurnDetectionPayload,
} from './transport/sessionPayloadBuilder';
import { ReconnectManager } from './transport/reconnectManager';
import { HeartbeatManager } from './transport/heartbeatManager';
import { ServerEventDispatcher, type DispatcherContext } from './transport/serverEventDispatcher';
import { tryInitWebRtc } from './transport/webrtcConnector';
import { createManagedWebSocket, cleanupWebSocket } from './transport/webSocketConnector';
import {
  createTruncatePayload,
  createToolOutputPayloads,
  executeInterrupt,
} from './transport/conversationActions';

export type { MiniMaxClientOptions };

export class MiniMaxRealtimeClient {
  private ws: WebSocket | null = null;
  private readonly options: MiniMaxClientOptions;
  private readonly callbacks: MiniMaxClientCallbacks;
  private isConnected: boolean = false;
  private isExplicitlyClosed: boolean = false;
  private activeTransport: 'webrtc' | 'websocket' = 'websocket';
  private webrtcClient: MiniMaxWebRtcClient | null = null;
  private currentTurnDetectionMode: 'speaking' | 'listening' | null = null;
  private messageQueue: Record<string, unknown>[] = [];

  private readonly reconnectManager: ReconnectManager;
  private readonly heartbeatManager: HeartbeatManager;
  private readonly eventDispatcher: ServerEventDispatcher;
  private readonly ctx: DispatcherContext = {
    currentResponseItemId: null,
    currentToolCallItemId: null,
    playbackEpoch: 0,
    canceledResponseItemIds: new Set(),
    speechStopTime: 0,
  };

  constructor(options?: MiniMaxClientOptions) {
    this.options = options || {};
    this.callbacks = options?.callbacks || {};
    this.reconnectManager = new ReconnectManager(this.options.maxReconnectAttempts ?? 6);
    this.heartbeatManager = new HeartbeatManager();
    this.eventDispatcher = new ServerEventDispatcher();
  }

  public get ready(): boolean {
    if (this.activeTransport === 'webrtc') {
      return (this.webrtcClient?.ready ?? false) && this.isConnected;
    }
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  public getTransportType(): 'webrtc' | 'websocket' {
    return this.activeTransport;
  }

  public getRemoteStream(): MediaStream | null {
    return this.webrtcClient?.getRemoteStream() || null;
  }

  public getCurrentResponseItemId(): string | null {
    if (this.activeTransport === 'webrtc' && this.webrtcClient) {
      return this.webrtcClient.getCurrentResponseItemId();
    }
    return this.ctx.currentResponseItemId;
  }

  public getPlaybackEpoch(): number {
    if (this.activeTransport === 'webrtc' && this.webrtcClient) {
      return this.webrtcClient.getPlaybackEpoch();
    }
    return this.ctx.playbackEpoch;
  }

  public getCanceledResponseItemIds(): ReadonlySet<string> {
    if (this.activeTransport === 'webrtc' && this.webrtcClient) {
      return this.webrtcClient.getCanceledResponseItemIds();
    }
    return this.ctx.canceledResponseItemIds;
  }

  public async connect(localStream?: MediaStream): Promise<void> {
    this.isExplicitlyClosed = false;
    this.currentTurnDetectionMode = null;
    const mode = this.options.transport ?? (this.options.relayUrl ? 'websocket' : 'webrtc');

    if (mode === 'webrtc' || mode === 'auto') {
      const result = await tryInitWebRtc(
        this.options,
        this.callbacks,
        (t) => {
          this.activeTransport = t;
          this.isConnected = true;
          this.callbacks.onTransportChange?.(t);
        },
        localStream,
      );

      if (result.success && result.client) {
        this.webrtcClient = result.client;
        this.activeTransport = 'webrtc';
        this.isConnected = true;
        return;
      }

      if (mode === 'webrtc') return;
    }

    if (mode === 'websocket' || (mode === 'auto' && this.options.relayUrl)) {
      this.connectWebSocket();
    }
  }

  public connectWebSocket(): void {
    this.activeTransport = 'websocket';
    this.callbacks.onTransportChange?.('websocket');
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
      this.ws = createManagedWebSocket(wsUrl, {
        reconnectManager: this.reconnectManager,
        heartbeatManager: this.heartbeatManager,
        callbacks: this.callbacks,
        isExplicitlyClosed: () => this.isExplicitlyClosed,
        onStateChange: (connected) => {
          this.isConnected = connected;
        },
        onOpen: (isReconnection) => {
          this.flushQueue();
          this.sendSessionUpdate();
          if (!isReconnection && this.options.sendGreetingOnConnect !== false) {
            this.sendGreeting();
          }
          this.startKeepalive();
        },
        onMessage: (data) => {
          this.eventDispatcher.dispatch(data, this.ctx, this.callbacks, () =>
            this.heartbeatManager.handlePong(),
          );
        },
        onReconnect: () => this.connect(),
      });
    } catch (err) {
      console.error('[MiniMaxClient] 初始化失败:', err);
      this.callbacks.onError?.(err);
      if (!this.isExplicitlyClosed) {
        this.reconnectManager.scheduleReconnect(
          this.callbacks,
          () => this.connect(),
          1006,
          '初始化失败',
        );
      } else {
        this.callbacks.onClose?.(1006, '连接初始化失败');
      }
    }
  }

  public sendSessionUpdate(customConfig?: MiniMaxSessionConfig): void {
    this.send({
      type: 'session.update',
      session: buildSessionPayload(this.options.sessionConfig, customConfig),
    });
  }

  public sendGreeting(customGreeting?: string): void {
    const events = buildGreetingEvents(customGreeting);
    for (const evt of events) {
      this.send(evt);
    }
  }

  public updateTurnDetection(mode: 'speaking' | 'listening'): void {
    if (this.activeTransport === 'webrtc' && this.webrtcClient) {
      this.webrtcClient.updateTurnDetection(mode);
      return;
    }
    if (!this.ready || this.currentTurnDetectionMode === mode) return;
    this.currentTurnDetectionMode = mode;
    this.send({
      type: 'session.update',
      session: buildTurnDetectionPayload(mode),
    });
  }

  public sendAudioChunk(pcm16Base64: string): void {
    if (!pcm16Base64 || this.activeTransport === 'webrtc') return;
    this.send({
      type: 'input_audio_buffer.append',
      audio: pcm16Base64,
    });
  }

  public commitAudio(): void {
    this.send({ type: 'input_audio_buffer.commit' });
  }

  public truncateItem(itemId: string, audioEndMs: number, contentIndex: number = 0): void {
    if (!itemId) return;
    this.send(createTruncatePayload(itemId, audioEndMs, contentIndex));
  }

  public interrupt(options?: { itemId?: string; audioEndMs?: number }): void {
    if (this.activeTransport === 'webrtc' && this.webrtcClient) {
      this.webrtcClient.interrupt(options);
      return;
    }
    executeInterrupt(this.ctx, (p) => this.send(p), options);
  }

  public sendToolOutput(callId: string, output: Record<string, unknown>): void {
    const payloads = createToolOutputPayloads(callId, output);
    for (const payload of payloads) {
      this.send(payload);
    }
  }

  public send(payload: Record<string, unknown>): void {
    if (this.activeTransport === 'webrtc' && this.webrtcClient?.ready) {
      this.webrtcClient.sendEvent(payload);
      return;
    }
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
    this.heartbeatManager.stopKeepalive();
    this.reconnectManager.cancel();
    if (this.webrtcClient) {
      this.webrtcClient.disconnect();
      this.webrtcClient = null;
    }
    this.cleanupSocket();
    this.isConnected = false;
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
    this.heartbeatManager.startKeepalive(
      () => this.ready,
      () => this.send({ type: 'client.ping', timestamp: Date.now() }),
      () => {
        this.cleanupSocket();
        this.reconnectManager.scheduleReconnect(
          this.callbacks,
          () => this.connect(),
          1006,
          '心跳超时无响应',
        );
      },
    );
  }

  private cleanupSocket(): void {
    cleanupWebSocket(this.ws);
    this.ws = null;
  }
}
