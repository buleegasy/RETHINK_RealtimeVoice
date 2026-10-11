import React from 'react';
import { GitCommit, Lock, History, ShieldAlert, Cpu } from 'lucide-react';
import { useTelemetryStore } from '../../../store/telemetryStore';

const CBT_STAGES = [
  {
    id: 'Pre_Info_Collection',
    label: '阶段 0: 信息建档',
    short: '信息建档',
    desc: '采集姓名与基础背景',
  },
  {
    id: 'Active_Listening',
    label: '阶段 1: 积极倾听',
    short: '积极倾听',
    desc: '接纳情绪建立安全同盟',
  },
  {
    id: 'CBT_Stripping',
    label: '阶段 2: ABC事实剥离',
    short: 'ABC剥离',
    desc: '区分激活事件与自动化思维',
  },
  {
    id: 'Socratic_Questioning',
    label: '阶段 3: 苏格拉底提问',
    short: '苏格拉底提问',
    desc: '反思认知扭曲探索替代方案',
  },
];

export const CbtFsmDiagnosticsPanel: React.FC = () => {
  const cbtFsmState = useTelemetryStore((s) => s.cbtFsmState);
  const activeCbtStage = useTelemetryStore((s) => s.activeCbtStage);

  const currentStage = cbtFsmState.stage || activeCbtStage;
  const valence = cbtFsmState.emotionalValence ?? 0.0;
  const exposure = cbtFsmState.cognitiveExposure ?? 0.0;
  const isLocked =
    cbtFsmState.isEmotionallyLocked || (currentStage === 'Active_Listening' && valence < -0.3);

  // 效价条位置百分比 (-1.0 -> 0%, 0.0 -> 50%, 1.0 -> 100%)
  const valencePct = Math.max(0, Math.min(100, Math.round(((valence + 1) / 2) * 100)));
  const exposurePct = Math.max(0, Math.min(100, Math.round(exposure * 100)));

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full overflow-y-auto pr-1">
      {/* 1. 4 阶段推进拓扑与危机节点 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 shadow-lg shrink-0">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              CBT 状态机流转拓扑 (Cognitive State Machine)
            </span>
          </div>
          <span className="text-[10px] font-mono text-cyan-300">
            已停留: {cbtFsmState.turnsInStage} 轮 / 总 {cbtFsmState.totalTurns} 轮
          </span>
        </div>

        {/* 阶段管线可视化 */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CBT_STAGES.map((s, idx) => {
            const isActive = currentStage === s.id;
            return (
              <div
                key={s.id}
                className={`p-2 rounded border text-center transition relative ${
                  isActive
                    ? 'bg-cyan-950/60 border-cyan-500 shadow-md shadow-cyan-950/50'
                    : 'bg-slate-950/40 border-slate-800/80 opacity-70'
                }`}
              >
                <div className="text-[10px] font-mono text-slate-400 flex items-center justify-center gap-1">
                  <span>STEP {idx}</span>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  )}
                </div>
                <div
                  className={`text-xs font-semibold mt-0.5 truncate ${
                    isActive ? 'text-cyan-300' : 'text-slate-300'
                  }`}
                >
                  {s.short}
                </div>
                <div className="text-[9px] text-slate-500 mt-1 truncate">{s.desc}</div>
              </div>
            );
          })}
        </div>

        {/* 危机终态警示条 */}
        {currentStage === 'Crisis_Escalation' && (
          <div className="mt-2.5 p-2 rounded bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>已触发单向危机吸收终态 (Crisis_Escalation)，全双工连接与麦克风已闭环切断。</span>
          </div>
        )}
      </div>

      {/* 2. 情绪效价与认知暴露度动力学仪表盘 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 shadow-lg shrink-0 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-200">
              情绪效价与暴露度动力学 (Dynamics & Watchdog)
            </span>
          </div>
          {isLocked && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-700/60 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              负向锁定
            </span>
          )}
        </div>

        {/* 情绪效价标尺 (-1.0 ~ +1.0) */}
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span>情绪效价 (Emotional Valence)</span>
            <span
              className={`font-bold ${
                valence < -0.3
                  ? 'text-rose-400'
                  : valence > 0.3
                    ? 'text-emerald-400'
                    : 'text-amber-400'
              }`}
            >
              {valence.toFixed(2)}
            </span>
          </div>
          <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            {/* 负极性锁定警戒线 (-0.3 对应 35%) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
              style={{ left: '35%' }}
              title="负向情绪锁定警戒阈值 (-0.3)"
            />
            {/* 游标指示 */}
            <div
              className={`h-full transition-all duration-150 ${
                valence < -0.3 ? 'bg-rose-500' : valence > 0.3 ? 'bg-emerald-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${valencePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
            <span>-1.00 (极度负向)</span>
            <span className="text-rose-400">-0.30 (锁定线)</span>
            <span>0.00 (中性)</span>
            <span>+1.00 (积极)</span>
          </div>
          {isLocked && (
            <div className="mt-1 text-[11px] text-rose-300 bg-rose-950/40 p-1.5 rounded border border-rose-900/60 flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-rose-400 shrink-0" />
              <span>
                来访者情绪极度低落 (&lt; -0.3)，状态机强制锁定积极倾听阶段，阻止过早推进 ABC 剥离。
              </span>
            </div>
          )}
        </div>

        {/* 认知暴露度推进条 (0.0 ~ 1.0) */}
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
            <span>认知暴露度 (Cognitive Exposure)</span>
            <span className="text-indigo-300 font-bold">{(exposure * 100).toFixed(0)}%</span>
          </div>
          <div className="relative w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            {/* 门槛线: 0.4 (40%) ABC 剥离门槛 */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-indigo-500 z-10"
              style={{ left: '40%' }}
              title="ABC剥离准入门槛 (0.4)"
            />
            {/* 门槛线: 0.7 (70%) 苏格拉底准入门槛 */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 z-10"
              style={{ left: '70%' }}
              title="苏格拉底提问准入门槛 (0.7)"
            />
            <div
              className="h-full bg-indigo-500 transition-all duration-150"
              style={{ width: `${exposurePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
            <span>0%</span>
            <span className="text-indigo-400">40% (ABC剥离线)</span>
            <span className="text-emerald-400">70% (苏格拉底线)</span>
            <span>100%</span>
          </div>
        </div>

        {/* 看门狗与防振荡冷却 */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-[10px] text-slate-400">防振荡冷却剩余</div>
            <div className="text-base font-bold text-slate-200 mt-0.5">
              {cbtFsmState.fallbackCooldown > 0
                ? `${cbtFsmState.fallbackCooldown} 轮`
                : '无冷却 (平稳)'}
            </div>
          </div>
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
            <div className="text-[10px] text-slate-400">自适应流转判定</div>
            <div className="text-base font-bold text-cyan-300 mt-0.5">
              {isLocked ? '倾听防护中' : '暴露度就绪'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. 状态机跃迁历史流水 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 shadow-lg flex-1 min-h-[160px] flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-200">
              状态机跃迁流水 (Transition History)
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            跃迁次数: {cbtFsmState.history?.length || 0}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-2 space-y-1.5">
          {cbtFsmState.history && cbtFsmState.history.length > 0 ? (
            cbtFsmState.history.map((record, idx) => (
              <div
                key={idx}
                className="p-2 rounded bg-slate-950/60 border border-slate-800/80 text-[11px] font-mono flex flex-col gap-1"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="text-cyan-400 font-bold">{record.from}</span>
                    <span>&rarr;</span>
                    <span className="text-emerald-400 font-bold">{record.to}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {new Date(record.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {record.reason && (
                  <div className="text-[10px] text-slate-400">原因: {record.reason}</div>
                )}
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-6">
              <span>暂无状态跃迁流水</span>
              <span className="text-[10px] text-slate-600 mt-1">
                对话轮次推进且满足情绪效价与认知暴露度后将自动触发跃迁
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
