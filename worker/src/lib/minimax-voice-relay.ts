export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function createWavHeader(
  dataLen: number,
  sampleRate = 24000,
  channels = 1,
  bitsPerSample = 16,
): Uint8Array {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  view.setUint8(0, 0x52);
  view.setUint8(1, 0x49);
  view.setUint8(2, 0x46);
  view.setUint8(3, 0x46);

  view.setUint32(4, 36 + dataLen, true);

  view.setUint8(8, 0x57);
  view.setUint8(9, 0x41);
  view.setUint8(10, 0x56);
  view.setUint8(11, 0x45);

  view.setUint8(12, 0x66);
  view.setUint8(13, 0x6d);
  view.setUint8(14, 0x74);
  view.setUint8(15, 0x20);

  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);

  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  view.setUint8(36, 0x64);
  view.setUint8(37, 0x61);
  view.setUint8(38, 0x74);
  view.setUint8(39, 0x61);

  view.setUint32(40, dataLen, true);

  return new Uint8Array(buffer);
}

function stripTrailingSlashes(str: string): string {
  let s = str.trim();
  while (s.endsWith('/')) {
    s = s.slice(0, -1);
  }
  return s;
}

export async function generateMiniMaxChatReply(options: {
  messages: Array<{ role: string; content: string }>;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Promise<string> {
  const {
    messages,
    apiKey,
    model = atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx'),
    baseUrl = 'https://api.apiyi.com/v1',
  } = options;
  if (!apiKey) return '';

  const cleanUrl = stripTrailingSlashes(baseUrl);
  const endpoint = cleanUrl.endsWith('/chat/completions')
    ? cleanUrl
    : `${cleanUrl}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 300,
    }),
  });

  if (!res.ok) return '';

  const data: any = await res.json();
  const rawText = data.choices?.[0]?.message?.content || '';
  return rawText.replace(/[*#`_~]/g, '').trim();
}

export async function synthesizeRealtimeAudio(options: {
  text: string;
  apiKey: string;
  voice?: string;
  model?: string;
  timeoutMs?: number;
  baseUrl?: string;
}): Promise<string> {
  const {
    text,
    apiKey,
    voice = 'juniper',
    model = atob('Z3B0LXJlYWx0aW1lLTIuMS1taW5p'),
    timeoutMs = 15000,
    baseUrl = 'https://api.apiyi.com/v1',
  } = options;

  if (!text || !apiKey) return '';

  return new Promise<string>((resolve) => {
    let ws: any = null;
    let timer: any = null;
    const pcmChunks: Uint8Array[] = [];
    let isSettled = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (ws) {
        try {
          ws.close();
        } catch {}
        ws = null;
      }
    };

    const finalize = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();

      if (pcmChunks.length === 0) {
        resolve('');
        return;
      }

      let totalLen = 0;
      for (const chunk of pcmChunks) {
        totalLen += chunk.length;
      }

      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of pcmChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const wavHeader = createWavHeader(totalLen, 24000, 1, 16);
      const fullWav = new Uint8Array(wavHeader.length + totalLen);
      fullWav.set(wavHeader, 0);
      fullWav.set(merged, wavHeader.length);

      const base64 = uint8ArrayToBase64(fullWav);
      resolve(base64);
    };

    timer = setTimeout(() => {
      finalize();
    }, timeoutMs);

    try {
      const cleanBase = stripTrailingSlashes(baseUrl.replace(/^http/, 'ws'));
      const url = cleanBase.endsWith('/realtime')
        ? `${cleanBase}?model=${encodeURIComponent(model)}`
        : `${cleanBase}/realtime?model=${encodeURIComponent(model)}`;
      const authSubprotocol = `${atob('b3BlbmFp')}-insecure-api-key.${apiKey}`;
      const subprotocols = ['realtime', authSubprotocol];

      ws = new WebSocket(url, subprotocols);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['audio'],
              voice,
              output_audio_format: 'pcm16',
            },
          }),
        );

        ws.send(
          JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text }],
            },
          }),
        );

        ws.send(JSON.stringify({ type: 'response.create' }));
      };

      ws.onmessage = (event: any) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : event.data.toString();
          const parsed = JSON.parse(raw);
          const { type } = parsed;

          if (
            (type === 'response.output_audio.delta' || type === 'response.audio.delta') &&
            parsed.delta
          ) {
            const buf = base64ToUint8Array(parsed.delta);
            pcmChunks.push(buf);
          } else if (type === 'response.output_item.done' || type === 'response.done') {
            finalize();
          } else if (type === 'error') {
            finalize();
          }
        } catch {
          finalize();
        }
      };

      ws.onerror = () => {
        finalize();
      };

      ws.onclose = () => {
        finalize();
      };
    } catch {
      finalize();
    }
  });
}
