import React from 'react';
import { Radio, Sliders, Volume2, Zap } from 'lucide-react';
import { useTelemetryStore } from '../../../store/telemetryStore';

export const AcousticDiagnosticsPanel: React.FC = () => {
  const jitter = useTelemetryStore((s) => s.jitter);
  const inputAudioLevel = useTelemetryStore((s) => s.inputAudioLevel);
  const outputAudioLevel = useTelemetryStore((s) => s.outputAudioLevel);
  const rttMs = useTelemetryStore((s) => s.rttMs);
  const avgRttMs = useTelemetryStore((s) => s.avgRttMs);
  const ttftMs = useTelemetryStore((s) => s.ttftMs);
  const totalAudioChunks = useTelemetryStore((s) => s.totalAudioChunks);
  const totalBargeIns = useTelemetryStore((s) => s.totalBargeIns);
  const activeTransport = useTelemetryStore((s) => s.activeTransport);

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full overflow-y-auto pr-1">
      {/* 1. 音频抖动缓冲深度看板 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 shadow-lg shrink-0">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">
              音频抖动缓冲与流式播发 (Jitter Buffer)
            </span>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              activeTransport === 'webrtc'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {activeTransport === 'webrtc' ? 'WebRTC (UDP/Opus)' : 'WebSocket (TCP/PCM16)'}
          </span>
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
              <span>当前缓冲水位 (Buffered Duration)</span>
              <span className="text-emerald-300 font-bold">{jitter.bufferedMs} ms</span>
            </div>
            <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-100 ${
                  jitter.bufferedMs >= Math.round(jitter.targetSec * 1000)
                    ? 'bg-emerald-500'
                    : jitter.bufferedMs >= Math.round(jitter.rebufferSec * 1000)
                      ? 'bg-cyan-500'
                      : 'bg-amber-500'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (jitter.bufferedMs / Math.max(80, Math.round(jitter.targetSec * 2000))) * 100,
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>0ms (枯竭)</span>
              <span className="text-amber-400">
                {Math.round(jitter.rebufferSec * 1000)}ms (再缓冲)
              </span>
              <span className="text-emerald-400">
                {Math.round(jitter.targetSec * 1000)}ms (目标水位)
              </span>
              <span>{Math.round(jitter.targetSec * 2000)}ms+</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400">
                {activeTransport === 'webrtc' ? '传输通道' : '排队 PCM 分片'}
              </div>
              <div className="text-sm font-bold text-slate-200 mt-0.5">
                {activeTransport === 'webrtc' ? 'UDP / SRTP' : `${jitter.queuedBuffers} 块`}
              </div>
            </div>
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400">
                {activeTransport === 'webrtc' ? '音频渲染器' : 'AudioContext 在播源'}
              </div>
              <div className="text-sm font-bold text-slate-200 mt-0.5">
                {activeTransport === 'webrtc'
                  ? 'HTMLAudio 硬件直通'
                  : `${jitter.scheduledCount} 轨`}
              </div>
            </div>
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400">目标缓冲时长</div>
              <div className="text-sm font-bold text-slate-200 mt-0.5">
                {Math.round(jitter.targetSec * 1000)} ms
              </div>
            </div>
            <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400">再缓冲警戒水位</div>
              <div className="text-sm font-bold text-slate-200 mt-0.5">
                {Math.round(jitter.rebufferSec * 1000)} ms
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 实时电平与音频链路 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 shadow-lg shrink-0">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              I/O 实时电平监视器 (RMS VU Meters)
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {activeTransport === 'webrtc' ? 'WebRTC Opus 48kHz (硬件AEC)' : '24kHz 16bit PCM'}
          </span>
        </div>

        <div className="mt-3 space-y-2.5 font-mono text-xs">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span>麦克风输入 (User Mic RMS)</span>
              <span className="text-cyan-300">{inputAudioLevel}%</span>
            </div>
            <div className="w-full h-2 bg-slate-950 rounded border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-75"
                style={{ width: `${Math.min(100, inputAudioLevel * 2)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span>扬声器输出 (AI Speaker RMS)</span>
              <span className="text-emerald-300">{outputAudioLevel}%</span>
            </div>
            <div className="w-full h-2 bg-slate-950 rounded border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${Math.min(100, outputAudioLevel * 2)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. 链路网络与交互时延看板 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 shadow-lg flex-1 min-h-[140px]">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-semibold text-slate-200">全双工网络与打断响应指标</span>
          </div>
          <span className="text-[10px] font-mono text-purple-300">
            首帧响应: {ttftMs > 0 ? `${ttftMs}ms` : '--'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-[10px] text-slate-400">往返时延 (RTT)</div>
            <div className="text-base font-bold text-cyan-300 mt-0.5">
              {rttMs > 0 ? `${rttMs} ms` : '--'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              移动均值: {avgRttMs > 0 ? `${avgRttMs}ms` : '--'}
            </div>
          </div>

          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-[10px] text-slate-400">累计吞吐分片</div>
            <div className="text-base font-bold text-slate-200 mt-0.5">{totalAudioChunks} 帧</div>
            <div className="text-[10px] text-slate-500 mt-0.5">直通传输流</div>
          </div>

          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-[10px] text-slate-400">插话打断 (Barge-In)</div>
            <div className="text-base font-bold text-amber-300 mt-0.5 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {totalBargeIns} 次
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">截断延迟: &lt; 50ms</div>
          </div>

          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-[10px] text-slate-400">RTC 通道状态</div>
            <div className="text-base font-bold text-emerald-300 mt-0.5 truncate">
              {activeTransport === 'webrtc' ? 'minimax-events' : 'ws-frame'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">全双工双向</div>
          </div>
        </div>
      </div>
    </div>
  );
};
