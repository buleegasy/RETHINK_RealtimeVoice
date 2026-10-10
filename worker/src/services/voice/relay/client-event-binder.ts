import { RealtimeGatewayAdapter } from '../../../adapters/realtime-gateway-adapter';
import type { BargeInCoordinator } from '../barge-in-coordinator';

export class ClientEventBinder {
  public static parseJsonSafely(data: any): any {
    try {
      if (typeof data === 'string') return JSON.parse(data);
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
        return JSON.parse(new TextDecoder().decode(data));
      }
    } catch {}
    return null;
  }

  public static bindClientEvents(params: {
    serverWs: WebSocket;
    upstreamWs: WebSocket;
    coordinator: BargeInCoordinator;
    currentMemory: any;
    isDirectLive: boolean;
    upstreamModel?: string;
    isSessionReady: () => boolean;
  }): { flushEarlyQueue: () => void } {
    const {
      serverWs,
      upstreamWs,
      coordinator,
      currentMemory,
      isDirectLive,
      upstreamModel,
      isSessionReady,
    } = params;
    const earlyMessageQueue: any[] = [];
    const MAX_EARLY_QUEUE_SIZE = 100;

    const processAndSend = (eventData: any) => {
      const payload = this.parseJsonSafely(eventData);

      if (payload?.type === 'client.ping') {
        if (serverWs.readyState === WebSocket.OPEN) {
          serverWs.send(
            JSON.stringify({
              type: 'server.pong',
              clientTimestamp: payload.timestamp,
              serverTime: Date.now(),
            }),
          );
        }
        return;
      }

      if (payload?.type === 'response.cancel') {
        coordinator.interrupt();
      }

      if (payload?.type === 'session.update' && payload.session) {
        if (isDirectLive) {
          return;
        }
        const cleanSession = RealtimeGatewayAdapter.normalizeSessionUpdatePayload(
          payload.session,
          currentMemory,
        );
        const upstreamSession = RealtimeGatewayAdapter.buildUpstreamSessionPayload(
          cleanSession,
          upstreamModel,
        );
        upstreamWs.send(
          JSON.stringify({
            type: 'session.update',
            session: upstreamSession,
          }),
        );
        return;
      }

      if (payload?.type === 'response.create') {
        if (!isDirectLive) {
          upstreamWs.send(JSON.stringify(payload));
        }
        return;
      }

      const { transformed, shouldDrop } = RealtimeGatewayAdapter.transformClientEvent(
        payload || eventData,
        isDirectLive,
      );
      if (shouldDrop) return;

      if (transformed && typeof transformed === 'object') {
        upstreamWs.send(JSON.stringify(transformed));
      } else {
        upstreamWs.send(eventData);
      }
    };

    const flushEarlyQueue = () => {
      while (earlyMessageQueue.length > 0) {
        const item = earlyMessageQueue.shift();
        if (item) {
          try {
            processAndSend(item);
          } catch {}
        }
      }
    };

    upstreamWs.addEventListener('open', () => {
      if (isSessionReady()) {
        flushEarlyQueue();
      }
    });

    serverWs.addEventListener('message', (event) => {
      try {
        if (upstreamWs.readyState !== WebSocket.OPEN || !isSessionReady()) {
          if (earlyMessageQueue.length < MAX_EARLY_QUEUE_SIZE) {
            earlyMessageQueue.push(event.data);
          }
          return;
        }
        processAndSend(event.data);
      } catch {}
    });

    return { flushEarlyQueue };
  }
}
