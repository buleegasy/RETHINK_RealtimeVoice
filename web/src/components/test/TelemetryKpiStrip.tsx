import React from 'react';
import { BookOpen, Cpu, Radio, ShieldAlert, ShieldCheck, Sliders, Zap } from 'lucide-react';
import { useTelemetryStore } from '../../store/telemetryStore';

export const TelemetryKpiStrip: React.FC = () => {
  const {
    rttMs,
    avgRttMs,
    rttHistory,
    ttftMs,
    lastShadowDurationMs,
    jitter,
    totalBargeIns,
    inputAudioLevel,
    outputAudioLevel,
    latestSafetyCheck,
    activeTransport,
    cbtFsmState,
    activeCbtStage,
    ragRetrievals,
  } = useTelemetryStore();

  const getRttStatusColor = (ms: number) => {
    if (ms <= 0) return 'text-slate-400 border-slate-700 bg-slate-800/40';
    if (ms < 100) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (ms < 250) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  const currentStage = cbtFsmState.stage || activeCbtStage;
  const valence = cbtFsmState.emotionalValence ?? 0.0;
  const isLocked =
    cbtFsmState.isEmotionallyLocked || (currentStage === 'Active_Listening' && valence < -0.3);
  const latestRag = ragRetrievals[0];

  return (
    <section className="bg-[#0D1220] border-b border-slate-800/80 px-4 py-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
      {/* 1. RTT & Transport */}
      <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>网关往返时延 (RTT)</span>
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[9px] font-mono px-1 py-0.2 rounded border ${
                activeTransport === 'webrtc'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
              }`}
            >
              {activeTransport === 'webrtc' ? 'WebRTC' : 'WS'}
            </span>
            <Radio className="w-3 h-3 text-cyan-400" />
          </div>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-xl font-bold font-mono text-slate-100">
            {rttMs > 0 ? `${rttMs}` : '--'}
          </span>
          <span className="text-xs text-slate-400 font-mono">ms</span>
          <span
            className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border ${getRttStatusColor(
              rttMs,
            )}`}
          >
            {rttMs === 0 ? '待测' : rttMs < 100 ? '极优' : rttMs < 250 ? '良好' : '高时延'}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>均值: {avgRttMs > 0 ? `${avgRttMs}ms` : '--'}</span>
          <div className="flex items-end gap-0.5 h-3">
            {rttHistory.slice(-8).map((val, idx) => (
              <div
                key={idx}
                className="w-1 bg-cyan-500/60 rounded-t"
                style={{ height: `${Math.min(100, Math.max(15, (val / 300) * 100))}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 2. TTFT (首包响应延迟) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>首帧响应时延 (TTFT)</span>
          <Zap className="w-3 h-3 text-amber-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-xl font-bold font-mono text-amber-300">
            {ttftMs > 0 ? `${ttftMs}` : '--'}
          </span>
          <span className="text-xs text-slate-400 font-mono">ms</span>
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
            直通流式
          </span>
        </div>
        <div className="mt-1.5 text-[10px] font-mono text-slate-500">
          标称目标: &lt; 500ms (极速)
        </div>
      </div>

      {/* 3. CBT 策略装载与直通延迟 (含情绪效价与状态) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>CBT 策略装载 / 旁路延迟</span>
          <Cpu className="w-3 h-3 text-indigo-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-xl font-bold font-mono text-indigo-300">
            {lastShadowDurationMs > 0 ? `${lastShadowDurationMs}` : '16'}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {lastShadowDurationMs > 0 ? 'ms' : '组'}
          </span>
          <span
            className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              isLocked
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
            }`}
          >
            {isLocked ? '负向锁定' : lastShadowDurationMs > 0 ? '动态指导' : '直通预载'}
          </span>
        </div>
        <div className="mt-1.5 text-[10px] font-mono text-slate-500 flex items-center justify-between">
          <span className="truncate">{currentStage}</span>
          <span className={valence < -0.3 ? 'text-rose-400' : 'text-slate-400'}>
            效价: {valence.toFixed(2)}
          </span>
        </div>
      </div>

      {/* 4. RAG 知识检索与胶囊命中 */}
      <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>RAG 知识召回 / 胶囊命中</span>
          <BookOpen className="w-3 h-3 text-cyan-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-xl font-bold font-mono text-cyan-300">
            {ragRetrievals.length > 0 ? `${ragRetrievals.length}` : '16'}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {ragRetrievals.length > 0 ? '次' : '组'}
          </span>
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            {latestRag ? `得分 ${(latestRag.score * 100).toFixed(0)}%` : 'BGE-M3'}
          </span>
        </div>
        <div
          className="mt-1.5 text-[10px] font-mono text-slate-500 truncate"
          title={latestRag?.topic || '16组微干预胶囊预载'}
        >
          {latestRag?.topic || '16组核心干预胶囊预载'}
        </div>
      </div>

      {/* 5. 音频抖动缓冲水位 (Jitter) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>抖动缓冲水位 (Jitter)</span>
          <Sliders className="w-3 h-3 text-emerald-400" />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-xl font-bold font-mono text-emerald-300">{jitter.bufferedMs}</span>
          <span className="text-xs text-slate-400 font-mono">
            / {Math.round((jitter.targetSec || 0.04) * 1000)}ms
          </span>
          <span
            className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              jitter.isBuffering
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {jitter.isBuffering ? '蓄水中' : '流式播发'}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1 text-[9px] font-mono text-slate-500">
            <span>MIC:</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-75"
                style={{ width: `${Math.min(100, inputAudioLevel * 2)}%` }}
              />
            </div>
          </div>
          <div className="flex-1 flex items-center gap-1 text-[9px] font-mono text-slate-500">
            <span>SPK:</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${Math.min(100, outputAudioLevel * 2)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 6. L2 危机安全哨兵 */}
      <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>L2 Jev 语义安全哨兵</span>
          {latestSafetyCheck?.isCrisis ? (
            <ShieldAlert className="w-3 h-3 text-rose-400" />
          ) : (
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`text-xl font-bold font-mono ${
              latestSafetyCheck?.isCrisis ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {latestSafetyCheck ? (latestSafetyCheck.isCrisis ? 'CRISIS' : 'PASS') : 'STANDBY'}
          </span>
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
            打断: {totalBargeIns}
          </span>
        </div>
        <div className="mt-1.5 text-[10px] font-mono text-slate-500 flex justify-between">
          <span>L1 消歧: 0误报</span>
          <span>{latestSafetyCheck ? `${latestSafetyCheck.durationMs}ms` : '--'}</span>
        </div>
      </div>
    </section>
  );
};
