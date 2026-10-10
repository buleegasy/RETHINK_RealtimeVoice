import type { MiniMaxClientCallbacks, MiniMaxServerEvent } from '../types';

export interface DispatcherContext {
  currentResponseItemId: string | null;
  currentToolCallItemId: string | null;
  playbackEpoch: number;
  canceledResponseItemIds: Set<string>;
  speechStopTime: number;
}

export class ServerEventDispatcher {
  public dispatch(
    rawData: string | ArrayBuffer,
    ctx: DispatcherContext,
    callbacks: MiniMaxClientCallbacks,
    onPongReceived?: () => void,
  ): void {
    if (typeof rawData !== 'string') return;

    onPongReceived?.();

    try {
      const event = JSON.parse(rawData) as MiniMaxServerEvent;
      const type = event.type;

      this.trackResponseItemId(event, type, ctx);
      this.handleAudioDelta(event, type, ctx, callbacks);
      this.handleTextDelta(event, type, ctx, callbacks);
      this.handleTranscription(event, type, callbacks);
      this.handleSpeechEvents(event, type, ctx, callbacks);
      this.handleTurnLifecycle(type, ctx, callbacks);
      this.handleToolCalls(event, type, ctx, callbacks);
      this.handleTelemetryAndCrisis(event, type, callbacks);
      this.handlePongAndError(event, type, callbacks);
    } catch (err) {
      console.warn('[MiniMaxClient] 解析下行帧失败:', err);
    }
  }

  private trackResponseItemId(
    event: MiniMaxServerEvent,
    type: string,
    ctx: DispatcherContext,
  ): void {
    if (
      type === 'response.output_item.added' ||
      type === 'response.output_audio.delta' ||
      type === 'response.audio.delta' ||
      type === 'response.audio_transcript.delta' ||
      type === 'response.output_audio_transcript.delta'
    ) {
      if (event.item_id) {
        ctx.currentResponseItemId = event.item_id;
      } else if (event.item?.id) {
        ctx.currentResponseItemId = event.item.id;
      }
    }
  }

  private handleAudioDelta(
    event: MiniMaxServerEvent,
    type: string,
    ctx: DispatcherContext,
    callbacks: MiniMaxClientCallbacks,
  ): void {
    if (type !== 'response.output_audio.delta' && type !== 'response.audio.delta') return;

    const itemId = event.item_id || event.item?.id || ctx.currentResponseItemId;
    if (itemId && ctx.canceledResponseItemIds.has(itemId)) {
      // 物理丢弃在途到达的幽灵音频分片，杜绝打断后多说半句
      return;
    }
    if (ctx.speechStopTime > 0) {
      const ttft = Date.now() - ctx.speechStopTime;
      ctx.speechStopTime = 0;
      callbacks.onTTFT?.(ttft);
    }
    const audio = event.delta || event.audio;
    if (audio) {
      callbacks.onAudioDelta?.(audio);
    }
  }

  private handleTextDelta(
    event: MiniMaxServerEvent,
    type: string,
    ctx: DispatcherContext,
    callbacks: MiniMaxClientCallbacks,
  ): void {
    if (
      type !== 'response.output_text.delta' &&
      type !== 'response.text.delta' &&
      type !== 'response.output_audio_transcript.delta' &&
      type !== 'response.audio_transcript.delta'
    ) {
      return;
    }

    const itemId = event.item_id || event.item?.id || ctx.currentResponseItemId;
    if (itemId && ctx.canceledResponseItemIds.has(itemId)) {
      return;
    }
    const text = event.delta || event.text || event.transcript || (event as any).transcript;
    if (text) {
      callbacks.onTextDelta?.(text);
    }
  }

  private handleTranscription(
    event: MiniMaxServerEvent,
    type: string,
    callbacks: MiniMaxClientCallbacks,
  ): void {
    if (
      type === 'conversation.item.input_audio_transcription.completed' ||
      type === 'input_audio_transcription.completed'
    ) {
      const transcript = event.transcript || (event as any).transcript || (event as any).text;
      if (transcript) {
        callbacks.onTranscriptCompleted?.(transcript);
        callbacks.onTranscriptDelta?.(transcript);
      }
    } else if (
      type === 'conversation.item.input_audio_transcription.delta' ||
      type === 'input_audio_transcription.delta'
    ) {
      const transcript =
        event.transcript ||
        (event as any).delta ||
        (event as any).transcript ||
        (event as any).text;
      if (transcript) {
        callbacks.onTranscriptDelta?.(transcript);
      }
    } else if (type === 'conversation.item.created' && (event as any).item?.role === 'user') {
      const contents = Array.isArray((event as any).item?.content)
        ? (event as any).item.content
        : [];
      for (const c of contents) {
        const t = c.transcript || c.text;
        if (t) {
          callbacks.onTranscriptDelta?.(t);
        }
      }
    }
  }

