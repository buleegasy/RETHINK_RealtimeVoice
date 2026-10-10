import type { MiniMaxClientCallbacks } from '../types';
import { MiniMaxWebRtcClient } from '../webrtcClient';
import type { MiniMaxClientOptions } from '../client';

export interface WebRtcInitResult {
  client: MiniMaxWebRtcClient | null;
  success: boolean;
}

export async function tryInitWebRtc(
  options: MiniMaxClientOptions,
  callbacks: MiniMaxClientCallbacks,
  onTransportChange: (type: 'webrtc') => void,
  localStream?: MediaStream,
): Promise<WebRtcInitResult> {
  try {
    const rtc = new MiniMaxWebRtcClient({
      sessionId: options.sessionId,
      userId: options.userId,
      username: options.username,
      token: options.token,
      voice: options.sessionConfig?.voice,
      sessionConfig: options.sessionConfig,
      offerEndpoint: options.offerEndpoint,
      iceServers: options.iceServers,
      sendGreetingOnConnect: options.sendGreetingOnConnect,
      callbacks: {
        ...callbacks,
        onOpen: () => {
          onTransportChange('webrtc');
          callbacks.onOpen?.();
        },
        onClose: (code, reason) => {
          callbacks.onClose?.(code, reason);
        },
      },
    });

    const success = await rtc.connect(localStream);
    if (success) {
      onTransportChange('webrtc');
      return { client: rtc, success: true };
    }
    return { client: null, success: false };
  } catch (err: any) {
    console.warn('[MiniMaxClient] WebRTC 初始化异常:', err);
    const errMsg = err?.message || 'WebRTC 握手建连失败';
    callbacks.onError?.(new Error(`WebRTC 链路异常: ${errMsg}`));
    return { client: null, success: false };
  }
}
