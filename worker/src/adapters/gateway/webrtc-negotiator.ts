import type { RealtimeGatewayConfig } from './types';
import {
  buildUpstreamClientSecretsUrl,
  buildUpstreamWebRtcUrl,
  isDirectLiveEndpoint,
  stripTrailingSlashes,
} from './gateway-urls';
import { DEFAULT_COMPANION_INSTRUCTIONS, resolveInstructionsWithMemory } from './session-payloads';

export async function createEphemeralToken(
  config: RealtimeGatewayConfig,
  sessionParams?: Record<string, unknown>,
): Promise<{
  ok: boolean;
  clientSecret?: string;
  callsUrl?: string;
  error?: string;
}> {
  if (!config.upstreamKey) {
    return { ok: false, error: '未配置上游访问凭证' };
  }

  const secretsUrl = buildUpstreamClientSecretsUrl(config.upstreamBaseUrl);
  const callsUrl = buildUpstreamWebRtcUrl(config.upstreamBaseUrl, config.upstreamModel);
  const isDirect = isDirectLiveEndpoint(config.upstreamBaseUrl);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (isDirect) {
    headers['api-key'] = config.upstreamKey;
  } else {
    headers['Authorization'] = `Bearer ${config.upstreamKey}`;
  }

  try {
    const res = await fetch(secretsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(sessionParams || { session: { model: config.upstreamModel } }),
    });

    if (res.ok) {
      const data: any = await res.json().catch(() => ({}));
      const clientSecret = data?.client_secret?.value || data?.client_secret || data?.value;
      if (clientSecret) {
        return { ok: true, clientSecret, callsUrl };
      }
    }
    const errText = await res.text().catch(() => '');
    console.error(`[WebRTC Gateway] 获取临时会话密钥失败 (HTTP ${res.status}):`, errText);
    return { ok: false, error: `Upstream returned status ${res.status}: ${errText}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error' };
  }
}

async function formatNegotiationFailure(
  res: Response,
  prefix: string,
): Promise<{
  ok: boolean;
  fallbackToWs: boolean;
  status: number;
  error: string;
}> {
  const errText = await res.text().catch(() => '');
  console.error(`[WebRTC Gateway] ${prefix}协商失败 (HTTP ${res.status}):`, errText);
  return {
    ok: false,
    fallbackToWs: false,
    status: res.status,
    error: `上游 WebRTC 协商失败 (HTTP ${res.status}): ${errText || res.statusText}`,
  };
}

function formatNegotiationException(
  err: any,
  prefix: string,
): {
  ok: boolean;
  fallbackToWs: boolean;
  error: string;
} {
  console.error(`[WebRTC Gateway] ${prefix}协商异常:`, err);
  return {
    ok: false,
    fallbackToWs: false,
    error: `WebRTC 协商异常: ${err?.message || '网络连接异常'}`,
  };
}

export async function negotiateWebRtcOffer(
  config: RealtimeGatewayConfig,
  sdpOffer: string,
  sessionParams?: Record<string, unknown>,
): Promise<{
  ok: boolean;
  sdp?: string;
  fallbackToWs?: boolean;
  wsUrl?: string;
  status?: number;
  error?: string;
}> {
  if (!config.upstreamKey) {
    return {
      ok: false,
      fallbackToWs: false,
      error: '未配置上游访问凭证 (API Key)',
    };
  }

  // 对于直连 Live 端点，直接通过动态会话路径完成 WebRTC SDP 协商
  if (isDirectLiveEndpoint(config.upstreamBaseUrl)) {
    const cleanBase = stripTrailingSlashes(config.upstreamBaseUrl);
    const httpBase = cleanBase.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
    let origin = httpBase;
    try {
      origin = new URL(httpBase).origin;
    } catch {}
    const liveSessionsPath = atob('L29wZW5haS92MS9saXZlL3Nlc3Npb25z');
    const endpoint = `${origin}${liveSessionsPath}`;

    const rawSession = (sessionParams?.session as Record<string, unknown>) || {};
    const voice = (rawSession.voice as string) || 'marin';
    const sessionConfig: Record<string, unknown> = {
      model: config.upstreamModel || atob('Z3B0LWxpdmUtMQ=='),
      audio: {
        output: {
          voice,
        },
      },
    };
    const resolvedInstructions =
      (rawSession.instructions as string) ||
      (sessionParams?.instructions as string) ||
      resolveInstructionsWithMemory(DEFAULT_COMPANION_INSTRUCTIONS);
    sessionConfig.instructions = resolvedInstructions;

    // RFC 4566 规范：SDP 每一行及末尾必须以 CRLF (\r\n) 结尾，防止上游 Pion WebRTC 栈报 EOF 反序列化错误
    const normalizedSdp = sdpOffer.replace(/\r?\n/g, '\r\n').trimEnd() + '\r\n';

    const payload = {
      session: sessionConfig,
      transport: {
        type: 'webrtc',
        sdp: normalizedSdp,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (httpBase.includes(atob('YXp1cmUuY29t'))) {
      headers['api-key'] = config.upstreamKey;
    } else {
      headers['Authorization'] = `Bearer ${config.upstreamKey}`;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data: any = await res.json().catch(() => ({}));
        const answerSdp = data?.transport?.sdp || data?.sdp;
        if (answerSdp) {
          return {
            ok: true,
            sdp: answerSdp,
          };
        }
      }
      return await formatNegotiationFailure(res, '上游 Live SDP ');
    } catch (err: any) {
      return formatNegotiationException(err, '上游 Live SDP ');
    }
  }

  // 先申请临时会话密钥
  const tokenRes = await createEphemeralToken(config, sessionParams);
  if (!tokenRes.ok || !tokenRes.clientSecret) {
    return {
      ok: false,
      fallbackToWs: false,
      error: `获取临时会话密钥失败: ${tokenRes.error || '未知错误'}`,
    };
  }

  const endpoint =
    tokenRes.callsUrl || buildUpstreamWebRtcUrl(config.upstreamBaseUrl, config.upstreamModel);

  // 使用临时凭证进行 WebRTC 协商，要求使用 Bearer Token
  const headers: Record<string, string> = {
    Authorization: `Bearer ${tokenRes.clientSecret}`,
    'Content-Type': 'application/sdp',
  };
  if (isDirectLiveEndpoint(config.upstreamBaseUrl)) {
    headers['api-key'] = config.upstreamKey;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: sdpOffer,
    });

    if (res.ok) {
      const answerSdp = await res.text();
      return {
        ok: true,
        sdp: answerSdp,
      };
    }

    return await formatNegotiationFailure(res, '上游 SDP ');
  } catch (err: any) {
    return formatNegotiationException(err, '上游 SDP ');
  }
}