  private handleSpeechEvents(
    event: MiniMaxServerEvent,
    type: string,
    ctx: DispatcherContext,
    callbacks: MiniMaxClientCallbacks,
  ): void {
    if (type === 'input_audio_buffer.speech_started') {
      const targetItemId = event.item_id || ctx.currentResponseItemId;
      callbacks.onSpeechStarted?.({
        audioStartMs: event.audio_start_ms,
        itemId: targetItemId || undefined,
      });
    }

    if (type === 'input_audio_buffer.speech_stopped') {
      ctx.speechStopTime = Date.now();
      callbacks.onSpeechStopped?.();
    }
  }

  private handleTurnLifecycle(
    type: string,
    ctx: DispatcherContext,
    callbacks: MiniMaxClientCallbacks,
  ): void {
    if (type === 'response.created') {
      ctx.playbackEpoch++;
      callbacks.onTurnStart?.();
    }

    if (type === 'response.done') {
      callbacks.onTurnEnd?.();
      ctx.currentResponseItemId = null;
    }
  }

  private handleToolCalls(
    event: MiniMaxServerEvent,
    type: string,
    ctx: DispatcherContext,
    callbacks: MiniMaxClientCallbacks,
  ): void {
    if (
      type === 'response.function_call_arguments.done' ||
      (event.item?.type === 'function_call' && event.item?.content)
    ) {
      const name = event.name || (event.item as any)?.name;
      const callId = event.call_id || (event.item as any)?.call_id;
      const argsStr = event.arguments || (event.item as any)?.arguments || '{}';

      if (name && callId) {
        let parsedArgs = {};
        try {
          parsedArgs = JSON.parse(argsStr);
        } catch {
          parsedArgs = { raw: argsStr };
        }
        callbacks.onToolCall?.({ name, callId, args: parsedArgs });
      }
    }

    if (
      type === 'response.function_call_arguments.delta' ||
      (type === 'response.output_item.added' &&
        (event.item?.type === 'function_call' || event.item?.type === 'function_call_output'))
    ) {
      const itemId = event.item_id || event.item?.id;
      if (itemId) {
        ctx.currentToolCallItemId = itemId;
      }
    }

    if (type === 'response.function_call_arguments.done') {
      ctx.currentToolCallItemId = null;
    }
  }

  private handleTelemetryAndCrisis(
    event: MiniMaxServerEvent,
    type: string,
    callbacks: MiniMaxClientCallbacks,
  ): void {
    if (type === 'conversation.item.truncated') {
      callbacks.onItemTruncated?.({
        itemId: typeof event.item_id === 'string' ? event.item_id : undefined,
        audioEndMs: typeof event.audio_end_ms === 'number' ? event.audio_end_ms : undefined,
      });
    }

    if (type === 'rethink.crisis_intercepted') {
      const msg =
        typeof (event as any).message === 'string'
          ? (event as any).message
          : '检测到安全危机，已启动紧急干预';
      const tier = typeof (event as any).tier === 'string' ? (event as any).tier : undefined;
      callbacks.onCrisisInterception?.({ message: msg, tier });
    }

    if (type === 'rethink.telemetry.shadow_directive') {
      callbacks.onShadowDirective?.({
        turnSequence: Number((event as any).turnSequence || 0),
        userText: String((event as any).userText || ''),
        cognitiveHint:
          typeof (event as any).cognitiveHint === 'string' ? (event as any).cognitiveHint : null,
        durationMs: Number((event as any).durationMs || 0),
        fallback: Boolean((event as any).fallback),
        timestamp: Number((event as any).timestamp || Date.now()),
      });
    }

    if (type === 'rethink.telemetry.safety_check') {
      callbacks.onSafetyCheck?.({
        turnSequence: Number((event as any).turnSequence || 0),
        isCrisis: Boolean((event as any).isCrisis),
        durationMs: Number((event as any).durationMs || 0),
        timestamp: Number((event as any).timestamp || Date.now()),
      });
    }
  }

  private handlePongAndError(
    event: MiniMaxServerEvent,
    type: string,
    callbacks: MiniMaxClientCallbacks,
  ): void {
    if (type === 'server.pong') {
      const sentTime = Number((event as any).clientTimestamp || 0);
      if (sentTime > 0) {
        const rtt = Math.max(1, Date.now() - sentTime);
        callbacks.onPingPong?.(rtt);
      }
      return;
    }

    if (type === 'error') {
      const errCode = event.error?.code;
      if (errCode === 'response_cancel_not_allowed') {
        return;
      }
      console.error('[MiniMaxClient] 收到服务端错误:', event.error);
      callbacks.onError?.(event.error);
    }
  }
}
