import { validateWebSocketUrl } from './sessionPayloadBuilder';
import type { MiniMaxClientCallbacks } from '../types';
import type { ReconnectManager } from './reconnectManager';
import type { HeartbeatManager } from './heartbeatManager';

export interface ManagedSocketContext {
  reconnectManager: ReconnectManager;
  heartbeatManager: HeartbeatManager;
  callbacks: MiniMaxClientCallbacks;
  isExplicitlyClosed: () => boolean;
  onOpen: (isReconnection: boolean) => void;
  onMessage: (data: string | ArrayBuffer) => void;
  onReconnect: () => void;
  onStateChange: (connected: boolean) => void;
}

export function createManagedWebSocket(wsUrl: string, ctx: ManagedSocketContext): WebSocket {
  const sanitizedUrl = validateWebSocketUrl(wsUrl);
  const ws = new WebSocket(sanitizedUrl);

  ws.onopen = () => {
    console.log('[MiniMaxClient] 实时语音链路已建立');
    const isReconnection = ctx.reconnectManager.isReconnecting;
    ctx.onStateChange(true);
    ctx.reconnectManager.reset();
    ctx.onOpen(isReconnection);
    ctx.callbacks.onOpen?.();
    if (isReconnection) {
      ctx.callbacks.onReconnected?.();
    }
  };

  ws.onmessage = (event) => {
    ctx.onMessage(event.data);
  };

  ws.onerror = (err) => {
    console.error('[MiniMaxClient] WebSocket 异常:', err);
    ctx.callbacks.onError?.(err);
  };

  ws.onclose = (event) => {
    console.warn(`[MiniMaxClient] WebSocket 关闭 (code: ${event.code}, reason: ${event.reason})`);
    ctx.onStateChange(false);
    ctx.heartbeatManager.stopKeepalive();

    const isNormalClose = event.code === 1000 || event.code === 1005;
    if (ctx.isExplicitlyClosed() || isNormalClose) {
      ctx.callbacks.onClose?.(event.code, event.reason);
    } else {
      ctx.reconnectManager.scheduleReconnect(
        ctx.callbacks,
        ctx.onReconnect,
        event.code,
        event.reason,
      );
    }
  };

  return ws;
}

export function cleanupWebSocket(ws: WebSocket | null): void {
  if (!ws) return;
  try {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, 'Client closed');
    }
  } catch {}
}
