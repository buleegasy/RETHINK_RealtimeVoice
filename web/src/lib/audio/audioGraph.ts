import { AUDIO_CONSTRAINTS } from '../minimax/constants';
import { AUDIO_WORKLET_PROCESSOR_CODE, WORKLET_PROCESSOR_NAME } from './workletProcessor';
import { PlaybackQueue } from './playbackQueue';
import { BargeInDetector } from './bargeInDetector';

/**
 * 客户端 Web Audio 拓扑调度核心服务 (AudioGraphService)
 * 职责：麦克风采集链路组装、音频工作线程 (AudioWorklet) 桥接、插话检测与播放队列分流
 */
export class AudioGraphService {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private speakerAnalyserNode: AnalyserNode | null = null;
  private outputGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private inputGainNode: GainNode | null = null;
  private highpassFilterNode: BiquadFilterNode | null = null;

  private isMuted: boolean = false;
  private isAiThinking: boolean = false;
  private onLocalInterruptCallback: ((playedMs: number) => void) | null = null;
  private onPlaybackStateChange: ((isPlaying: boolean) => void) | null = null;
  private boundDeviceChangeListener: (() => void) | null = null;

  private playbackQueue: PlaybackQueue;
  private bargeInDetector: BargeInDetector;

  constructor() {
    this.playbackQueue = new PlaybackQueue({
      onPlaybackStateChange: (isPlaying) => {
        if (!isPlaying) {
          this.bargeInDetector.reset();
        }
        this.onPlaybackStateChange?.(isPlaying);
      },
    });
    this.bargeInDetector = new BargeInDetector();
  }

  // 单元测试与内部反射兼容代理
  public get consecutiveSpeechFrames(): number {
    return this.bargeInDetector.consecutiveSpeechFrames;
  }
  public set consecutiveSpeechFrames(val: number) {
    this.bargeInDetector.consecutiveSpeechFrames = val;
  }

  public get preRollChunks(): string[] {
    return this.bargeInDetector.preRollChunks;
  }
  public set preRollChunks(val: string[]) {
    this.bargeInDetector.preRollChunks = val;
  }

  public get stopPlaybackTimer(): ReturnType<typeof setTimeout> | null {
    return this.playbackQueue.stopPlaybackTimer;
  }

  public async initAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      try {
        this.audioCtx = new AudioCtxClass({ sampleRate: 24000, latencyHint: 'interactive' });
      } catch {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    this.ensureOutputGraph(this.audioCtx);
    return this.audioCtx;
  }

  public setOnLocalInterrupt(callback: (playedMs: number) => void): void {
    this.onLocalInterruptCallback = callback;
  }

  public setOnPlaybackStateChange(callback: (isPlaying: boolean) => void): void {
    this.onPlaybackStateChange = callback;
  }

  public isPlaybackActive(): boolean {
    return this.playbackQueue.isPlaybackActive();
  }

  public getJitterMetrics() {
    return this.playbackQueue.getJitterMetrics();
  }

  public updateNetworkQuality(rttMs: number): void {
    this.playbackQueue.updateNetworkQuality(rttMs);
  }

  public setAiSpeaking(speaking: boolean): void {
    this.playbackQueue.setAiSpeaking(speaking);
    if (!speaking) {
      this.bargeInDetector.reset();
    }
  }

  public setAiThinking(thinking: boolean): void {
    this.isAiThinking = thinking;
    if (thinking) {
      this.bargeInDetector.reset();
    }
  }

