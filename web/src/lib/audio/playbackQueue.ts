import { base64PCMToAudioBuffer } from './audioResampler';

export interface PlaybackStateListener {
  onPlaybackStateChange: (isPlaying: boolean) => void;
}

/**
 * 实时音频播放与抖动队列调度器 (PlaybackQueue)
 * 职责：Jitter Buffer 平滑缓冲、Web Audio 播放时序计算与打断音量渐弱停播
 */
export class PlaybackQueue {
  private scheduledSources: AudioBufferSourceNode[] = [];
  private jitterBuffer: AudioBuffer[] = [];
  private jitterBufferedSec: number = 0;
  private isJitterBuffering: boolean = true;
  private nextPlayTime: number = 0;
  private playbackStartCtxTime: number | null = null;
  private isSpeaking: boolean = false;
  private playbackEpoch: number = 0;
  private pendingCleanupSources: AudioBufferSourceNode[] = [];
  public stopPlaybackTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly JITTER_TARGET_SEC: number = 0.12;
  private readonly JITTER_REBUFFER_SEC: number = 0.06;

  constructor(private listener?: PlaybackStateListener) {}

  public get isAiSpeaking(): boolean {
    return this.isSpeaking;
  }

  public setAiSpeaking(speaking: boolean): void {
    if (this.isSpeaking === speaking) return;
    this.isSpeaking = speaking;
    this.listener?.onPlaybackStateChange(speaking);
  }

  public isPlaybackActive(): boolean {
    return this.isSpeaking || this.scheduledSources.length > 0 || this.jitterBuffer.length > 0;
  }

  public getJitterMetrics(): {
    bufferedSec: number;
    bufferedMs: number;
    isBuffering: boolean;
    queuedBuffers: number;
    scheduledCount: number;
    targetSec: number;
    rebufferSec: number;
  } {
    return {
      bufferedSec: Number(this.jitterBufferedSec.toFixed(3)),
      bufferedMs: Math.round(this.jitterBufferedSec * 1000),
      isBuffering: this.isJitterBuffering,
      queuedBuffers: this.jitterBuffer.length,
      scheduledCount: this.scheduledSources.length,
      targetSec: this.JITTER_TARGET_SEC,
      rebufferSec: this.JITTER_REBUFFER_SEC,
    };
  }

  public getPlaybackDurationMs(ctx: AudioContext | null): number {
    if (!ctx || this.playbackStartCtxTime === null) return 0;
    const now = ctx.currentTime;
    if (now < this.playbackStartCtxTime) return 0;
    const elapsedSec = now - this.playbackStartCtxTime;
    return Math.max(0, Math.round(elapsedSec * 1000));
  }

  public enqueueChunk(
    base64Chunk: string,
    ctx: AudioContext,
    outputGainNode: GainNode,
    analyserNode: AnalyserNode | null,
  ): void {
    this.cancelPendingFadeOut(ctx, outputGainNode);

    const buffer = base64PCMToAudioBuffer(base64Chunk, ctx, 24000);
    if (buffer.length <= 1) return;

    this.setAiSpeaking(true);
    this.jitterBuffer.push(buffer);
    this.jitterBufferedSec += buffer.duration;

    let threshold = 0;
    if (this.scheduledSources.length === 0) {
      threshold = this.isJitterBuffering ? this.JITTER_TARGET_SEC : this.JITTER_REBUFFER_SEC;
    }

    if (this.jitterBufferedSec >= threshold) {
      this.isJitterBuffering = false;
      this.flushJitterBuffer(ctx, outputGainNode, analyserNode);
    }
  }

  public flushJitterBuffer(
    ctx: AudioContext,
    outputGainNode: GainNode,
    analyserNode: AnalyserNode | null,
  ): void {
    if (outputGainNode.gain.value < 0.84) {
      outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
      outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
    }

    while (this.jitterBuffer.length > 0) {
      const buffer = this.jitterBuffer.shift();
      if (!buffer) continue;
      this.jitterBufferedSec = Math.max(0, this.jitterBufferedSec - buffer.duration);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(outputGainNode);
      if (analyserNode) {
        source.connect(analyserNode);
      }

      const now = ctx.currentTime;
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + 0.005;
      }

      if (this.playbackStartCtxTime === null || this.scheduledSources.length === 0) {
        this.playbackStartCtxTime = this.nextPlayTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += buffer.duration;
      this.scheduledSources.push(source);

      const epochAtSchedule = this.playbackEpoch;
      source.onended = () => {
        if (this.playbackEpoch !== epochAtSchedule) return;
        const idx = this.scheduledSources.indexOf(source);
        if (idx !== -1) {
          this.scheduledSources.splice(idx, 1);
        }
        if (this.scheduledSources.length === 0 && this.jitterBuffer.length === 0) {
          this.playbackStartCtxTime = null;
          this.setAiSpeaking(false);
          this.isJitterBuffering = true;
        }
      };
    }
  }

