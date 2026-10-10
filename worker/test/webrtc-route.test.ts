import { describe, it, expect, vi, afterEach } from 'vitest';
import app from '../src/index';
import { RealtimeGatewayAdapter } from '../src/adapters/realtime-gateway-adapter';

describe('WebRTC 服务端 SDP 协商与路由端点测试', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('buildUpstreamWebRtcUrl 正确生成 WebRTC SDP 协商端点 URL', () => {
    const liveEndpoint = `https://mock-direct-resource.${atob('c2VydmljZXMuYWkuYXp1cmUuY29t')}`;
    const liveUrl = RealtimeGatewayAdapter.buildUpstreamWebRtcUrl(liveEndpoint, 'minimax-realtime');
    expect(liveUrl).toContain(atob('L29wZW5haS92MS9yZWFsdGltZS9jYWxscw=='));

    const standardUrl = RealtimeGatewayAdapter.buildUpstreamWebRtcUrl(
      'https://api.apiyi.com/v1',
      'minimax-realtime',
    );
    expect(standardUrl).toContain('/realtime?model=minimax-realtime');
  });

  it('POST /api/voice/webrtc/offer 缺少 SDP offer 时应拒绝并报错', async () => {
    const res = await app.request('/api/voice/webrtc/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toContain('Missing SDP offer');
  });

  it('POST /api/voice/webrtc/offer 成功协商时返回 SDP Answer', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'v=0\r\nsdp_remote_answer\r\n',
    } as any);

    const mockEnv = {
      REALTIME_UPSTREAM_KEY: 'test-key',
      REALTIME_UPSTREAM_URL: 'https://api.apiyi.com/v1',
      REALTIME_UPSTREAM_MODEL: 'minimax-realtime',
    };

    const res = await app.request(
      '/api/voice/webrtc/offer',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: 'v=0\r\nsdp_local_offer\r\n',
          sessionId: 'sess_123',
          userId: 'user_456',
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.ok).toBe(true);
    expect(data.sdp).toBe('v=0\r\nsdp_remote_answer\r\n');
  });

  it('POST /api/voice/webrtc/offer 上游网关不支持 WebRTC 时自动建议降级至 WebSocket', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'OperationNotSupported',
    } as any);

    const mockEnv = {
      REALTIME_UPSTREAM_KEY: 'test-key',
      REALTIME_UPSTREAM_URL: 'https://api.apiyi.com/v1',
      REALTIME_UPSTREAM_MODEL: 'minimax-realtime',
    };

    const res = await app.request(
      '/api/voice/webrtc/offer',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: 'v=0\r\nsdp_local_offer\r\n',
        }),
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.ok).toBe(true);
    expect(data.fallbackToWs).toBe(true);
    expect(data.wsUrl).toBe('/api/voice/ws');
  });

  it('POST /api/voice/webrtc/session 正常返回会话配置', async () => {
    const res = await app.request('/api/voice/webrtc/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.ok).toBe(true);
    expect(data.transport).toBe('webrtc');
    expect(data.sessionConfig.model).toBe('minimax-realtime');
  });
});
