import type { PlaybackQueue } from './playbackQueue';

export async function playDecodedAudioUrl(
  ctx: AudioContext,
  url: string,
  outputGain: GainNode,
  analyserNode: AnalyserNode | null,
  playbackQueue: PlaybackQueue,
  onEnded?: () => void,
): Promise<void> {
  try {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    playbackQueue.playDecodedBuffer(ctx, audioBuffer, outputGain, analyserNode, onEnded);
  } catch {
    onEnded?.();
  }
}

export async function playDecodedBase64Audio(
  ctx: AudioContext,
  base64Data: string,
  outputGain: GainNode,
  analyserNode: AnalyserNode | null,
  playbackQueue: PlaybackQueue,
  onEnded?: () => void,
): Promise<void> {
  if (!base64Data) {
    onEnded?.();
    return;
  }
  try {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
    playbackQueue.playDecodedBuffer(ctx, audioBuffer, outputGain, analyserNode, onEnded);
  } catch {
    onEnded?.();
  }
}
