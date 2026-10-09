import React from 'react';
import { Activity, Sliders, Volume2 } from 'lucide-react';
import { useTelemetryStore } from '../../store/telemetryStore';

export const AudioDiagnosticsPanel: React.FC = () => {
  const {
    jitter,
    inputAudioLevel,
    outputAudioLevel,
    rttMs,
    avgRttMs,
    ttftMs,
    lastShadowDurationMs,
    totalAudioChunks,
    totalBargeIns,
    latestShadowDirective,
    latestSafetyCheck,
    activeCbtStage,
    duplexPhase,
    isConnected,
  } = useTelemetryStore();

  return (
    <div className="lg:col-span-5 flex flex-col gap-4 min-h-0 h-full">
      {/* 音频抖动缓冲深度看板 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col shadow-xl shrink-0">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              音频抖动缓冲与流式调度 (Jitter Buffer)
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Web Audio API
          </span>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5">
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
                {Math.round(jitter.rebufferSec * 1000)}ms (重缓冲)
              </span>
              <span className="text-emerald-400">
                {Math.round(jitter.targetSec * 1000)}ms (目标水位)
              </span>
              <span>{Math.round(jitter.targetSec * 2000)}ms+</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400">排队 PCM 分片</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">
                {jitter.queuedBuffers} 块
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400">AudioContext 在播源</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">
                {jitter.scheduledCount} 轨
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400">目标缓冲时长</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">
                {Math.round(jitter.targetSec * 1000)} ms
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400">再缓冲警戒水位</div>
              <div className="text-base font-bold text-slate-200 mt-0.5">
                {Math.round(jitter.rebufferSec * 1000)} ms
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 实时电平与音频链路 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col shadow-xl shrink-0">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              I/O 实时电平监视器 (RMS VU Meters)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-400">24kHz 16bit PCM</span>
        </div>

        <div className="mt-4 space-y-3 font-mono text-xs">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span>麦克风输入 (User Mic RMS)</span>
              <span className="text-cyan-300">{inputAudioLevel}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-950 rounded border border-slate-800 overflow-hidden">
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
            <div className="w-full h-2.5 bg-slate-950 rounded border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${Math.min(100, outputAudioLevel * 2)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 系统调试状态与原始遥测帧查看器 */}
      <div className="flex-1 min-h-0 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-col overflow-hidden shadow-xl">
        <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              原始遥测事件帧 (Raw Telemetry Event)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-purple-300">JSON Payload</span>
        </div>

        <div className="flex-1 min-h-0 p-3 overflow-auto bg-slate-950/80 font-mono text-[11px] text-slate-300 leading-relaxed">
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(
              {
                architecture: 'Live-1 Direct + 16 CBT Capsules (TTFT < 500ms)',
                engine: 'DeepSeek V4 Flash',
                postSessionEvaluator: 'DeepSeek V4 Flash',
                gatewayRttMs: rttMs,
                avgRttMs,
                ttftMs,
                lastShadowDurationMs,
                cbtCapsulesPreloaded: 16,
                jitterWatermarkMs: jitter.bufferedMs,
                jitterBuffering: jitter.isBuffering,
                totalAudioChunks,
                totalBargeIns,
                latestShadowDirective: latestShadowDirective || null,
                latestSafetyCheck: latestSafetyCheck || null,
                cbtStage: activeCbtStage,
                duplexPhase,
                wsConnected: isConnected,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    </div>
  );
};
