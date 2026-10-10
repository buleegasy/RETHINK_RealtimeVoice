import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MiniMaxWebRtcClient } from '../src/lib/minimax/webrtcClient';
import { MiniMaxRealtimeClient } from '../src/lib/minimax/client';

class MockDataChannel {
  public readyState: string = 'connecting';
  public sentMessages: string[] = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((err: any) => void) | null = null;

  constructor(public label: string) {
    setTimeout(() => {
      this.readyState = 'open';
      this.onopen?.();
    }, 10);
  }

  public send(data: string) {
    this.sentMessages.push(data);
  }

  public close() {
    this.readyState = 'closed';
    this.onclose?.();
  }
}

class MockRTCPeerConnection {
  public iceGatheringState: string = 'complete';
  public iceConnectionState: string = 'connected';
  public localDescription: { type: string; sdp: string } | null = null;
  public remoteDescription: { type: string; sdp: string } | null = null;
  public dataChannel: MockDataChannel | null = null;
  public addedTracks: MediaStreamTrack[] = [];
  public ontrack: ((ev: any) => void) | null = null;
  public oniceconnectionstatechange: (() => void) | null = null;

  constructor(public config?: any) {}

  public addTrack(track: MediaStreamTrack) {
    this.addedTracks.push(track);
  }

  public createDataChannel(label: string) {
    const dc = new MockDataChannel(label);
    this.dataChannel = dc;
    return dc;
  }

  public async createOffer() {
    return { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\n' };
  }

  public async setLocalDescription(desc: any) {
    this.localDescription = desc;
  }

  public async setRemoteDescription(desc: any) {
    this.remoteDescription = desc;
  }

  public addEventListener(_event: string, _cb: any) {}
  public removeEventListener(_event: string, _cb: any) {}

  public close() {
    this.iceConnectionState = 'closed';
    if (this.dataChannel) {
      this.dataChannel.close();
    }
  }
}

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 5);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code = 1000, reason = 'Normal') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

describe('WebRTC Client & Dual-Transport Architecture Tests', () => {
  const originalRTCPeerConnection = globalThis.RTCPeerConnection;
  const originalWebSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
    (globalThis as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    (globalThis as any).RTCPeerConnection = originalRTCPeerConnection;
    (globalThis as any).WebSocket = originalWebSocket;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('MiniMaxWebRtcClient 成功进行 SDP 协商并就绪', async () => {
    const onOpen = vi.fn();
    const onTextDelta = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sdp: 'v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\ntype=answer\r\n',
      }),
    } as any);

    const client = new MiniMaxWebRtcClient({
      sessionId: 'sess_test_1',
      userId: 'stu_123',
      callbacks: { onOpen, onTextDelta },
    });

    const success = await client.connect();
    expect(success).toBe(true);

    await new Promise((r) => setTimeout(r, 25));

    expect(onOpen).toHaveBeenCalled();
    expect(client.ready).toBe(true);

    // 测试 DataChannel 消息转译
    const pc = (client as any).pc as MockRTCPeerConnection;
    const dc = pc.dataChannel as MockDataChannel;

    dc.onmessage?.({
      data: JSON.stringify({
        type: 'response.audio_transcript.delta',
        delta: '你好，我是Re-think',
      }),
    });

    expect(onTextDelta).toHaveBeenCalledWith('你好，我是Re-think');

    // 测试发送 session.update 与打断
    client.updateTurnDetection('speaking');
    const lastSent = JSON.parse(dc.sentMessages[dc.sentMessages.length - 1]);
    expect(lastSent.type).toBe('session.update');
    expect(lastSent.session.turn_detection.threshold).toBe(0.85);

    client.disconnect();
    expect(client.ready).toBe(false);
  });

  it('MiniMaxRealtimeClient 在 WebRTC 协商失败时自动平滑回退至 WebSocket', async () => {
    // 模拟 SDP 协商接口返回需要回退
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        fallbackToWs: true,
        wsUrl: 'ws://localhost:8787/api/voice/ws',
      }),
    } as any);

    const onTransportChange = vi.fn();
    const onOpen = vi.fn();

    const client = new MiniMaxRealtimeClient({
      transport: 'auto',
      relayUrl: 'ws://localhost:8787/api/voice/ws',
      callbacks: {
        onTransportChange,
        onOpen,
      },
    });

    await client.connect();
    await new Promise((r) => setTimeout(r, 25));

    // 验证回退到 WebSocket
    expect(client.getTransportType()).toBe('websocket');
    expect(onTransportChange).toHaveBeenCalledWith('websocket');
    expect(client.ready).toBe(true);

    client.disconnect();
  });

  it('MiniMaxRealtimeClient 在 transport 指定为 webrtc 且建连成功时激活 WebRTC', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sdp: 'v=0\r\nsdp_answer\r\n',
      }),
    } as any);

    const onTransportChange = vi.fn();
    const client = new MiniMaxRealtimeClient({
      transport: 'webrtc',
      callbacks: {
        onTransportChange,
      },
    });

    await client.connect();
    await new Promise((r) => setTimeout(r, 25));

    expect(client.getTransportType()).toBe('webrtc');
    expect(onTransportChange).toHaveBeenCalledWith('webrtc');
    expect(client.ready).toBe(true);

    // WebRTC 模式下 sendAudioChunk 不重复通过 JSON 发送分片
    client.sendAudioChunk('AQIDBA==');
    const pc = ((client as any).webrtcClient as any).pc as MockRTCPeerConnection;
    const dc = pc.dataChannel as MockDataChannel;
    const hasAudioAppend = dc.sentMessages.some((msg) => msg.includes('input_audio_buffer.append'));
    expect(hasAudioAppend).toBe(false);

    client.disconnect();
  });

  it('MiniMaxWebRtcClient 兼容接收 input_audio_transcription 的 delta 与 completed 事件', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sdp: 'v=0\r\nsdp_answer\r\n',
      }),
    } as any);

    const onTranscriptDelta = vi.fn();
    const onTranscriptCompleted = vi.fn();
    const client = new MiniMaxWebRtcClient({
      callbacks: { onTranscriptDelta, onTranscriptCompleted },
    });

    await client.connect();
    await new Promise((r) => setTimeout(r, 20));

    const pc = (client as any).pc as MockRTCPeerConnection;
    const dc = pc.dataChannel as MockDataChannel;

    // 1. 模拟 WebRTC DataChannel 收到 input_audio_transcription.delta
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'conversation.item.input_audio_transcription.delta',
        delta: '流式转写',
      }),
    });
    expect(onTranscriptDelta).toHaveBeenCalledWith('流式转写');
    expect(onTranscriptCompleted).not.toHaveBeenCalled();

    // 2. 模拟收到 completed
    dc.onmessage?.({
      data: JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: '流式转写完成',
      }),
    });
    expect(onTranscriptDelta).toHaveBeenCalledWith('流式转写完成');
    expect(onTranscriptCompleted).toHaveBeenCalledWith('流式转写完成');

    client.disconnect();
  });
});
