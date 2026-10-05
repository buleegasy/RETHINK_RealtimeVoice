import { describe, it, expect } from 'vitest';
import {
  applyLowPassFilter,
  resampleAndEncodePCM,
  floatToInt16,
  int16ToBase64,
  base64PCMToAudioBuffer,
} from '../src/lib/audio/audioResampler';

describe('音频重采样与编解码器验证 (Audio Resampler)', () => {
  it('正确将 Float32Array 转换为 16-bit 有符号整数并进行 Base64 编码', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    const int16 = floatToInt16(input);

    expect(int16[0]).toBe(0);
    expect(int16[1]).toBeGreaterThan(16000);
    expect(int16[2]).toBeLessThan(-16000);
    expect(int16[3]).toBe(32767);
    expect(int16[4]).toBe(-32768);

    const base64 = int16ToBase64(int16);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);
  });

  it('48000Hz 输入至 24000Hz 重采样后样本长度准确减半', () => {
    const sampleRateSource = 48000;
    const sampleRateTarget = 24000;
    const input = new Float32Array(4800);

    const base64 = resampleAndEncodePCM(input, sampleRateSource, sampleRateTarget);
    expect(base64).toBeDefined();

    const decodedBinary = atob(base64);
    const byteLength = decodedBinary.length;
    const int16Count = byteLength / 2;

    expect(int16Count).toBe(2400);
  });

  it('applyLowPassFilter 对 18000Hz 超高频信号实现显著衰减 (抗混叠防护)', () => {
    const sampleRate = 48000;
    const samples = 480;
    const highFreqInput = new Float32Array(samples);
    // 生成 18kHz 高频正弦波 (高于 24kHz 采样的 Nyquist 12kHz)
    for (let i = 0; i < samples; i++) {
      highFreqInput[i] = Math.sin((2 * Math.PI * 18000 * i) / sampleRate);
    }

    const filtered = applyLowPassFilter(highFreqInput, sampleRate, 10800);
    // 计算滤波后能量，高频能量应被滤除 90% 以上
    let rawPower = 0;
    let filteredPower = 0;
    for (let i = 50; i < samples; i++) {
      rawPower += highFreqInput[i] * highFreqInput[i];
      filteredPower += filtered[i] * filtered[i];
    }
    expect(filteredPower / rawPower).toBeLessThan(0.1);
  });

  it('解码 Base64 PCM 数据为 AudioBuffer', () => {
    const dummyCtx = new (window as any).AudioContext();
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const pcm = floatToInt16(input);
    const b64 = int16ToBase64(pcm);

    const buffer = base64PCMToAudioBuffer(b64, dummyCtx, 24000);
    expect(buffer).toBeDefined();
    expect(buffer.sampleRate).toBe(24000);
  });
});
