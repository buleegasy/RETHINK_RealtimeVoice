import type { Env } from '../../types';
import type { RealtimeGatewayConfig } from './types';

export function stripTrailingSlashes(str: string): string {
  let s = str.trim();
  while (s.endsWith('/')) {
    s = s.slice(0, -1);
  }
  return s;
}

export function isDirectLiveEndpoint(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  const domainA = atob('c2VydmljZXMuYWkuYXp1cmUuY29t');
  const domainB = atob('b3BlbmFpLmF6dXJlLmNvbQ==');
  return lower.includes(domainA) || lower.includes(domainB) || lower.includes('/live');
}

export function resolveGatewayConfig(env: Env, requestedModel?: string): RealtimeGatewayConfig {
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
    upstreamBaseUrl: stripTrailingSlashes(rawBaseUrl),
    upstreamModel,
  };
}

export function buildUpstreamWsUrl(baseUrl: string, model: string): string {
  const cleanBase = stripTrailingSlashes(baseUrl);
  const httpBase = cleanBase.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
  if (isDirectLiveEndpoint(httpBase)) {
    const livePath = atob('L29wZW5haS92MS9saXZlL3Nlc3Npb25z');
    return httpBase.endsWith(livePath) ? httpBase : `${httpBase}${livePath}`;
  }
  const query = `model=${encodeURIComponent(model)}`;
  return httpBase.endsWith('/realtime') ? `${httpBase}?${query}` : `${httpBase}/realtime?${query}`;
}

export function buildSidebandAttachWsUrl(baseUrl: string, sessionId: string): string {
  const cleanBase = stripTrailingSlashes(baseUrl);
  const wsBase = cleanBase.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
  const attachPrefix = atob('L29wZW5haS92MS9saXZlL3Nlc3Npb25zLw==');
  const attachSuffix = atob('L2F0dGFjaA==');
  return `${wsBase}${attachPrefix}${encodeURIComponent(sessionId)}${attachSuffix}`;
}

export function buildUpstreamClientSecretsUrl(baseUrl: string): string {
  const cleanBase = stripTrailingSlashes(baseUrl);
  const httpBase = cleanBase.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
  let origin = httpBase;
  let queryStr = '';
  try {
    const u = new URL(httpBase);
    origin = u.origin;
    const apiVersion = u.searchParams.get('api-version');
    if (apiVersion) {
      queryStr = `?api-version=${apiVersion}`;
    }
  } catch {}
  const secretsPath = atob('L29wZW5haS92MS9yZWFsdGltZS9jbGllbnRfc2VjcmV0cw==');
  return `${origin}${secretsPath}${queryStr}`;
}

export function buildUpstreamWebRtcUrl(baseUrl: string, model: string): string {
  const cleanBase = stripTrailingSlashes(baseUrl);
  const httpBase = cleanBase.replace(/^ws:\/\//i, 'http://').replace(/^wss:\/\//i, 'https://');
  let apiVersionParam = '';
  try {
    const u = new URL(httpBase);
    const apiVersion = u.searchParams.get('api-version');
    if (apiVersion) {
      apiVersionParam = `&api-version=${apiVersion}`;
    }
  } catch {}

  const query = `model=${encodeURIComponent(model)}${apiVersionParam}`;
  if (isDirectLiveEndpoint(httpBase)) {
    let origin = httpBase;
    try {
      origin = new URL(httpBase).origin;
    } catch {}
    const callsPath = atob('L29wZW5haS92MS9yZWFsdGltZS9jYWxscw==');
    return `${origin}${callsPath}?${query}`;
  }
  return httpBase.endsWith('/realtime') ? `${httpBase}?${query}` : `${httpBase}/realtime?${query}`;
}

export function formatRealtimeError(code: string, message: string): string {
  return JSON.stringify({
    type: 'error',
    error: {
      code,
      message,
      timestamp: Date.now(),
    },
  });
}

export function safeClose(ws: WebSocket, code?: number, reason?: string): void {
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