  public async reinitInputStream(): Promise<void> {
    if (!this.audioCtx) return;
    try {
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((t) => t.stop());
        this.mediaStream = null;
      }
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch {}
        this.sourceNode = null;
      }
      this.mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      if (this.highpassFilterNode) {
        this.sourceNode.connect(this.highpassFilterNode);
      } else if (this.inputGainNode) {
        this.sourceNode.connect(this.inputGainNode);
      } else if (this.analyserNode) {
        this.sourceNode.connect(this.analyserNode);
      }
    } catch {}
  }

  public async startRecording(onAudioChunk: (pcm16Base64: string) => void): Promise<void> {
    const ctx = await this.initAudioContext();

    this.mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);

    this.highpassFilterNode = ctx.createBiquadFilter();
    this.highpassFilterNode.type = 'highpass';
    this.highpassFilterNode.frequency.setValueAtTime(120, ctx.currentTime);
    this.highpassFilterNode.Q.setValueAtTime(0.7, ctx.currentTime);

    this.inputGainNode = ctx.createGain();
    this.inputGainNode.gain.setValueAtTime(1.15, ctx.currentTime);

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.5;

    this.bargeInDetector.resetWarmUp(4);
    this.sourceNode.connect(this.highpassFilterNode);
    this.highpassFilterNode.connect(this.inputGainNode);
    this.inputGainNode.connect(this.analyserNode);

    let useWorklet = false;
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

        this.workletNode = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME);
        this.workletNode.port.onmessage = (event: MessageEvent) => {
          if (event.data?.eventType === 'audio_chunk' && event.data.buffer) {
            this.handleInputChunk(event.data.buffer, ctx, onAudioChunk);
          }
        };

        this.inputGainNode.connect(this.workletNode);
        this.workletNode.connect(ctx.destination);
        useWorklet = true;
      } catch {
        useWorklet = false;
      }
    }

    if (!useWorklet) {
      this.setupScriptProcessorFallback(ctx, onAudioChunk);
    }

    this.ensureOutputGraph(ctx);
    this.bindDeviceChangeListener();
    this.playbackQueue.resetTime(ctx.currentTime);
  }

  private handleInputChunk(
    inputBuffer: Float32Array,
    ctx: AudioContext,
    onAudioChunk: (pcm16Base64: string) => void,
  ): void {
    const speakerRms = this.bargeInDetector.getSpeakerRms(
      this.speakerAnalyserNode,
      this.playbackQueue.isAiSpeaking,
    );
    const playedMs = this.playbackQueue.getPlaybackDurationMs(ctx);

    this.bargeInDetector.processInputChunk({
      inputBuffer,
      sampleRate: ctx.sampleRate,
      isMuted: this.isMuted,
      isAiSpeakingOrActive:
        this.isAiThinking ||
        this.playbackQueue.isAiSpeaking ||
        this.playbackQueue.isPlaybackActive(),
      speakerRms,
      playedMs,
      onAudioChunk,
      onBargeIn: (triggerPlayedMs, bufferedChunks) => {
        this.stopPlayback(150);
        for (const chunk of bufferedChunks) {
          onAudioChunk(chunk);
        }
        this.onLocalInterruptCallback?.(triggerPlayedMs);
      },
    });
  }

  private setupScriptProcessorFallback(
    ctx: AudioContext,
    onAudioChunk: (pcm16Base64: string) => void,
  ): void {
    this.processorNode = ctx.createScriptProcessor(2048, 1, 1);
    this.processorNode.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      out.fill(0);
      const inputBuffer = e.inputBuffer.getChannelData(0);
      this.handleInputChunk(inputBuffer, ctx, onAudioChunk);
    };

    if (this.inputGainNode) {
      this.inputGainNode.connect(this.processorNode);
    }
    this.processorNode.connect(ctx.destination);
  }

  private ensureOutputGraph(ctx: AudioContext): GainNode {
    if (!this.outputGainNode) {
      this.outputGainNode = ctx.createGain();
      this.outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);

      this.compressorNode = ctx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-18, ctx.currentTime);
      this.compressorNode.knee.setValueAtTime(12, ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(3, ctx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, ctx.currentTime);
      this.compressorNode.release.setValueAtTime(0.1, ctx.currentTime);

      this.speakerAnalyserNode = ctx.createAnalyser();
      this.speakerAnalyserNode.fftSize = 256;
      this.speakerAnalyserNode.smoothingTimeConstant = 0.3;

      this.outputGainNode.connect(this.compressorNode);
      this.compressorNode.connect(this.speakerAnalyserNode);
      this.speakerAnalyserNode.connect(ctx.destination);
    }
    return this.outputGainNode;
  }

  public async playAudioUrl(url: string, onEnded?: () => void): Promise<void> {
    const ctx = await this.initAudioContext();
    try {
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const outputGain = this.ensureOutputGraph(ctx);
      this.playbackQueue.playDecodedBuffer(
        ctx,
        audioBuffer,
        outputGain,
        this.analyserNode,
        onEnded,
      );
    } catch {
      onEnded?.();
    }
  }

  public async playBase64Audio(base64Data: string, onEnded?: () => void): Promise<void> {
    if (!base64Data) {
      onEnded?.();
      return;
    }
    const ctx = await this.initAudioContext();
    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
      const outputGain = this.ensureOutputGraph(ctx);
      this.playbackQueue.playDecodedBuffer(
        ctx,
        audioBuffer,
        outputGain,
        this.analyserNode,
        onEnded,
      );
    } catch {
      onEnded?.();
    }
  }

  public getPlaybackDurationMs(): number {
    return this.playbackQueue.getPlaybackDurationMs(this.audioCtx);
  }

  public enqueueAudioChunk(base64Chunk: string): void {
    if (!this.audioCtx || !this.outputGainNode) return;
    this.playbackQueue.enqueueChunk(
      base64Chunk,
      this.audioCtx,
      this.outputGainNode,
      this.analyserNode,
    );
  }

  public stopPlayback(fadeDurationMs: number = 150): void {
    this.bargeInDetector.reset();
    this.playbackQueue.stopPlayback(this.audioCtx, this.outputGainNode, fadeDurationMs);
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  public getAudioLevel(): number {
    if (!this.analyserNode || this.isMuted) return 0;
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(1, rms * 4);
  }

  public getInputLevel(): number {
    return this.getAudioLevel();
  }

  public getOutputLevel(): number {
    if (!this.speakerAnalyserNode) return 0;
    const dataArray = new Uint8Array(this.speakerAnalyserNode.frequencyBinCount);
    this.speakerAnalyserNode.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(1, rms * 4);
  }

  private bindDeviceChangeListener(): void {
    if (
      !this.boundDeviceChangeListener &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices
    ) {
      this.boundDeviceChangeListener = () => {
        this.reinitInputStream().catch(() => {});
      };
      try {
        navigator.mediaDevices.addEventListener('devicechange', this.boundDeviceChangeListener);
      } catch {}
    }
  }

  public stopRecording(): void {
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((t) => t.stop());
      } catch {}
      this.mediaStream = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }
    if (this.processorNode) {
      try {
        this.processorNode.onaudioprocess = null;
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.highpassFilterNode) {
      try {
        this.highpassFilterNode.disconnect();
      } catch {}
      this.highpassFilterNode = null;
    }
    if (this.inputGainNode) {
      try {
        this.inputGainNode.disconnect();
      } catch {}
      this.inputGainNode = null;
    }
    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {}
      this.analyserNode = null;
    }
  }

  public isRecordingActive(): boolean {
    return this.mediaStream !== null;
  }

  public cleanup(): void {
    this.stopPlayback(0);
    this.stopRecording();
    if (
      this.boundDeviceChangeListener &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices
    ) {
      try {
        navigator.mediaDevices.removeEventListener('devicechange', this.boundDeviceChangeListener);
      } catch {}
      this.boundDeviceChangeListener = null;
    }
    if (this.speakerAnalyserNode) {
      try {
        this.speakerAnalyserNode.disconnect();
      } catch {}
      this.speakerAnalyserNode = null;
    }
    if (this.compressorNode) {
      try {
        this.compressorNode.disconnect();
      } catch {}
      this.compressorNode = null;
    }
    if (this.outputGainNode) {
      try {
        this.outputGainNode.disconnect();
      } catch {}
      this.outputGainNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
