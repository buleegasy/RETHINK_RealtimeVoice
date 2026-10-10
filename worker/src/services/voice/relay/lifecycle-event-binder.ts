import type { Env } from '../../../types';
import { RealtimeGatewayAdapter } from '../../../adapters/realtime-gateway-adapter';
import type { BargeInCoordinator } from '../barge-in-coordinator';
import type { CrisisHandler } from '../crisis-handler';
import type { SidebandAgent } from '../sideband-agent';
import { SessionReporter } from '../session-reporter';

export class LifecycleEventBinder {
  public static bindLifecycleEvents(params: {
    serverWs: WebSocket;
    upstreamWs: WebSocket;
    coordinator: BargeInCoordinator;
    crisisHandler: CrisisHandler;
    sidebandAgent: SidebandAgent;
    env: Env;
    sessionId: string;
    requestedUserId: string;
    sessionStartTime: number;
    ctx?: ExecutionContext;
  }): void {
    const {
      serverWs,
      upstreamWs,
      coordinator,
      crisisHandler,
      sidebandAgent,
      env,
      sessionId,
      requestedUserId,
      sessionStartTime,
      ctx,
    } = params;

    serverWs.addEventListener('close', async (event) => {
      coordinator.abort();
      RealtimeGatewayAdapter.safeClose(upstreamWs, event.code, event.reason);

      const dialogueHistory = sidebandAgent.getDialogueHistory();
      if (dialogueHistory.length >= 1) {
        const closeTask = (async () => {
          try {
            const studentName = sidebandAgent.getStudentName();
            const fullTranscript = dialogueHistory
              .map((d) => `${d.role === 'user' ? studentName || '学生' : '智能体'}: ${d.content}`)
              .join('\n');
            const duration = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
            const stage = crisisHandler.isTriggered
              ? 'Crisis_Escalation'
              : sidebandAgent.getCbtStage();

            await SessionReporter.generateAndPersist(
              env,
              {
                sessionId,
                duration,
                stage,
                studentName,
                userId: requestedUserId,
                transcriptText: fullTranscript,
                dialogueTurns: dialogueHistory,
                isCrisisExplicit: crisisHandler.isTriggered,
              },
              ctx,
            );
          } catch (err) {
            console.error('[RelayClose] 会话持久化与报告生成异常:', err);
          }
        })();

        if (ctx?.waitUntil) {
          ctx.waitUntil(closeTask);
        } else {
          await closeTask;
        }
      }
    });

    upstreamWs.addEventListener('close', (event) => {
      RealtimeGatewayAdapter.safeClose(serverWs, event.code, event.reason);
    });

    serverWs.addEventListener('error', () => {
      RealtimeGatewayAdapter.safeClose(upstreamWs, 1011, 'Client error');
    });

    upstreamWs.addEventListener('error', () => {
      RealtimeGatewayAdapter.safeClose(serverWs, 1011, 'Upstream error');
    });
  }
}
