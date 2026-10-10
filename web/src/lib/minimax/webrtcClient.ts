import { DEFAULT_RTC_ICE_SERVERS, WEBRTC_DATA_CHANNEL_NAME, OPENING_GREETING } from './constants';
import type { MiniMaxClientCallbacks, MiniMaxSessionConfig, MiniMaxServerEvent } from './types';
import { waitForIceGathering, negotiateSdp } from './webrtc/sdpNegotiator';
import { buildTurnDetectionPayload, buildWebRtcSessionUpdate } from './webrtc/payloadBuilder';
import { dispatchDataChannelEvent } from './webrtc/dataChannelDispatcher';

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

      await waitForIceGathering(pc, 1200);

      const remoteSdp = await negotiateSdp(pc, this.options, offer);

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: remoteSdp,
      });

      return true;
    } catch (err: any) {
      console.warn('[MiniMaxWebRtcClient] WebRTC 协商握手异常:', err);
      this.cleanup();
      throw err;
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
    this.sendEvent(buildTurnDetectionPayload(mode));
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
    this.sendEvent(buildWebRtcSessionUpdate(this.options, customConfig));
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
      this.startKeepalive();

      if (this.options.sendGreetingOnConnect !== false) {
        this.sendEvent({
          type: 'session.commentary.append',
          content: OPENING_GREETING,
          delegation_id: null,
        });
      }
    };

    dc.onmessage = (event) => {
      try {
        const text =
          typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
        const parsed: MiniMaxServerEvent = JSON.parse(text);
        dispatchDataChannelEvent(parsed, this.callbacks, {
          pingStartTime: this.pingStartTime,
          onResponseCreated: (id) => {
            this.currentResponseItemId = id;
          },
        });
      } catch {}
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
