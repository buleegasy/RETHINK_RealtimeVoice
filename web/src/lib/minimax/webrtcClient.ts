import {
  DEFAULT_RTC_ICE_SERVERS,
  WEBRTC_DATA_CHANNEL_NAME,
  DEFAULT_VOICE,
  CBT_VOICE_TOOLS,
  DEFAULT_VOICE_INSTRUCTIONS,
  OPENING_GREETING,
} from './constants';
import type { MiniMaxClientCallbacks, MiniMaxSessionConfig, MiniMaxServerEvent } from './types';
import { apiFetch } from '../api';

export interface MiniMaxWebRtcOptions {
  sessionId?: string;
  userId?: string;
  username?: string;
  token?: string;
  model?: string;
  voice?: string;
  offerEndpoint?: string;
  iceServers?: RTCIceServer[];
  sessionConfig?: MiniMaxSessionConfig;
  callbacks?: MiniMaxClientCallbacks;
  sendGreetingOnConnect?: boolean;
}

export class MiniMaxWebRtcClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private remoteStream: MediaStream | null = null;
  private readonly options: MiniMaxWebRtcOptions;
  private readonly callbacks: MiniMaxClientCallbacks;
  private isConnected: boolean = false;
  private isExplicitlyClosed: boolean = false;
  private currentResponseItemId: string | null = null;
  private playbackEpoch: number = 0;
  private readonly canceledResponseItemIds: Set<string> = new Set();
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private pingStartTime: number = 0;

  constructor(options?: MiniMaxWebRtcOptions) {
    this.options = options || {};
    this.callbacks = options?.callbacks || {};
  }

  public get ready(): boolean {
    return this.isConnected && this.dc?.readyState === 'open';
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
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

  public async connect(localStream?: MediaStream): Promise<boolean> {
    this.isExplicitlyClosed = false;
    this.cleanup();

    if (typeof RTCPeerConnection === 'undefined') {
      return false;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: this.options.iceServers || DEFAULT_RTC_ICE_SERVERS,
      });
      this.pc = pc;

      this.setupPeerConnectionEvents(pc);
      this.attachLocalTracks(pc, localStream);
      this.setupDataChannel(pc);

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      await this.waitForIceGathering(pc, 1200);

      const sdpPayload = {
        sdp: pc.localDescription?.sdp || offer.sdp,
        sessionId: this.options.sessionId,
        userId: this.options.userId,
        username: this.options.username,
        model: this.options.model || 'minimax-realtime',
        voice: this.options.voice || DEFAULT_VOICE,
      };

      const offerUrl = this.options.offerEndpoint || '/api/voice/webrtc/offer';
      const res = await apiFetch(offerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sdpPayload),
      });

      if (!res.ok) {
        this.cleanup();
        return false;
      }

      const data = await res.json().catch(() => ({}));
      if (data.fallbackToWs || !data.sdp) {
        this.cleanup();
        return false;
      }

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: data.sdp,
      });

      return true;
    } catch (err) {
      console.warn('[MiniMaxWebRtcClient] WebRTC 协商握手异常:', err);
      this.cleanup();
      return false;
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.cleanup();
  }

  public sendEvent(event: Record<string, unknown>): boolean {
    if (!this.dc || this.dc.readyState !== 'open') {
      return false;
    }
    try {
      this.dc.send(JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
  }

  public updateTurnDetection(mode: 'speaking' | 'listening'): void {
    const vadConfig =
      mode === 'speaking'
        ? {
            type: 'server_vad',
            threshold: 0.85,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            create_response: false,
            interrupt_response: false,
          }
        : {
            type: 'server_vad',
            threshold: 0.65,
            prefix_padding_ms: 200,
            silence_duration_ms: 300,
            create_response: false,
            interrupt_response: false,
          };

    this.sendEvent({
      type: 'session.update',
      session: {
        type: 'realtime',
        turn_detection: vadConfig,
        audio: {
          input: { turn_detection: vadConfig },
        },
      },
    });
  }

  public interrupt(options?: { itemId?: string; audioEndMs?: number }): void {
    this.playbackEpoch += 1;
    const targetItemId = options?.itemId || this.currentResponseItemId;

    if (targetItemId) {
      this.canceledResponseItemIds.add(targetItemId);
      this.sendEvent({
        type: 'conversation.item.truncate',
        item_id: targetItemId,
        content_index: 0,
        audio_end_ms: options?.audioEndMs ?? 0,
      });
    }

    this.sendEvent({ type: 'response.cancel' });
    this.currentResponseItemId = null;
  }

  public sendSessionUpdate(customConfig?: Partial<MiniMaxSessionConfig>): void {
    const config = { ...this.options.sessionConfig, ...customConfig };
    this.sendEvent({
      type: 'session.update',
      session: {
        type: 'realtime',
        modalities: config.modalities || ['audio', 'text'],
        instructions: config.instructions || DEFAULT_VOICE_INSTRUCTIONS,
        voice: config.voice || DEFAULT_VOICE,
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.65,
              prefix_padding_ms: 200,
              silence_duration_ms: 300,
              create_response: false,
              interrupt_response: false,
            },
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: config.voice || DEFAULT_VOICE,
          },
        },
        tools: config.tools || CBT_VOICE_TOOLS,
        tool_choice: 'auto',
      },
    });
  }

  private setupPeerConnectionEvents(pc: RTCPeerConnection): void {
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStream = stream;
      this.callbacks.onRemoteStream?.(stream);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        if (!this.isExplicitlyClosed) {
          this.callbacks.onClose?.(1006, `ICE state: ${pc.iceConnectionState}`);
        }
      }
    };
  }

  private attachLocalTracks(pc: RTCPeerConnection, localStream?: MediaStream): void {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }
  }

  private setupDataChannel(pc: RTCPeerConnection): void {
    const dc = pc.createDataChannel(WEBRTC_DATA_CHANNEL_NAME);
    this.dc = dc;

    dc.onopen = () => {
      this.isConnected = true;
      this.callbacks.onOpen?.();
      this.sendSessionUpdate();
      this.startKeepalive();

      if (this.options.sendGreetingOnConnect !== false) {
        this.sendInitialGreeting();
      }
    };

    dc.onmessage = (event) => {
      this.handleIncomingDataMessage(event.data);
    };

    dc.onclose = () => {
      this.isConnected = false;
      this.stopKeepalive();
      if (!this.isExplicitlyClosed) {
        this.callbacks.onClose?.(1000, 'DataChannel closed');
      }
    };

    dc.onerror = (err) => {
      this.callbacks.onError?.(err);
    };
  }

  private handleIncomingDataMessage(rawData: any): void {
    try {
      const text = typeof rawData === 'string' ? rawData : new TextDecoder().decode(rawData);
      const parsed: MiniMaxServerEvent = JSON.parse(text);
      this.dispatchProtocolEvent(parsed);
    } catch {}
  }

  private dispatchProtocolEvent(event: MiniMaxServerEvent): void {
    const { type } = event;

    if (type === 'response.audio_transcript.delta' && event.delta) {
      this.callbacks.onTextDelta?.(event.delta);
    } else if (
      type === 'conversation.item.input_audio_transcription.completed' &&
      event.transcript
    ) {
      this.callbacks.onTranscriptDelta?.(event.transcript);
    } else if (type === 'input_audio_buffer.speech_started') {
      this.callbacks.onSpeechStarted?.();
    } else if (type === 'input_audio_buffer.speech_stopped') {
      this.callbacks.onSpeechStopped?.();
    } else if (type === 'response.created') {
      this.currentResponseItemId = event.response?.id || null;
      this.callbacks.onTurnStart?.();
    } else if (type === 'response.done') {
      this.callbacks.onTurnEnd?.();
    } else if (type === 'response.function_call_arguments.done' && event.name && event.call_id) {
      let args = {};
      try {
        args = JSON.parse(event.arguments || '{}');
      } catch {}
      this.callbacks.onToolCall?.({
        name: event.name,
        callId: event.call_id,
        args,
      });
    } else if (type === 'safety_check' && (event as any).check) {
      this.callbacks.onSafetyCheck?.((event as any).check);
    } else if (type === 'shadow_directive' && (event as any).directive) {
      this.callbacks.onShadowDirective?.((event as any).directive);
    } else if (type === 'crisis_interception') {
      this.callbacks.onCrisisInterception?.({
        message: (event as any).message || '触发高危心理防御拦截',
        tier: (event as any).tier,
      });
    } else if (type === 'pong') {
      if (this.pingStartTime > 0) {
        const rtt = Date.now() - this.pingStartTime;
        this.callbacks.onPingPong?.(rtt);
      }
    }
  }

  private sendInitialGreeting(): void {
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '同学推门走进了心理咨询室' }],
      },
    });

    this.sendEvent({
      type: 'response.create',
      response: {
        instructions: `请以专为高中生心理倾诉的伙伴 Re-think 身份，主动向同学说开场问候语："${OPENING_GREETING}"。语气温暖轻快，一句话打招呼即可。`,
      },
    });
  }

  private waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pc.removeEventListener('icecandidate', checkCandidate);
        resolve();
      }, timeoutMs);

      const checkCandidate = (e: RTCPeerConnectionIceEvent) => {
        if (!e.candidate || pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          pc.removeEventListener('icecandidate', checkCandidate);
          resolve();
        }
      };

      pc.addEventListener('icecandidate', checkCandidate);
    });
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ready) {
        this.pingStartTime = Date.now();
        this.sendEvent({ type: 'ping', timestamp: this.pingStartTime });
      }
    }, 15000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private cleanup(): void {
    this.stopKeepalive();
    this.isConnected = false;

    if (this.dc) {
      try {
        this.dc.onopen = null;
        this.dc.onmessage = null;
        this.dc.onclose = null;
        this.dc.onerror = null;
        this.dc.close();
      } catch {}
      this.dc = null;
    }

    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch {}
      this.pc = null;
    }

    this.remoteStream = null;
    this.currentResponseItemId = null;
  }
}
