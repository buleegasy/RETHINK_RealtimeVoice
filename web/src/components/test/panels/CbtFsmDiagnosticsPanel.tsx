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

function getValenceTextColor(valence: number): string {
  if (valence < -0.3) return 'text-rose-400';
  if (valence > 0.3) return 'text-emerald-400';
  return 'text-amber-400';
}

function getValenceBarColor(valence: number): string {
  if (valence < -0.3) return 'bg-rose-500';
  if (valence > 0.3) return 'bg-emerald-500';
  return 'bg-cyan-500';
}

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
    <div className="flex flex-col gap-2.5 min-h-0 h-full overflow-y-auto pr-0.5 font-mono select-none">
      {/* 1. 4 阶段推进拓扑与危机节点 */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-md p-2.5 shrink-0">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">
              CBT 状态机流转拓扑 (Cognitive State Machine)
            </span>
          </div>
          <span className="text-[10px] text-cyan-300">
            停留 {cbtFsmState.turnsInStage} 轮 / 总 {cbtFsmState.totalTurns} 轮
          </span>
        </div>

        {/* 阶段管线可视化 (极简紧凑 4 列横排) */}
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {CBT_STAGES.map((s, idx) => {
            const isActive = currentStage === s.id;
            return (
              <div
                key={s.id}
                className={`p-1.5 rounded border text-center transition ${
                  isActive
                    ? 'bg-cyan-950/80 border-cyan-500 shadow-sm shadow-cyan-950'
                    : 'bg-slate-900/60 border-slate-800 opacity-70'
                }`}
              >
                <div className="text-[9px] text-slate-400 flex items-center justify-center gap-1">
                  <span>STEP {idx}</span>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                </div>
                <div
                  className={`text-xs font-semibold mt-0.5 truncate ${
                    isActive ? 'text-cyan-300' : 'text-slate-300'
                  }`}
                >
                  {s.short}
                </div>
              </div>
            );
          })}
        </div>

        {/* 危机终态警示条 */}
        {currentStage === 'Crisis_Escalation' && (
          <div className="mt-2 p-1.5 rounded bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>危机吸收终态已激活，全双工连接与麦克风已闭环截断。</span>
          </div>
        )}
      </div>

      {/* 2. 情绪效价与认知暴露度动力学仪表盘 */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-md p-2.5 shrink-0 space-y-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <GitCommit className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-200">
              情绪效价与暴露度动力学 (Dynamics & Watchdog)
            </span>
          </div>
          {isLocked && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800/60 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              负向锁定
            </span>
          )}
        </div>

        {/* 情绪效价标尺 (-1.0 ~ +1.0) */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>情绪效价 (Valence)</span>
            <span className={`font-bold ${getValenceTextColor(valence)}`}>
              {valence.toFixed(2)}
            </span>
          </div>
          <div className="relative w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
              style={{ left: '35%' }}
              title="锁定阈值 (-0.3)"
            />
            <div
              className={`h-full transition-all duration-150 ${getValenceBarColor(valence)}`}
              style={{ width: `${valencePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-500 mt-0.5">
            <span>-1.00</span>
            <span className="text-rose-400">-0.30 警戒</span>
            <span>0.00</span>
            <span>+1.00</span>
          </div>
          {isLocked && (
            <div className="mt-1 text-[11px] text-rose-300 bg-rose-950/60 p-1.5 rounded border border-rose-800/60 flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-rose-400 shrink-0" />
              <span>低落保护：状态机强制锁定积极倾听阶段。</span>
            </div>
          )}
        </div>

        {/* 认知暴露度推进条 (0.0 ~ 1.0) */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>认知暴露度 (Exposure)</span>
            <span className="text-indigo-300 font-bold">{(exposure * 100).toFixed(0)}%</span>
          </div>
          <div className="relative w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-indigo-500 z-10"
              style={{ left: '40%' }}
              title="ABC剥离 (0.4)"
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 z-10"
              style={{ left: '70%' }}
              title="苏格拉底 (0.7)"
            />
            <div
              className="h-full bg-indigo-500 transition-all duration-150"
              style={{ width: `${exposurePct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-500 mt-0.5">
            <span>0%</span>
            <span className="text-indigo-400">40% ABC</span>
            <span className="text-emerald-400">70% 质辩</span>
            <span>100%</span>
          </div>
        </div>

        {/* 看门狗与防振荡冷却指标 */}
        <div className="grid grid-cols-2 gap-1.5 text-xs pt-0.5">
          <div className="p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">防振荡冷却</span>
            <span className="text-xs font-bold text-slate-200">
              {cbtFsmState.fallbackCooldown > 0 ? `${cbtFsmState.fallbackCooldown} 轮` : '平稳'}
            </span>
          </div>
          <div className="p-1.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">流转状态</span>
            <span className="text-xs font-bold text-cyan-300">
              {isLocked ? '倾听锁定' : '就绪'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. 状态机跃迁历史流水 */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-md p-2.5 flex-1 min-h-[140px] flex flex-col">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-200">状态机跃迁流水</span>
          </div>
          <span className="text-[10px] text-slate-500">
            记录 {cbtFsmState.history?.length || 0}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-1.5 space-y-1">
          {cbtFsmState.history && cbtFsmState.history.length > 0 ? (
            cbtFsmState.history.map((record) => (
              <div
                key={`${record.from}-${record.to}-${record.timestamp}`}
                className="p-1.5 rounded bg-slate-900/60 border border-slate-800 text-[10px] flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-cyan-400 font-bold">{record.from}</span>
                  <span>&rarr;</span>
                  <span className="text-emerald-400 font-bold">{record.to}</span>
                  {record.reason && <span className="text-slate-500 ml-1">({record.reason})</span>}
                </div>
                <span className="text-[9px] text-slate-500">
                  {new Date(record.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-4">
              <span>暂无状态跃迁流水</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
