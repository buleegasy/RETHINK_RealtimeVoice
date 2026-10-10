import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioGraphService } from '../src/lib/audio/audioGraph';

describe('AudioGraphService 打断音量渐弱与状态管理验证', () => {
  let service: AudioGraphService;

  beforeEach(() => {
    service = new AudioGraphService();
  });

  it('initAudioContext 应成功初始化并直连 destination', async () => {
    const ctx = await service.initAudioContext();
    expect(ctx).toBeDefined();
    expect(ctx.sampleRate).toBe(24000);
  });

  it('stopPlayback 在打断时应执行音量渐弱 (exponentialRampToValueAtTime)', async () => {
    await service.initAudioContext();
    const outputGain = (service as any).outputGainNode;
    expect(outputGain).toBeDefined();

    const rampSpy = vi.spyOn(outputGain.gain, 'exponentialRampToValueAtTime');
    const cancelSpy = vi.spyOn(outputGain.gain, 'cancelScheduledValues');

    service.setAiSpeaking(true);
    expect(service.isPlaybackActive()).toBe(true);

    service.stopPlayback(150);

    expect(cancelSpy).toHaveBeenCalled();
    expect(rampSpy).toHaveBeenCalled();
    expect(service.isPlaybackActive()).toBe(false);
  });

  it('stopPlayback(0) 在销毁时应立即停播而不启动渐弱定时器', async () => {
    await service.initAudioContext();
    const outputGain = (service as any).outputGainNode;

    const rampSpy = vi.spyOn(outputGain.gain, 'exponentialRampToValueAtTime');

    service.setAiSpeaking(true);
    service.stopPlayback(0);

    expect(rampSpy).not.toHaveBeenCalled();
    expect(service.isPlaybackActive()).toBe(false);
  });

  it('setAiSpeaking(false) 与 stopPlayback 应重置 preRollChunks 与连续帧数', async () => {
    await service.initAudioContext();
    (service as any).consecutiveSpeechFrames = 3;
    (service as any).preRollChunks = ['chunk1', 'chunk2'];

    service.setAiSpeaking(false);
    expect((service as any).consecutiveSpeechFrames).toBe(0);
    expect((service as any).preRollChunks).toEqual([]);

    (service as any).consecutiveSpeechFrames = 3;
    (service as any).preRollChunks = ['chunk3'];
    service.stopPlayback(150);
    expect((service as any).consecutiveSpeechFrames).toBe(0);
    expect((service as any).preRollChunks).toEqual([]);
  });

  it('新音频到达时若处于渐弱定时器激活态，应立刻取消定时器并恢复增益至 0.85', async () => {
    await service.initAudioContext();
    const outputGain = (service as any).outputGainNode;

    service.setAiSpeaking(true);
    service.stopPlayback(150);

    expect((service as any).stopPlaybackTimer).not.toBeNull();

    // 模拟新音频到达 (空 base64 或 1 字节)
    // 构造一个最小的有效 PCM16 base64 (2 个采样点 4 字节)
    const pcmSamples = new Int16Array([1000, -1000, 2000, -2000]);
    const bytes = new Uint8Array(pcmSamples.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const validBase64 = btoa(binary);

    const setValueSpy = vi.spyOn(outputGain.gain, 'setValueAtTime');
    service.enqueueAudioChunk(validBase64);

    // 确认停播定时器已被强行取消
    expect((service as any).stopPlaybackTimer).toBeNull();
    expect(setValueSpy).toHaveBeenCalledWith(0.85, expect.any(Number));
  });

  it('initAudioContext 应配置输出链路动态压缩器 (compressorNode) 抑制爆音', async () => {
    await service.initAudioContext();
    const compressor = (service as any).compressorNode;
    expect(compressor).toBeDefined();
  });

  it('BargeInDetector 插话检测在连续两帧满足阈值时触发打断，并在安静帧平滑漏桶衰减', () => {
    const detector = (service as any).bargeInDetector;
    detector.resetWarmUp(0);
    const onBargeIn = vi.fn();
    const onAudioChunk = vi.fn();

    // 构造有效语音帧 (RMS 约 0.2)
    const speechBuffer = new Float32Array(2048).fill(0.2);

    // 第一帧：未达 2 帧门槛，不触发打断
    detector.processInputChunk({
      inputBuffer: speechBuffer,
      sampleRate: 24000,
      isMuted: false,
      isAiSpeakingOrActive: true,
      speakerRms: 0.05,
      playedMs: 300,
      onAudioChunk,
      onBargeIn,
    });
    expect(detector.consecutiveSpeechFrames).toBe(1);
    expect(onBargeIn).not.toHaveBeenCalled();

    // 静音帧：通过漏桶衰减 1 帧，而不是直接归零
    const silentBuffer = new Float32Array(2048).fill(0.01);
    detector.processInputChunk({
      inputBuffer: silentBuffer,
      sampleRate: 24000,
      isMuted: false,
      isAiSpeakingOrActive: true,
      speakerRms: 0.05,
      playedMs: 350,
      onAudioChunk,
      onBargeIn,
    });
    expect(detector.consecutiveSpeechFrames).toBe(0);

    // 连续两帧语音：触发打断
    detector.processInputChunk({
      inputBuffer: speechBuffer,
      sampleRate: 24000,
      isMuted: false,
      isAiSpeakingOrActive: true,
      speakerRms: 0.05,
      playedMs: 400,
      onAudioChunk,
      onBargeIn,
    });
    expect(detector.consecutiveSpeechFrames).toBe(1);

    detector.processInputChunk({
      inputBuffer: speechBuffer,
      sampleRate: 24000,
      isMuted: false,
      isAiSpeakingOrActive: true,
      speakerRms: 0.05,
      playedMs: 450,
      onAudioChunk,
      onBargeIn,
    });
    expect(onBargeIn).toHaveBeenCalledTimes(1);
    expect(detector.consecutiveSpeechFrames).toBe(0); // 触发后重置
  });

  it('stopRecording 应安全终止 mediaStream 上的所有音轨并断开节点', async () => {
    await service.initAudioContext();
    const trackStopSpy = vi.fn();
    const mockTrack = { stop: trackStopSpy } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    (service as any).mediaStream = mockStream;
    expect(service.isRecordingActive()).toBe(true);

    service.stopRecording();

    expect(trackStopSpy).toHaveBeenCalledTimes(1);
    expect(service.isRecordingActive()).toBe(false);
    expect((service as any).mediaStream).toBeNull();
  });

  it('stopRecording 应显式解绑 processorNode 与 workletNode 的事件监听器引用', () => {
    const mockWorklet = {
      port: { onmessage: vi.fn() },
      disconnect: vi.fn(),
    };
    const mockProcessor = {
      onaudioprocess: vi.fn(),
      disconnect: vi.fn(),
    };

    (service as any).workletNode = mockWorklet;
    (service as any).processorNode = mockProcessor;

    service.stopRecording();

    expect(mockWorklet.port.onmessage).toBeNull();
    expect(mockWorklet.disconnect).toHaveBeenCalled();
    expect((service as any).workletNode).toBeNull();

    expect(mockProcessor.onaudioprocess).toBeNull();
    expect(mockProcessor.disconnect).toHaveBeenCalled();
    expect((service as any).processorNode).toBeNull();
  });

  it('cleanup 应调用 stopRecording 并安全释放所有节点与上下文', async () => {
    await service.initAudioContext();
    const stopRecordingSpy = vi.spyOn(service, 'stopRecording');
    expect(() => service.cleanup()).not.toThrow();
    expect(stopRecordingSpy).toHaveBeenCalled();
  });

  it('updateNetworkQuality 在高延迟网络下应自适应提升目标抖动缓冲水位', () => {
    const initialMetrics = service.getJitterMetrics();
    expect(initialMetrics.targetSec).toBe(0.06);

    // 中等网络时延 (150ms)
    service.updateNetworkQuality(150);
    expect(service.getJitterMetrics().targetSec).toBe(0.08);

    // 恶劣/跨网段高时延 (260ms)
    service.updateNetworkQuality(260);
    expect(service.getJitterMetrics().targetSec).toBe(0.1);
  });

  it('setupWebRtcRemoteStream 应仅将 remoteMediaStreamSource 接入 speakerAnalyserNode，严禁连入 outputGainNode 造成双重出声与混响', async () => {
    const ctx = await service.initAudioContext();
    const mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    (ctx as any).createMediaStreamSource = vi.fn().mockReturnValue(mockSourceNode);

    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    await service.setupWebRtcRemoteStream(mockStream);

    const outputGain = (service as any).outputGainNode;
    const speakerAnalyser = (service as any).speakerAnalyserNode;

    // 核心断言：必须连接 speakerAnalyserNode 供 RMS / 插话检测读取
    expect(mockSourceNode.connect).toHaveBeenCalledWith(speakerAnalyser);
    // 核心断言：严禁连接 outputGainNode，避免经过 compressorNode 重复输出到 destination 形成混响
    expect(mockSourceNode.connect).not.toHaveBeenCalledWith(outputGain);
  });
});
