export interface MiniMaxSessionConfig {
  modalities?: ('text' | 'audio')[];
  instructions?: string;
  voice?: string;
  speed?: number;
  inputAudioFormat?: 'pcm16';
  outputAudioFormat?: 'pcm16';
  turnDetection?: {
    type: 'server_vad';
    threshold?: number;
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
  } | null;
  tools?: Record<string, unknown>[];
}

export interface MiniMaxServerEvent {
  type: string;
  event_id?: string;
  delta?: string;
  text?: string;
  audio?: string;
  transcript?: string;
  item_id?: string;
  audio_start_ms?: number;
  item?: {
    id?: string;
    type?: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
      transcript?: string;
    }>;
  };
  response?: {
    id?: string;
    status?: string;
    output?: Array<Record<string, unknown>>;
  };
  name?: string;
  call_id?: string;
  arguments?: string;
  error?: {
    message: string;
    code?: string;
  };
  [key: string]: unknown;
}

export interface MiniMaxClientCallbacks {
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (err: unknown) => void;
  onAudioDelta?: (pcm16Base64: string) => void;
  onTextDelta?: (text: string) => void;
  onTranscriptDelta?: (transcript: string) => void;
  onTurnStart?: () => void;
  onTurnEnd?: () => void;
  onSpeechStarted?: (details?: { audioStartMs?: number; itemId?: string }) => void;
  onSpeechStopped?: () => void;
  onItemTruncated?: (details: { itemId?: string; audioEndMs?: number }) => void;
  onToolCall?: (toolCall: { name: string; callId: string; args: Record<string, unknown> }) => void;
  onCrisisInterception?: (details: { message: string; tier?: string }) => void;
  onShadowDirective?: (data: {
    turnSequence: number;
    userText: string;
    cognitiveHint: string | null;
    durationMs: number;
    fallback: boolean;
    timestamp: number;
  }) => void;
  onSafetyCheck?: (data: {
    turnSequence: number;
    isCrisis: boolean;
    durationMs: number;
    timestamp: number;
  }) => void;
  onPingPong?: (rttMs: number) => void;
  onTTFT?: (ttftMs: number) => void;
  onReconnecting?: (attempt: number, maxAttempts: number, delayMs: number) => void;
  onReconnected?: () => void;
  onMaxReconnectFailed?: () => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onTransportChange?: (transport: 'webrtc' | 'websocket') => void;
}
