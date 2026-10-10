import { DEFAULT_VOICE, DEFAULT_VOICE_INSTRUCTIONS } from '../constants';
import { apiFetch } from '../../api';
import type { MiniMaxWebRtcOptions } from '../webrtcClient';

export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
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

const ALLOWED_CALLS_DOMAINS: readonly string[] = [
  'api.apiyi.com',
  'api.minimax.chat',
  atob('c2VydmljZXMuYWkuYXp1cmUuY29t'),
  atob('YXBpLm9wZW5haS5jb20='),
];

export async function negotiateSdp(
  pc: RTCPeerConnection,
  options: MiniMaxWebRtcOptions,
  offer: RTCSessionDescriptionInit,
): Promise<string> {
  const sdpPayload = {
    sdp: pc.localDescription?.sdp || offer.sdp,
    sessionId: options.sessionId,
    userId: options.userId,
    username: options.username,
    model: options.model || 'minimax-realtime',
    voice: options.voice || DEFAULT_VOICE,
    instructions: options.sessionConfig?.instructions || DEFAULT_VOICE_INSTRUCTIONS,
  };

  let remoteSdp = '';

  // 1. 尝试通过临时会话密钥 (client_secrets) 发起端到端直连协商
  try {
    const sessionRes = await apiFetch('/api/voice/webrtc/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || 'minimax-realtime',
        voice: options.voice || DEFAULT_VOICE,
      }),
    });
    if (sessionRes.ok) {
      const sessionData: any = await sessionRes.json().catch(() => ({}));
      if (sessionData.clientSecret && typeof sessionData.callsUrl === 'string') {
        const parsedUrl = new URL(sessionData.callsUrl);
        const allowedHosts = [
          ...ALLOWED_CALLS_DOMAINS,
          typeof window !== 'undefined' ? window.location.hostname : '',
        ];
        if (parsedUrl.protocol === 'https:' && allowedHosts.includes(parsedUrl.hostname)) {
          const directRes = await fetch(parsedUrl.toString(), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${sessionData.clientSecret}`,
              'Content-Type': 'application/sdp',
            },
            body: (pc.localDescription?.sdp || offer.sdp) ?? '',
          });
          if (directRes.ok) {
            remoteSdp = await directRes.text();
          }
        }
      }
    }
  } catch (directErr) {
    console.warn('[MiniMaxWebRtcClient] 临时密钥直连尝试跳过，使用中继协商:', directErr);
  }

  // 2. 若直连未取得 SDP Answer，通过 Worker 网关代理协商
  if (!remoteSdp) {
    const offerUrl = options.offerEndpoint || '/api/voice/webrtc/offer';
    const res = await apiFetch(offerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sdpPayload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`SDP 协商网络请求失败 (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json().catch(() => ({}));
    if (!data.sdp) {
      throw new Error(data.error || 'WebRTC 协商未返回有效 Remote SDP');
    }
    remoteSdp = data.sdp;
  }

  return remoteSdp;
}
