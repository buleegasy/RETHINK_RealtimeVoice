import { sendCrisisWebhook } from '../../lib/webhook-sender';
import { isWsOpen } from '../../lib/ws-constants';

/**
 * 实时会话危机干预处理器 (CrisisHandler)
 * 职责：双轨危机触发响应、上游响应阻断、客户端安抚通知派发与带重试的高可用 Webhook 告警
 */
export class CrisisHandler {
  private isCrisisTriggered: boolean = false;

  constructor(
    private readonly serverWs: WebSocket,
    private readonly upstreamWs: WebSocket,
    private readonly webhookUrl: string | undefined,
    private readonly sessionId: string,
    private readonly ctx?: ExecutionContext,
  ) {}

  public get isTriggered(): boolean {
    return this.isCrisisTriggered;
  }

  public triggerIntervention(tier: 'L1' | 'L2', summary: string, concerns: string[]): void {
    if (this.isCrisisTriggered) return;
    this.isCrisisTriggered = true;

    this.cancelUpstream();
    this.notifyClient(tier);
    this.dispatchWebhookWithRetry(summary, concerns);
    this.closeConnections();
  }

  private closeConnections(): void {
    try {
      this.upstreamWs.close(1000, 'Crisis intervention completed');
    } catch {}

    try {
      this.serverWs.close(1000, 'Crisis intervention completed');
    } catch {}
  }

  private cancelUpstream(): void {
    if (isWsOpen(this.upstreamWs)) {
      this.upstreamWs.send(JSON.stringify({ type: 'response.cancel' }));
    }
  }

  private notifyClient(tier: 'L1' | 'L2'): void {
    if (isWsOpen(this.serverWs)) {
      this.serverWs.send(
        JSON.stringify({
          type: 'rethink.crisis_intercepted',
          tier,
          message:
            '我听到了你现在非常痛苦，请记住生命永远是最宝贵的。我现在立即为你接通紧急守护支持。',
        }),
      );
    }
  }

  private dispatchWebhookWithRetry(summary: string, concerns: string[]): void {
    if (!this.webhookUrl) return;

    const task = (async () => {
      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        try {
          const res = await sendCrisisWebhook(this.webhookUrl, {
            sessionId: this.sessionId,
            crisisLevel: 3,
            crisisSummary: summary,
            occurredAt: new Date().toISOString(),
            boothLocation: '校园心理驿站#01',
            coreConcerns: concerns,
          });
          if (res.success) {
            break;
          }
        } catch (err) {
          console.warn(`[CrisisHandler] Webhook 发送第 ${attempts} 次尝试失败:`, err);
        }
        if (attempts < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempts * 800));
        }
      }
    })();

    if (this.ctx?.waitUntil) {
      this.ctx.waitUntil(task);
    }
  }
}
