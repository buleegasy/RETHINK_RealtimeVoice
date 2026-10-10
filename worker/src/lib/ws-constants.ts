/**
 * WebSocket 连接就绪状态常量 (RFC 6455 / W3C WebSocket 标准)
 * 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
 */
export const WS_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

export function isWsOpen<T extends { readyState: number }>(
  ws: T | null | undefined,
): ws is NonNullable<T> {
  return Boolean(
    ws && typeof ws === 'object' && 'readyState' in ws && ws.readyState === WS_READY_STATE.OPEN,
  );
}
