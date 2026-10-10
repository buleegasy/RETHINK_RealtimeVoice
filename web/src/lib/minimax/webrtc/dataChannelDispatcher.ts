import type { MiniMaxServerEvent, MiniMaxClientCallbacks } from '../types';

export function dispatchDataChannelEvent(
  event: MiniMaxServerEvent,
  callbacks: MiniMaxClientCallbacks,
  state: {
    pingStartTime: number;
    onResponseCreated: (id: string | null) => void;
  },
): void {
  const { type } = event;

  if (
    (type === 'response.audio_transcript.delta' || type === 'session.output_transcript.delta') &&
    event.delta
  ) {
    callbacks.onTextDelta?.(event.delta);
  } else if (
    (type === 'conversation.item.input_audio_transcription.completed' ||
      type === 'input_audio_transcription.completed' ||
      type === 'session.input_transcript.completed') &&
    (event.transcript || (event as any).text)
  ) {
    const text = event.transcript || (event as any).text || '';
    if (text) {
      callbacks.onTranscriptCompleted?.(text);
      callbacks.onTranscriptDelta?.(text);
    }
  } else if (
    (type === 'conversation.item.input_audio_transcription.delta' ||
      type === 'input_audio_transcription.delta' ||
      type === 'session.input_transcript.delta') &&
    (event.transcript || (event as any).delta || (event as any).text)
  ) {
    const text = (event as any).delta || event.transcript || (event as any).text || '';
    if (text) {
      callbacks.onTranscriptDelta?.(text);
    }
  } else if (type === 'session.commentary.appended') {
    callbacks.onTurnStart?.();
  } else if (type === 'input_audio_buffer.speech_started') {
    callbacks.onSpeechStarted?.();
  } else if (type === 'input_audio_buffer.speech_stopped') {
    callbacks.onSpeechStopped?.();
  } else if (type === 'response.created') {
    state.onResponseCreated(event.response?.id || null);
    callbacks.onTurnStart?.();
  } else if (type === 'response.done') {
    callbacks.onTurnEnd?.();
  } else if (type === 'response.function_call_arguments.done' && event.name && event.call_id) {
    let args = {};
    try {
      args = JSON.parse(event.arguments || '{}');
    } catch {}
    callbacks.onToolCall?.({
      name: event.name,
      callId: event.call_id,
      args,
    });
  } else if (type === 'safety_check' && (event as any).check) {
    callbacks.onSafetyCheck?.((event as any).check);
  } else if (type === 'shadow_directive' && (event as any).directive) {
    callbacks.onShadowDirective?.((event as any).directive);
  } else if (type === 'crisis_interception') {
    callbacks.onCrisisInterception?.({
      message: (event as any).message || '触发高危心理防御拦截',
      tier: (event as any).tier,
    });
  } else if (type === 'pong') {
    if (state.pingStartTime > 0) {
      const rtt = Date.now() - state.pingStartTime;
      callbacks.onPingPong?.(rtt);
    }
  }
}
