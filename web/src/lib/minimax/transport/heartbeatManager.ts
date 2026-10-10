export class HeartbeatManager {
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private initialPingTimer: ReturnType<typeof setTimeout> | null = null;

  public startKeepalive(
    isReady: () => boolean,
    sendPing: () => void,
    onDeadConnection: () => void,
  ): void {
    this.stopKeepalive();

    // 握手就绪后延迟 500ms 发送首个 Ping，确保握手协议帧（session.update / greeting）严格先行
    this.initialPingTimer = setTimeout(() => {
      if (isReady()) {
        sendPing();
      }
    }, 500);

    this.keepaliveTimer = setInterval(() => {
      if (isReady()) {
        sendPing();
        this.clearPongTimeout();
        this.pongTimeoutTimer = setTimeout(() => {
          console.warn('[MiniMaxClient] 心跳无响应 (Pong Timeout)，判定为死连接，主动重连');
          onDeadConnection();
        }, 15000);
      }
    }, 4000);
  }

  public handlePong(): void {
    this.clearPongTimeout();
  }

  public stopKeepalive(): void {
    if (this.initialPingTimer) {
      clearTimeout(this.initialPingTimer);
      this.initialPingTimer = null;
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    this.clearPongTimeout();
  }

  private clearPongTimeout(): void {
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }
}
