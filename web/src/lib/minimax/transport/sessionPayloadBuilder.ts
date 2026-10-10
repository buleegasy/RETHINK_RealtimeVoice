import {
  AUDIO_SAMPLE_RATE,
  DEFAULT_VOICE,
  CBT_VOICE_TOOLS,
  DEFAULT_VOICE_INSTRUCTIONS,
  OPENING_GREETING,
} from '../constants';
import type { MiniMaxSessionConfig } from '../types';

export function validateWebSocketUrl(rawUrl: string): string {
  const parsed = new URL(
    rawUrl,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  );
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`[MiniMaxClient] 非法 WebSocket 协议: ${parsed.protocol}`);
  }
  return parsed.toString();
}

export function buildSessionPayload(
  baseConfig?: MiniMaxSessionConfig,
  customConfig?: MiniMaxSessionConfig,
): Record<string, unknown> {
  const config = { ...baseConfig, ...customConfig };
  const vadConfig =
    config.turnDetection !== undefined
      ? config.turnDetection
      : {
          type: 'server_vad',
          threshold: 0.65,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
          create_response: true,
        };

  return {
    type: 'realtime',
    modalities: ['text', 'audio'],
    instructions: config.instructions || DEFAULT_VOICE_INSTRUCTIONS,
    voice: config.voice || DEFAULT_VOICE,
    input_audio_format: 'pcm16',
    output_audio_format: 'pcm16',
    input_audio_transcription: { model: atob('d2hpc3Blci0x') },
    turn_detection: vadConfig,
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: AUDIO_SAMPLE_RATE },
        transcription: { model: atob('d2hpc3Blci0x') },
        turn_detection: vadConfig,
      },
      output: {
        format: { type: 'audio/pcm', rate: AUDIO_SAMPLE_RATE },
        voice: config.voice || DEFAULT_VOICE,
      },
    },
    tools: config.tools || CBT_VOICE_TOOLS,
  };
}

export function buildGreetingEvents(customGreeting?: string): Record<string, unknown>[] {
  const greeting = customGreeting || OPENING_GREETING;
  return [
    {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '（通话已建立，请立刻向来访者致以简短开场问候）',
          },
        ],
      },
    },
    {
      type: 'response.create',
      response: {
        modalities: ['audio', 'text'],
        instructions: `你必须严格只字面说：“${greeting}”，绝对禁止添加任何多余的开场白、问候语或解释！`,
      },
    },
  ];
}

export function buildTurnDetectionPayload(mode: 'speaking' | 'listening'): Record<string, unknown> {
  const vadConfig =
    mode === 'speaking'
      ? {
          type: 'server_vad',
          threshold: 0.85,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          create_response: true,
        }
      : {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
          create_response: true,
        };

  return {
    turn_detection: vadConfig,
    audio: {
      input: {
        turn_detection: vadConfig,
      },
    },
  };
}
