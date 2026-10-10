import { resampleAndEncodePCM } from './audioResampler';

/**
 * 实时抗噪插话检测与扬声器瞬态抑制器 (BargeInDetector)
 * 职责：
 * 1. 动态本底噪声持续追踪 (Adaptive Noise Floor Tracking)
 * 2. 嘈杂环境抗干扰打断阈值自适应 (Noise-Adaptive Barge-In Detection)
 * 3. 倾听态动态噪声门控与前置零字头无损缓冲 (Noise Gating & Pre-roll Buffer)
 * 4. 扬声器回声与瞬态震荡抑制 (Acoustic Echo & Transient Shielding)
 */
export class BargeInDetector {
  public consecutiveSpeechFrames: number = 0;
  public preRollChunks: string[] = [];
  public warmUpFrames: number = 4;

  // 动态环境底噪估算值 (EMA 滤波)
  public noiseFloorRms: number = 0.03;

  // 扬声器声学回声包络峰值保持与混响衰减 (Acoustic Echo Peak-Hold & Decay)
  public speakerEnvelopeRms: number = 0;

  // 倾听态噪声门控与无损预录状态
  private isListeningSpeechActive: boolean = false;
  private listeningHangoverFrames: number = 0;
  private listeningPreRoll: string[] = [];

  public reset(): void {
    this.consecutiveSpeechFrames = 0;
    this.preRollChunks = [];
    this.isListeningSpeechActive = false;
    this.listeningHangoverFrames = 0;
    this.listeningPreRoll = [];
    this.speakerEnvelopeRms = 0;
  }

  public resetWarmUp(frames: number = 4): void {
    this.warmUpFrames = frames;
  }

  public getSpeakerRms(speakerAnalyser: AnalyserNode | null, isAiSpeaking: boolean): number {
    if (!speakerAnalyser || !isAiSpeaking) {
      this.speakerEnvelopeRms *= 0.85;
      return this.speakerEnvelopeRms;
    }
    const data = new Uint8Array(speakerAnalyser.frequencyBinCount);
    speakerAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const byte of data) {
      const v = (byte - 128) / 128;
      sum += v * v;
    }
    const instantRms = Math.sqrt(sum / data.length);
    // 峰值保持与指数衰减滤波，覆盖声卡硬件输出与房间混响延时 (100ms ~ 300ms)
    this.speakerEnvelopeRms = Math.max(instantRms, this.speakerEnvelopeRms * 0.88);
    return Math.max(instantRms, this.speakerEnvelopeRms);
  }

  public processInputChunk(params: {
    inputBuffer: Float32Array;
    sampleRate: number;
    isMuted: boolean;
    isAiSpeakingOrActive: boolean;
    speakerRms: number;
    playedMs: number;
    onAudioChunk: (pcm16Base64: string) => void;
    onBargeIn: (playedMs: number, bufferedChunks: string[]) => void;
  }): void {
    const {
      inputBuffer,
      sampleRate,
      isMuted,
      isAiSpeakingOrActive,
      speakerRms,
      playedMs,
      onAudioChunk,
      onBargeIn,
    } = params;

    if (isMuted) return;

    if (this.warmUpFrames > 0) {
      this.warmUpFrames--;
      return;
    }

    let sum = 0;
    for (const v of inputBuffer) {
      sum += v * v;
    }
    const micRms = Math.sqrt(sum / inputBuffer.length);

    // 持续平滑追踪环境本底噪声（排除极端爆音，慢速追踪环境声场能量）
    if (!isAiSpeakingOrActive || micRms < 0.2) {
      this.noiseFloorRms = this.noiseFloorRms * 0.96 + micRms * 0.04;
    }

    if (isAiSpeakingOrActive) {
      // 扬声器初始瞬态抑制窗：播发启动前 280ms 抑制扬声器初冲激响应
      if (playedMs < 280) {
        this.consecutiveSpeechFrames = 0;
        this.preRollChunks = [];
        return;
      }

      // 动态自适应打断阈值：结合底噪与扬声器回声包络峰值动态加权
      const effectiveSpeakerRms = Math.max(speakerRms, this.speakerEnvelopeRms);
      const baseThreshold = Math.max(0.18, this.noiseFloorRms * 2.2 + 0.08);
      const echoThreshold = effectiveSpeakerRms * 1.5 + 0.1;
      const dynamicThreshold = Math.max(baseThreshold, echoThreshold);

      if (micRms > dynamicThreshold) {
        this.consecutiveSpeechFrames++;
        const base64 = resampleAndEncodePCM(inputBuffer, sampleRate, 24000);
        if (base64) {
          this.preRollChunks.push(base64);
          if (this.preRollChunks.length > 6) {
            this.preRollChunks.shift();
          }
        }

        if (this.consecutiveSpeechFrames >= 2) {
          const bufferedChunks = [...this.preRollChunks];
          this.reset();
          onBargeIn(playedMs, bufferedChunks);
        }
      } else {
        this.consecutiveSpeechFrames = Math.max(0, this.consecutiveSpeechFrames - 1);
        if (this.consecutiveSpeechFrames === 0) {
          this.preRollChunks = [];
        }
      }
    } else {
      // 倾听态环境噪声门控：过滤白噪声，保持自然首字与平滑闭合
      this.consecutiveSpeechFrames = 0;
      this.preRollChunks = [];

      const base64 = resampleAndEncodePCM(inputBuffer, sampleRate, 24000);
      if (!base64) return;

      const gateThreshold = Math.max(0.038, this.noiseFloorRms * 1.2);

      if (micRms >= gateThreshold) {
        // 用户有效发声，激活连续发射与保持窗 (12 帧约 500ms 消除停顿吃字)
        this.listeningHangoverFrames = 12;
        if (!this.isListeningSpeechActive) {
          this.isListeningSpeechActive = true;
          // 冲刷首字无损缓冲，保证“我”、“你”等首字无损还原
          for (const preChunk of this.listeningPreRoll) {
            onAudioChunk(preChunk);
          }
          this.listeningPreRoll = [];
        }
        onAudioChunk(base64);
      } else if (this.listeningHangoverFrames > 0) {
        // 静音保护期内继续发射真实尾音，让服务端 VAD 迅速准确闭合
        this.listeningHangoverFrames--;
        onAudioChunk(base64);
      } else {
        // 彻底归于静默，循环保留最后 3 帧
        this.isListeningSpeechActive = false;
        this.listeningPreRoll.push(base64);
        if (this.listeningPreRoll.length > 3) {
          this.listeningPreRoll.shift();
        }
      }
    }
  }
}
