import { AUDIO_CONSTRAINTS } from '../minimax/constants';
import { PlaybackQueue } from './playbackQueue';
import { BargeInDetector } from './bargeInDetector';
import { computeRmsLevel } from './levelMeter';
import { setupRemoteWebRtcStream } from './remoteStreamPlayer';
import { buildOutputGraph, teardownOutputGraph } from './outputGraphBuilder';
import {
  buildInputPipeline,
  setupAudioProcessor,
  teardownInputNodes,
  reconnectInputStream,
} from './inputGraphBuilder';
import { playDecodedAudioUrl, playDecodedBase64Audio } from './audioBufferPlayer';
import { bindDeviceWatcher, unbindDeviceWatcher } from './deviceWatcher';

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
  private speakerSilentSinkNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private inputGainNode: GainNode | null = null;
  private highpassFilterNode: BiquadFilterNode | null = null;
  private remoteMediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private audioElement: HTMLAudioElement | null = null;

  private isMuted: boolean = false;
  private onLocalInterruptCallback: ((playedMs: number) => void) | null = null;
  private onPlaybackStateChange: ((isPlaying: boolean) => void) | null = null;
  private boundDeviceChangeListener: (() => void) | null = null;

  private playbackQueue: PlaybackQueue;
  private bargeInDetector: BargeInDetector;

  constructor() {
    this.playbackQueue = new PlaybackQueue({
      onPlaybackStateChange: (isPlaying) => {
        if (!isPlaying) {
          this.bargeInDetector.onPlaybackStopped();
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
    return this.playbackQueue.getJitterMetrics(this.audioCtx);
  }
  public updateNetworkQuality(rttMs: number): void {
    this.playbackQueue.updateNetworkQuality(rttMs);
  }

  public setAiSpeaking(speaking: boolean): void {
    this.playbackQueue.setAiSpeaking(speaking);
    if (!speaking) {
      this.bargeInDetector.onPlaybackStopped();
    }
  }

  public setAiThinking(thinking: boolean): void {
    if (thinking) {
      this.bargeInDetector.reset();
    }
  }

  public getMicrophoneStream(): MediaStream | null {
    return this.mediaStream;
  }

  public async setupWebRtcRemoteStream(stream: MediaStream): Promise<void> {
    const ctx = await this.initAudioContext();
    this.ensureOutputGraph(ctx);
    if (this.remoteMediaStreamSource) {
      try {
        this.remoteMediaStreamSource.disconnect();
      } catch {}
      this.remoteMediaStreamSource = null;
    }
    const res = await setupRemoteWebRtcStream(
      ctx,
      stream,
      this.speakerAnalyserNode,
      this.audioElement,
    );
    this.remoteMediaStreamSource = res.remoteSource;
    this.audioElement = res.audioElement;
  }

  public async reinitInputStream(): Promise<void> {
    if (!this.audioCtx) return;
    const res = await reconnectInputStream(
      this.audioCtx,
      this.mediaStream,
      this.sourceNode,
      this.highpassFilterNode,
      this.inputGainNode,
      this.analyserNode,
      AUDIO_CONSTRAINTS,
    );
    if (res) {
      this.mediaStream = res.stream;
      this.sourceNode = res.source;
    }
  }

  public async startRecording(onAudioChunk: (pcm16Base64: string) => void): Promise<void> {
    const ctx = await this.initAudioContext();
    this.mediaStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);

    const inputPipeline = buildInputPipeline(ctx, this.mediaStream);
    this.sourceNode = inputPipeline.sourceNode;
    this.highpassFilterNode = inputPipeline.highpassFilterNode;
    this.inputGainNode = inputPipeline.inputGainNode;
    this.analyserNode = inputPipeline.analyserNode;

    this.bargeInDetector.resetWarmUp(4);

    const { workletNode, processorNode } = await setupAudioProcessor(
      ctx,
      this.inputGainNode,
      (buffer) => this.handleInputChunk(buffer, ctx, onAudioChunk),
    );
    this.workletNode = workletNode;
    this.processorNode = processorNode;

    this.ensureOutputGraph(ctx);
    this.boundDeviceChangeListener = bindDeviceWatcher(() => {
      this.reinitInputStream().catch(() => {});
    });
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
        this.playbackQueue.isAiSpeaking || this.playbackQueue.isPlaybackActive(),
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

  private ensureOutputGraph(ctx: AudioContext): GainNode {
    if (!this.outputGainNode) {
      const output = buildOutputGraph(ctx);
      this.outputGainNode = output.outputGainNode;
      this.compressorNode = output.compressorNode;
      this.speakerAnalyserNode = output.speakerAnalyserNode;
      this.speakerSilentSinkNode = output.speakerSilentSinkNode;
    }
    return this.outputGainNode;
  }

  public async playAudioUrl(url: string, onEnded?: () => void): Promise<void> {
    const ctx = await this.initAudioContext();
    const outputGain = this.ensureOutputGraph(ctx);
    await playDecodedAudioUrl(ctx, url, outputGain, this.analyserNode, this.playbackQueue, onEnded);
  }

  public async playBase64Audio(base64Data: string, onEnded?: () => void): Promise<void> {
    const ctx = await this.initAudioContext();
    const outputGain = this.ensureOutputGraph(ctx);
    await playDecodedBase64Audio(
      ctx,
      base64Data,
      outputGain,
      this.analyserNode,
      this.playbackQueue,
      onEnded,
    );
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
    return computeRmsLevel(this.analyserNode, this.isMuted);
  }

  public getInputLevel(): number {
    return this.getAudioLevel();
  }

  public getOutputLevel(): number {
    return computeRmsLevel(this.speakerAnalyserNode, false);
  }

  public stopRecording(): void {
    teardownInputNodes({
      mediaStream: this.mediaStream,
      workletNode: this.workletNode,
      processorNode: this.processorNode,
      sourceNode: this.sourceNode,
      highpassFilterNode: this.highpassFilterNode,
      inputGainNode: this.inputGainNode,
      analyserNode: this.analyserNode,
    });
    this.mediaStream = null;
    this.workletNode = null;
    this.processorNode = null;
    this.sourceNode = null;
    this.highpassFilterNode = null;
    this.inputGainNode = null;
    this.analyserNode = null;
  }

  public isRecordingActive(): boolean {
    return this.mediaStream !== null;
  }

  public cleanup(): void {
    this.stopPlayback(0);
    this.stopRecording();
    unbindDeviceWatcher(this.boundDeviceChangeListener);
    this.boundDeviceChangeListener = null;
    teardownOutputGraph({
      outputGainNode: this.outputGainNode,
      compressorNode: this.compressorNode,
      speakerAnalyserNode: this.speakerAnalyserNode,
      speakerSilentSinkNode: this.speakerSilentSinkNode,
      remoteMediaStreamSource: this.remoteMediaStreamSource,
      audioElement: this.audioElement,
      audioCtx: this.audioCtx,
    });
    this.remoteMediaStreamSource = null;
    this.audioElement = null;
    this.speakerAnalyserNode = null;
    this.speakerSilentSinkNode = null;
    this.compressorNode = null;
    this.outputGainNode = null;
    this.audioCtx = null;
  }
}

export type AudioGraphController = AudioGraphService;
