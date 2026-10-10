import { RealtimeGatewayAdapter } from '../../../adapters/realtime-gateway-adapter';
import type { SidebandAgent } from '../sideband-agent';
import { isWsOpen } from '../../../lib/ws-constants';

export class UpstreamEventBinder {
  public static bindUpstreamEvents(params: {
    serverWs: WebSocket;
    upstreamWs: WebSocket;
    sidebandAgent: SidebandAgent;
    isDirectLive: boolean;
    onSessionReady: () => void;
  }): void {
    const { serverWs, upstreamWs, sidebandAgent, isDirectLive, onSessionReady } = params;
    let isAssistantSpeaking = false;
    let assistantSilenceTimer: any = null;

    upstreamWs.addEventListener('message', async (event) => {
      try {
        let payload: any = null;
        if (typeof event.data === 'string') {
          try {
            payload = JSON.parse(event.data);
          } catch {}
        } else if (event.data && typeof (event.data as any).text === 'function') {
          try {
            payload = JSON.parse(await (event.data as any).text());
          } catch {}
        }

        if (payload && typeof payload === 'object') {
          if (isDirectLive && payload.type === 'session.started') {
            onSessionReady();
          }

          if (isDirectLive) {
            if (payload.type === 'session.output_audio.delta') {
              if (!isAssistantSpeaking) {
                isAssistantSpeaking = true;
                if (isWsOpen(serverWs)) {
                  serverWs.send(JSON.stringify({ type: 'response.created' }));
                }
              }
              if (assistantSilenceTimer) {
                clearTimeout(assistantSilenceTimer);
              }
              assistantSilenceTimer = setTimeout(() => {
                if (isAssistantSpeaking) {
                  isAssistantSpeaking = false;
                  if (isWsOpen(serverWs)) {
                    serverWs.send(JSON.stringify({ type: 'response.done' }));
                  }
                  sidebandAgent.finalizeAssistantTurn();
                }
              }, 800);
            } else if (payload.type === 'session.output_audio.done') {
              if (assistantSilenceTimer) {
                clearTimeout(assistantSilenceTimer);
                assistantSilenceTimer = null;
              }
              if (isAssistantSpeaking) {
                isAssistantSpeaking = false;
                sidebandAgent.finalizeAssistantTurn();
              }
            }
          }

          const { transformed } = RealtimeGatewayAdapter.transformUpstreamEvent(
            payload,
            isDirectLive,
          );

          if (isWsOpen(serverWs)) {
            serverWs.send(JSON.stringify(transformed));
          }

          // 委托原生旁路智能体托管会话转写监听、L1/L2 安全熔断与认知引导
          await sidebandAgent.handleUpstreamEvent(payload);
        }
      } catch {}
    });
  }
}
