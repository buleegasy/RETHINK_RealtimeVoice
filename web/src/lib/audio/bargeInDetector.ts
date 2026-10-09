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
  }

  public resetWarmUp(frames: number = 4): void {
    this.warmUpFrames = frames;
  }

  public getSpeakerRms(speakerAnalyser: AnalyserNode | null, isAiSpeaking: boolean): number {
    if (!speakerAnalyser || !isAiSpeaking) return 0;
    const data = new Uint8Array(speakerAnalyser.frequencyBinCount);
    speakerAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const byte of data) {
      const v = (byte - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
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
      // 扬声器初始瞬态抑制窗：播发启动前 280ms 抑制扬声器冲激响应
      if (playedMs < 280) {
        this.reset();
        return;
      }

      // 动态自适应打断阈值：根据环境底噪与扬声器回声动态加权，杜绝嘈杂人声误判
      const baseThreshold = Math.max(0.16, this.noiseFloorRms * 2.0 + 0.06);
      const echoThreshold = speakerRms * 1.35 + 0.08;
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
      // 倾听态环境噪声门控：过滤远场持续人声与房间白噪声，防止空载推流打断服务端时序
      this.consecutiveSpeechFrames = 0;
      this.preRollChunks = [];

      const base64 = resampleAndEncodePCM(inputBuffer, sampleRate, 24000);
      if (!base64) return;

      const gateThreshold = Math.max(0.045, this.noiseFloorRms * 1.25);

      if (micRms >= gateThreshold) {
        // 用户近场有效发声，激活连续发射与保持窗 (Hangover 8 帧约 680ms)
        this.listeningHangoverFrames = 8;
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
        // 静音停顿保护期内继续发射，避免词句间停顿被截断
        this.listeningHangoverFrames--;
        onAudioChunk(base64);
      } else {
        // 彻底归于环境静默，闭门阻断环境杂音推流，仅保留最后 2 帧循环预录
        this.isListeningSpeechActive = false;
        this.listeningPreRoll.push(base64);
        if (this.listeningPreRoll.length > 2) {
          this.listeningPreRoll.shift();
        }
      }
    }
  }
}
