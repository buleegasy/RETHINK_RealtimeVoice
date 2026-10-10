export interface OutputGraphNodes {
  outputGainNode: GainNode;
  compressorNode: DynamicsCompressorNode;
  speakerAnalyserNode: AnalyserNode;
  speakerSilentSinkNode: GainNode;
}

export function buildOutputGraph(ctx: AudioContext): OutputGraphNodes {
  const outputGainNode = ctx.createGain();
  outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);

  const compressorNode = ctx.createDynamicsCompressor();
  compressorNode.threshold.setValueAtTime(-18, ctx.currentTime);
  compressorNode.knee.setValueAtTime(12, ctx.currentTime);
  compressorNode.ratio.setValueAtTime(3, ctx.currentTime);
  compressorNode.attack.setValueAtTime(0.003, ctx.currentTime);
  compressorNode.release.setValueAtTime(0.1, ctx.currentTime);

  const speakerAnalyserNode = ctx.createAnalyser();
  speakerAnalyserNode.fftSize = 256;
  speakerAnalyserNode.smoothingTimeConstant = 0.3;

  outputGainNode.connect(compressorNode);
  compressorNode.connect(ctx.destination);
  compressorNode.connect(speakerAnalyserNode);

  // 旁路静音汇流节点：保持增益为 0 并接入 destination，使浏览器底层持续调度计算 speakerAnalyserNode，但严禁从 WebAudio destination 二次出声
  const speakerSilentSinkNode = ctx.createGain();
  speakerSilentSinkNode.gain.setValueAtTime(0, ctx.currentTime);
  speakerAnalyserNode.connect(speakerSilentSinkNode);
  speakerSilentSinkNode.connect(ctx.destination);

  return {
    outputGainNode,
    compressorNode,
    speakerAnalyserNode,
    speakerSilentSinkNode,
  };
}

export function teardownOutputGraph(nodes: {
  outputGainNode: GainNode | null;
  compressorNode: DynamicsCompressorNode | null;
  speakerAnalyserNode: AnalyserNode | null;
  speakerSilentSinkNode: GainNode | null;
  remoteMediaStreamSource: MediaStreamAudioSourceNode | null;
  audioElement: HTMLAudioElement | null;
  audioCtx: AudioContext | null;
}): void {
  if (nodes.remoteMediaStreamSource) {
    try {
      nodes.remoteMediaStreamSource.disconnect();
    } catch {}
  }
  if (nodes.audioElement) {
    try {
      nodes.audioElement.pause();
      nodes.audioElement.srcObject = null;
    } catch {}
  }
  if (nodes.speakerAnalyserNode) {
    try {
      nodes.speakerAnalyserNode.disconnect();
    } catch {}
  }
  if (nodes.speakerSilentSinkNode) {
    try {
      nodes.speakerSilentSinkNode.disconnect();
    } catch {}
  }
  if (nodes.compressorNode) {
    try {
      nodes.compressorNode.disconnect();
    } catch {}
  }
  if (nodes.outputGainNode) {
    try {
      nodes.outputGainNode.disconnect();
    } catch {}
  }
  if (nodes.audioCtx) {
    nodes.audioCtx.close().catch(() => {});
  }
}

export function createAudioContext(): AudioContext {
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  try {
    return new AudioCtxClass({ sampleRate: 24000, latencyHint: 'interactive' });
  } catch {
    return new AudioCtxClass();
  }
}

export function ensureOutputNodes(
  ctx: AudioContext,
  current: {
    outputGainNode: GainNode | null;
    compressorNode: DynamicsCompressorNode | null;
    speakerAnalyserNode: AnalyserNode | null;
    speakerSilentSinkNode: GainNode | null;
  },
): OutputGraphNodes {
  if (
    current.outputGainNode &&
    current.compressorNode &&
    current.speakerAnalyserNode &&
    current.speakerSilentSinkNode
  ) {
    return current as OutputGraphNodes;
  }
  return buildOutputGraph(ctx);
}

export function resetOutputNodes(target: {
  outputGainNode: GainNode | null;
  compressorNode: DynamicsCompressorNode | null;
  speakerAnalyserNode: AnalyserNode | null;
  speakerSilentSinkNode: GainNode | null;
  remoteMediaStreamSource: MediaStreamAudioSourceNode | null;
  audioElement: HTMLAudioElement | null;
  audioCtx: AudioContext | null;
}): void {
  teardownOutputGraph(target);
  target.remoteMediaStreamSource = null;
  target.audioElement = null;
  target.speakerAnalyserNode = null;
  target.speakerSilentSinkNode = null;
  target.compressorNode = null;
  target.outputGainNode = null;
  target.audioCtx = null;
}
