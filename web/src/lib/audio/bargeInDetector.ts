import { resampleAndEncodePCM } from './audioResampler';

/**
 * 实时插话检测与扬声器瞬态抑制器 (BargeInDetector)
 * 职责：计算麦克风与扬声器能量 RMS、250ms 瞬态抑制保护、连续帧阈值比对与零字头预录缓冲补偿
 */
export class BargeInDetector {
  public consecutiveSpeechFrames: number = 0;
  public preRollChunks: string[] = [];
  public warmUpFrames: number = 4;

  public reset(): void {
    this.consecutiveSpeechFrames = 0;
    this.preRollChunks = [];
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

    if (isAiSpeakingOrActive) {
      // 250ms 扬声器初始瞬态抑制窗
      if (playedMs < 250) {
        this.reset();
        return;
      }

      const dynamicThreshold = Math.max(0.12, speakerRms * 1.3 + 0.08);
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
      this.reset();
      const base64 = resampleAndEncodePCM(inputBuffer, sampleRate, 24000);
      if (base64) {
        onAudioChunk(base64);
      }
    }
  }
}
