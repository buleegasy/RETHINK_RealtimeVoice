export function transformClientEvent(
  eventData: any,
  isDirectLive: boolean,
): { transformed: any; shouldDrop: boolean } {
  if (!isDirectLive || !eventData || typeof eventData !== 'object') {
    return { transformed: eventData, shouldDrop: false };
  }

  if (eventData.type === 'input_audio_buffer.append' && eventData.audio) {
    return {
      transformed: {
        type: 'session.input_audio.append',
        audio: eventData.audio,
      },
      shouldDrop: false,
    };
  }

  // 过滤非直连模式特有的缓冲区操作与客户端开场白控制帧，避免上游网关报错 invalid_value
  if (
    eventData.type === 'input_audio_buffer.commit' ||
    eventData.type === 'input_audio_buffer.clear' ||
    eventData.type === 'conversation.item.create' ||
    eventData.type === 'conversation.item.truncate' ||
    eventData.type === 'conversation.item.delete' ||
    eventData.type === 'response.cancel' ||
    eventData.type === 'response.create' ||
    eventData.type === 'session.update'
  ) {
    return { transformed: null, shouldDrop: true };
  }

  return { transformed: eventData, shouldDrop: false };
}

export function transformUpstreamEvent(
  payload: any,
  isDirectLive: boolean,
): { transformed: any; secondaryEvent?: any } {
  if (!payload || typeof payload !== 'object') {
    return { transformed: payload };
  }

  const result = { ...payload };

  if (result.session && typeof result.session === 'object' && result.session.model) {
    result.session.model = 'minimax-realtime';
  }
  if (result.model && typeof result.model === 'string' && result.model !== 'minimax-realtime') {
    result.model = 'minimax-realtime';
  }

  if (!isDirectLive) {
    return { transformed: result };
  }

  if (result.type === 'session.output_audio.delta' && (result.delta || result.audio)) {
    return {
      transformed: {
        type: 'response.audio.delta',
        delta: result.delta || result.audio,
        item_id: result.item_id || result.item?.id,
      },
    };
  }

  if (result.type === 'session.started') {
    return {
      transformed: {
        type: 'session.created',
        session: {
          id: result.session?.id || 'live_sess',
          model: 'minimax-realtime',
          status: result.session?.status || 'active',
        },
      },
    };
  }

  if (result.type === 'session.output_transcript.completed') {
    return {
      transformed: {
        type: 'response.audio_transcript.done',
        transcript: result.transcript || result.text || '',
      },
    };
  }

  if (result.type === 'session.output_transcript.delta') {
    return {
      transformed: {
        type: 'response.audio_transcript.delta',
        delta: result.delta || result.transcript || result.text || '',
      },
    };
  }

  if (result.type === 'session.output_audio.done') {
    return {
      transformed: {
        type: 'response.done',
      },
    };
  }

  if (result.type === 'session.input_transcript.completed') {
    return {
      transformed: {
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: result.transcript || result.text || '',
      },
    };
  }

  if (result.type === 'session.input_transcript.delta') {
    const text = result.delta || result.transcript || result.text || '';
    return {
      transformed: {
        type: 'conversation.item.input_audio_transcription.delta',
        delta: text,
        transcript: text,
      },
    };
  }

  if (result.type === 'session.input_audio.speech_started') {
    return {
      transformed: {
        type: 'input_audio_buffer.speech_started',
      },
    };
  }

  if (result.type === 'session.input_audio.speech_stopped') {
    return {
      transformed: {
        type: 'input_audio_buffer.speech_stopped',
      },
    };
  }

  return { transformed: result };
}
