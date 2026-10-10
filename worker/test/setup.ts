// 为 Node.js 测试环境 (如 CI Node 20) 提供 WebSocket 常量兜底 (RFC 6455)
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  };
} else if (typeof (globalThis as any).WebSocket.OPEN === 'undefined') {
  (globalThis as any).WebSocket.CONNECTING = 0;
  (globalThis as any).WebSocket.OPEN = 1;
  (globalThis as any).WebSocket.CLOSING = 2;
  (globalThis as any).WebSocket.CLOSED = 3;
}
