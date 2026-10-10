import type { MiniMaxClientCallbacks } from '../types';

function getSecureRandomRatio(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] / 0x100000000;
  }
  return 0.5;
}

export class ReconnectManager {
  private attempts: number = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxAttempts: number;

  constructor(maxAttempts: number = 6) {
    this.maxAttempts = maxAttempts;
  }

  public get currentAttempts(): number {
    return this.attempts;
  }

  public get isReconnecting(): boolean {
    return this.attempts > 0;
  }

  public reset(): void {
    this.attempts = 0;
    this.cancel();
  }

  public cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public scheduleReconnect(
    callbacks: MiniMaxClientCallbacks,
    onReconnect: () => void,
    lastCode?: number,
    lastReason?: string,
  ): void {
    if (this.attempts >= this.maxAttempts) {
      console.error('[MiniMaxClient] 已达最大重连次数，停止重连');
      callbacks.onMaxReconnectFailed?.();
      callbacks.onClose?.(lastCode || 1006, lastReason || '重连次数已达上限');
      return;
    }

    this.attempts++;
    const baseDelay = Math.min(1000 * Math.pow(1.5, this.attempts - 1), 6000);
    const jitter = getSecureRandomRatio() * 400;
    const delay = Math.round(baseDelay + jitter);
    console.log(
      `[MiniMaxClient] 将在 ${delay}ms 后进行第 ${this.attempts}/${this.maxAttempts} 次重连...`,
    );

    callbacks.onReconnecting?.(this.attempts, this.maxAttempts, delay);

    this.cancel();
    this.timer = setTimeout(() => {
      onReconnect();
    }, delay);
  }
}