  public playDecodedBuffer(
    ctx: AudioContext,
    audioBuffer: AudioBuffer,
    outputGainNode: GainNode,
    analyserNode: AnalyserNode | null,
    onEnded?: () => void,
  ): void {
    outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
    outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputGainNode);
    if (analyserNode) {
      source.connect(analyserNode);
    }

    const epochAtPlay = this.playbackEpoch;
    source.onended = () => {
      if (this.playbackEpoch !== epochAtPlay) return;
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) {
        this.scheduledSources.splice(idx, 1);
      }
      if (this.scheduledSources.length === 0 && this.jitterBuffer.length === 0) {
        this.playbackStartCtxTime = null;
        this.setAiSpeaking(false);
        this.isJitterBuffering = true;
      }
      onEnded?.();
    };

    this.setAiSpeaking(true);
    source.start(ctx.currentTime);
    this.scheduledSources.push(source);
  }

  public stopPlayback(
    ctx: AudioContext | null,
    outputGainNode: GainNode | null,
    fadeDurationMs: number = 150,
  ): void {
    if (!ctx || !outputGainNode) return;
    const wasSpeaking = this.isSpeaking;

    this.playbackEpoch++;
    if (this.stopPlaybackTimer) {
      clearTimeout(this.stopPlaybackTimer);
      this.stopPlaybackTimer = null;
    }

    this.playbackStartCtxTime = null;
    this.setAiSpeaking(false);
    this.isJitterBuffering = true;
    this.jitterBuffer = [];
    this.jitterBufferedSec = 0;

    const sourcesToStop = [...this.scheduledSources];
    this.scheduledSources = [];
    this.pendingCleanupSources.push(...sourcesToStop);

    // 立即注销旧节点的 onended 回调，杜绝异步回调竞态
    for (const s of sourcesToStop) {
      s.onended = null;
    }

    if ((sourcesToStop.length === 0 && !wasSpeaking) || fadeDurationMs <= 0) {
      try {
        outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
        outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
      } catch {}
      for (const s of sourcesToStop) {
        try {
          s.stop();
          s.disconnect();
        } catch {}
      }
      this.pendingCleanupSources = [];
      this.nextPlayTime = ctx.currentTime;
      return;
    }

    const fadeDurationSec = fadeDurationMs / 1000;
    const fadeEndTime = ctx.currentTime + fadeDurationSec;

    try {
      outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
      const currentGain = Math.max(0.001, outputGainNode.gain.value);
      outputGainNode.gain.setValueAtTime(currentGain, ctx.currentTime);
      outputGainNode.gain.exponentialRampToValueAtTime(0.0001, fadeEndTime);
    } catch {}

    for (const s of sourcesToStop) {
      try {
        s.stop(fadeEndTime);
      } catch {
        try {
          s.stop();
        } catch {}
      }
    }

    const timerEpoch = this.playbackEpoch;
    this.stopPlaybackTimer = setTimeout(() => {
      this.stopPlaybackTimer = null;
      for (const s of this.pendingCleanupSources) {
        try {
          s.disconnect();
        } catch {}
      }
      this.pendingCleanupSources = [];
      if (this.playbackEpoch === timerEpoch) {
        try {
          outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
          outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
          this.nextPlayTime = ctx.currentTime;
        } catch {}
      }
    }, fadeDurationMs + 20);
  }

  private cancelPendingFadeOut(ctx: AudioContext, outputGainNode: GainNode): void {
    if (this.stopPlaybackTimer) {
      clearTimeout(this.stopPlaybackTimer);
      this.stopPlaybackTimer = null;
      for (const s of this.pendingCleanupSources) {
        try {
          s.disconnect();
        } catch {}
      }
      this.pendingCleanupSources = [];
      try {
        outputGainNode.gain.cancelScheduledValues(ctx.currentTime);
        outputGainNode.gain.setValueAtTime(0.85, ctx.currentTime);
      } catch {}
      this.nextPlayTime = Math.max(ctx.currentTime + 0.025, this.nextPlayTime);
    }
  }

  public resetTime(time: number): void {
    this.nextPlayTime = time;
  }
}
