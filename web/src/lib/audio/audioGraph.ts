import { AUDIO_CONSTRAINTS } from '../minimax/constants';
import { PlaybackQueue } from './playbackQueue';
import { BargeInDetector } from './bargeInDetector';
import { computeRmsLevel } from './levelMeter';
import { resetOutputNodes, createAudioContext, ensureOutputNodes } from './outputGraphBuilder';
import {
  buildInputPipeline,
  setupAudioProcessor,
  resetInputNodes,
  reconnectInputStream,
  setMediaStreamTracksEnabled,
  dispatchInputChunk,
} from './inputGraphBuilder';
import { playDecodedAudioUrl, playDecodedBase64Audio } from './audioBufferPlayer';
import { bindDeviceWatcher, unbindDeviceWatcher } from './deviceWatcher';
import { setupRemoteWebRtcStream } from './remoteStreamPlayer';

/**
 * 客户端 Web Audio 拓扑调度核心服务 (AudioGraphService)
 * 职责：麦克风采集链路组装、音频工作线程 (AudioWorklet) 桥接、插话检测与播放队列分流
 */
export class AudioGraphService {
  public audioCtx: AudioContext | null = null;
  public mediaStream: MediaStream | null = null;
  public sourceNode: MediaStreamAudioSourceNode | null = null;
  public workletNode: AudioWorkletNode | null = null;
  public processorNode: ScriptProcessorNode | null = null;
  public analyserNode: AnalyserNode | null = null;
  public speakerAnalyserNode: AnalyserNode | null = null;
  public outputGainNode: GainNode | null = null;
  public speakerSilentSinkNode: GainNode | null = null;
  public compressorNode: DynamicsCompressorNode | null = null;
  public inputGainNode: GainNode | null = null;
  public highpassFilterNode: BiquadFilterNode | null = null;
  public remoteMediaStreamSource: MediaStreamAudioSourceNode | null = null;
  public audioElement: HTMLAudioElement | null = null;

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
      this.audioCtx = createAudioContext();
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
    if (!speaking) this.bargeInDetector.onPlaybackStopped();
  }

  public setAiThinking(thinking: boolean): void {
    if (thinking) this.bargeInDetector.reset();
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
    dispatchInputChunk({
      inputBuffer,
      ctx,
      bargeInDetector: this.bargeInDetector,
      speakerAnalyserNode: this.speakerAnalyserNode,
      playbackQueue: this.playbackQueue,
      isMuted: this.isMuted,
      onAudioChunk,
      onLocalInterrupt: (ms) => this.onLocalInterruptCallback?.(ms),
      stopPlayback: (fadeMs) => this.stopPlayback(fadeMs),
    });
  }

  private ensureOutputGraph(ctx: AudioContext): GainNode {
    const output = ensureOutputNodes(ctx, this);
    this.outputGainNode = output.outputGainNode;
    this.compressorNode = output.compressorNode;
    this.speakerAnalyserNode = output.speakerAnalyserNode;
    this.speakerSilentSinkNode = output.speakerSilentSinkNode;
    return this.outputGainNode;
  }

  public async playAudioUrl(url: string, onEnded?: () => void): Promise<void> {
    const ctx = await this.initAudioContext();
    await playDecodedAudioUrl(
      ctx,
      url,
      this.ensureOutputGraph(ctx),
      this.analyserNode,
      this.playbackQueue,
      onEnded,
    );
  }

  public async playBase64Audio(base64Data: string, onEnded?: () => void): Promise<void> {
    const ctx = await this.initAudioContext();
    await playDecodedBase64Audio(
      ctx,
      base64Data,
      this.ensureOutputGraph(ctx),
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
    setMediaStreamTracksEnabled(this.mediaStream, !muted);
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
    resetInputNodes(this);
  }

  public isRecordingActive(): boolean {
    return this.mediaStream !== null;
  }

  public cleanup(): void {
    this.stopPlayback(0);
    this.stopRecording();
    unbindDeviceWatcher(this.boundDeviceChangeListener);
    this.boundDeviceChangeListener = null;
    resetOutputNodes(this);
  }
}

export type AudioGraphController = AudioGraphService;
