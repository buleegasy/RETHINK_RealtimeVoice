/**
 * 双二阶 Butterworth 低通抗混叠滤波器 (Anti-Aliasing Filter)
 * 在降采样前滤除高于 Nyquist 频率的音频成分，避免高频折叠混叠失真
 */
export function applyLowPassFilter(
  input: Float32Array,
  sampleRate: number,
  cutoff: number = 10800,
): Float32Array {
  if (cutoff >= sampleRate / 2) return input;

  const nyquist = sampleRate / 2;
  const safeCutoff = Math.min(cutoff, nyquist * 0.95);
  const w0 = (2 * Math.PI * safeCutoff) / sampleRate;
  const q = 0.7071; // Butterworth 特征 Q 值
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);

  const b0 = (1 - cosW0) / 2;
  const b1 = 1 - cosW0;
  const b2 = (1 - cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  const output = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}

export function resampleAndEncodePCM(
  inputBuffer: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number = 24000,
): string {
  let pcmData: Int16Array;

  if (sourceSampleRate === targetSampleRate) {
    pcmData = floatToInt16(inputBuffer);
  } else {
    // 降采样时进行抗混叠低通滤波 (截止频率取目标 Nyquist 的 90%)
    const workingBuffer =
      sourceSampleRate > targetSampleRate
        ? applyLowPassFilter(inputBuffer, sourceSampleRate, (targetSampleRate / 2) * 0.9)
        : inputBuffer;

    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.round(inputBuffer.length / ratio);
    pcmData = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originalPos = i * ratio;
      const index = Math.floor(originalPos);
      const decimal = originalPos - index;

      const val1 = workingBuffer[index] ?? 0;
      const val2 = workingBuffer[index + 1] !== undefined ? workingBuffer[index + 1] : val1;
      const interpolated = val1 + (val2 - val1) * decimal;

      const clamped = Math.max(-1, Math.min(1, interpolated));
      pcmData[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
  }

  return int16ToBase64(pcmData);
}

export function floatToInt16(input: Float32Array): Int16Array {
  const result = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    result[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return result;
}

export function int16ToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
  let binary = '';
  const chunkSize = 8192;
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64PCMToAudioBuffer(
  base64Data: string,
  audioCtx: AudioContext,
  sampleRate: number = 24000,
): AudioBuffer {
  if (!base64Data || typeof base64Data !== 'string' || base64Data.trim().length === 0) {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  let binaryString: string;
  try {
    binaryString = atob(base64Data);
  } catch {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  const evenLen = binaryString.length - (binaryString.length % 2);
  if (evenLen < 2) {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  const bytes = new Uint8Array(evenLen);
  for (let i = 0; i < evenLen; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, evenLen / 2);
  if (int16Array.length === 0) {
    return audioCtx.createBuffer(1, 1, sampleRate);
  }

  const audioBuffer = audioCtx.createBuffer(1, int16Array.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < int16Array.length; i++) {
    channelData[i] = int16Array[i] / 32768.0;
  }

  return audioBuffer;
}
