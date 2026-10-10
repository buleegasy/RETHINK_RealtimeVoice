import { AUDIO_WORKLET_PROCESSOR_CODE, WORKLET_PROCESSOR_NAME } from './workletProcessor';
import type { BargeInDetector } from './bargeInDetector';
import type { PlaybackQueue } from './playbackQueue';

export interface InputPipelineNodes {
  sourceNode: MediaStreamAudioSourceNode;
  highpassFilterNode: BiquadFilterNode;
  inputGainNode: GainNode;
  analyserNode: AnalyserNode;
}

export function buildInputPipeline(
  ctx: AudioContext,
  mediaStream: MediaStream,
): InputPipelineNodes {
  const sourceNode = ctx.createMediaStreamSource(mediaStream);

  const highpassFilterNode = ctx.createBiquadFilter();
  highpassFilterNode.type = 'highpass';
  highpassFilterNode.frequency.setValueAtTime(120, ctx.currentTime);
  highpassFilterNode.Q.setValueAtTime(0.7, ctx.currentTime);

  const inputGainNode = ctx.createGain();
  inputGainNode.gain.setValueAtTime(1.15, ctx.currentTime);

  const analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = 256;
  analyserNode.smoothingTimeConstant = 0.5;

  sourceNode.connect(highpassFilterNode);
  highpassFilterNode.connect(inputGainNode);
  inputGainNode.connect(analyserNode);

  return { sourceNode, highpassFilterNode, inputGainNode, analyserNode };
}

export async function reconnectInputStream(
  ctx: AudioContext,
  oldStream: MediaStream | null,
  oldSource: MediaStreamAudioSourceNode | null,
  highpass: BiquadFilterNode | null,
  gain: GainNode | null,
  analyser: AnalyserNode | null,
  constraints: MediaStreamConstraints,
): Promise<{ stream: MediaStream; source: MediaStreamAudioSourceNode } | null> {
  try {
    if (oldStream) oldStream.getTracks().forEach((t) => t.stop());
    if (oldSource) {
      try {
        oldSource.disconnect();
      } catch {}
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const source = ctx.createMediaStreamSource(stream);
    if (highpass) source.connect(highpass);
    else if (gain) source.connect(gain);
    else if (analyser) source.connect(analyser);
    return { stream, source };
  } catch {
    return null;
  }
}

export async function setupAudioProcessor(
  ctx: AudioContext,
  inputGainNode: GainNode,
  handleChunk: (buffer: Float32Array) => void,
): Promise<{ workletNode: AudioWorkletNode | null; processorNode: ScriptProcessorNode | null }> {
  let workletNode: AudioWorkletNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;

  if (
    typeof window !== 'undefined' &&
    ctx.audioWorklet &&
    typeof ctx.audioWorklet.addModule === 'function' &&
    typeof AudioWorkletNode !== 'undefined'
  ) {
    try {
      const blob = new Blob([AUDIO_WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      workletNode = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME);
      workletNode.port.onmessage = (event: MessageEvent) => {
        if (event.data?.eventType === 'audio_chunk' && event.data.buffer) {
          handleChunk(event.data.buffer);
        }
      };

      inputGainNode.connect(workletNode);
      workletNode.connect(ctx.destination);
      return { workletNode, processorNode: null };
    } catch {
      workletNode = null;
    }
  }

  processorNode = ctx.createScriptProcessor(2048, 1, 1);
  processorNode.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    out.fill(0);
    const inputBuffer = e.inputBuffer.getChannelData(0);
    handleChunk(inputBuffer);
  };
  inputGainNode.connect(processorNode);
  processorNode.connect(ctx.destination);

  return { workletNode: null, processorNode };
}

export function teardownInputNodes(nodes: {
  mediaStream: MediaStream | null;
  workletNode: AudioWorkletNode | null;
  processorNode: ScriptProcessorNode | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  highpassFilterNode: BiquadFilterNode | null;
  inputGainNode: GainNode | null;
  analyserNode: AnalyserNode | null;
}): void {
  if (nodes.mediaStream) {
    try {
      nodes.mediaStream.getTracks().forEach((t) => t.stop());
    } catch {}
  }
  if (nodes.workletNode) {
    try {
      nodes.workletNode.port.onmessage = null;
      nodes.workletNode.disconnect();
    } catch {}
  }
  if (nodes.processorNode) {
    try {
      nodes.processorNode.onaudioprocess = null;
      nodes.processorNode.disconnect();
    } catch {}
  }
  if (nodes.sourceNode) {
    try {
      nodes.sourceNode.disconnect();
    } catch {}
  }
  if (nodes.highpassFilterNode) {
    try {
      nodes.highpassFilterNode.disconnect();
    } catch {}
  }
  if (nodes.inputGainNode) {
    try {
      nodes.inputGainNode.disconnect();
    } catch {}
  }
  if (nodes.analyserNode) {
    try {
      nodes.analyserNode.disconnect();
    } catch {}
  }
}

export function resetInputNodes(target: {
  mediaStream: MediaStream | null;
  workletNode: AudioWorkletNode | null;
  processorNode: ScriptProcessorNode | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  highpassFilterNode: BiquadFilterNode | null;
  inputGainNode: GainNode | null;
  analyserNode: AnalyserNode | null;
}): void {
  teardownInputNodes(target);
  target.mediaStream = null;
  target.workletNode = null;
  target.processorNode = null;
  target.sourceNode = null;
  target.highpassFilterNode = null;
  target.inputGainNode = null;
  target.analyserNode = null;
}

export function setMediaStreamTracksEnabled(stream: MediaStream | null, enabled: boolean): void {
  if (stream) {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }
}

export interface DispatchInputChunkParams {
  inputBuffer: Float32Array;
  ctx: AudioContext;
  bargeInDetector: BargeInDetector;
  speakerAnalyserNode: AnalyserNode | null;
  playbackQueue: PlaybackQueue;
  isMuted: boolean;
  onAudioChunk: (pcm16Base64: string) => void;
  onLocalInterrupt?: (triggerPlayedMs: number) => void;
  stopPlayback: (fadeMs: number) => void;
}

export function dispatchInputChunk(params: DispatchInputChunkParams): void {
  const {
    inputBuffer,
    ctx,
    bargeInDetector,
    speakerAnalyserNode,
    playbackQueue,
    isMuted,
    onAudioChunk,
    onLocalInterrupt,
    stopPlayback,
  } = params;
  const speakerRms = bargeInDetector.getSpeakerRms(speakerAnalyserNode, playbackQueue.isAiSpeaking);
  const playedMs = playbackQueue.getPlaybackDurationMs(ctx);

  bargeInDetector.processInputChunk({
    inputBuffer,
    sampleRate: ctx.sampleRate,
    isMuted,
    isAiSpeakingOrActive: playbackQueue.isAiSpeaking || playbackQueue.isPlaybackActive(),
    speakerRms,
    playedMs,
    onAudioChunk,
    onBargeIn: (triggerPlayedMs, bufferedChunks) => {
      stopPlayback(150);
      for (const chunk of bufferedChunks) {
        onAudioChunk(chunk);
      }
      onLocalInterrupt?.(triggerPlayedMs);
    },
  });
}
