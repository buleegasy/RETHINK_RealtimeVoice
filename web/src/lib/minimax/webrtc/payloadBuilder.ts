import { DEFAULT_VOICE, CBT_VOICE_TOOLS, DEFAULT_VOICE_INSTRUCTIONS } from '../constants';
import type { MiniMaxSessionConfig } from '../types';
import type { MiniMaxWebRtcOptions } from '../webrtcClient';

export function buildTurnDetectionPayload(mode: 'speaking' | 'listening'): Record<string, unknown> {
  const vadConfig =
    mode === 'speaking'
      ? {
          type: 'server_vad',
          threshold: 0.85,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
          create_response: false,
          interrupt_response: false,
        }
      : {
          type: 'server_vad',
          threshold: 0.65,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
          create_response: false,
          interrupt_response: false,
        };

  return {
    type: 'session.update',
    session: {
      turn_detection: vadConfig,
      audio: {
        input: { turn_detection: vadConfig },
      },
    },
  };
}

export function buildWebRtcSessionUpdate(
  options: MiniMaxWebRtcOptions,
  customConfig?: Partial<MiniMaxSessionConfig>,
): Record<string, unknown> {
  const config = { ...options.sessionConfig, ...customConfig };
  return {
    type: 'session.update',
    session: {
      modalities: config.modalities || ['audio', 'text'],
      instructions: config.instructions || DEFAULT_VOICE_INSTRUCTIONS,
      voice: config.voice || DEFAULT_VOICE,
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.65,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            create_response: false,
            interrupt_response: false,
          },
        },
        output: {
          format: { type: 'audio/pcm', rate: 24000 },
          voice: config.voice || DEFAULT_VOICE,
        },
      },
      tools: config.tools || CBT_VOICE_TOOLS,
      tool_choice: 'auto',
    },
  };
}
