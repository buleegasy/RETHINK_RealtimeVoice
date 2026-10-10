export function applyImmediateStop(
  sources: AudioBufferSourceNode[],
  ctx: AudioContext,
  outputGainNode: GainNode,
): void {
  try {
    outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
    outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
  } catch {}
  for (const s of sources) {
    try {
      s.stop();
      s.disconnect();
    } catch {}
  }
}

export function scheduleFadeOutStop(
  sources: AudioBufferSourceNode[],
  ctx: AudioContext,
  outputGainNode: GainNode,
  fadeDurationMs: number,
): void {
  const fadeEndTime = ctx.currentTime + fadeDurationMs / 1000;
  try {
    outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
    outputGainNode.gain.setValueAtTime(Math.max(0.001, outputGainNode.gain.value), ctx.currentTime);
    outputGainNode.gain.exponentialRampToValueAtTime(0.0001, fadeEndTime);
  } catch {}

  for (const s of sources) {
    try {
      s.stop(fadeEndTime);
    } catch {
      try {
        s.stop();
      } catch {}
    }
  }
}
