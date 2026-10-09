import React from 'react';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { CORE_SYSTEM_GUIDELINES } from '../../data/cbtCapsules';

interface DirectivesTabViewProps {
  activeDirective: ReturnType<typeof useTelemetryStore.getState>['latestShadowDirective'];
  shadowDirectives: ReturnType<typeof useTelemetryStore.getState>['shadowDirectives'];
  selectedTurnId: string | null;
  onSelectTurn: (id: string | null) => void;
  isConnected: boolean;
}

export const DirectivesTabView: React.FC<DirectivesTabViewProps> = ({
  activeDirective,
  shadowDirectives,
  selectedTurnId,
  onSelectTurn,
  isConnected,
}) => {
  return (
    <div className="space-y-4">
      {/* 链路与直通就绪横幅 */}
      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
          />
          <span className="font-mono text-slate-300">
            {isConnected ? '全双工 Live-1 直通流式就绪' : '直通网关处于待机就绪态'}
          </span>
        </div>
        <span className="text-[11px] font-mono text-cyan-400">
          零旁路推演延迟 · 首包目标 &lt; 500ms
        </span>
      </div>

      {/* 实时动态指令卡片 */}
      {activeDirective ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>来访学生发言输入 (User Utterance):</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                轮次 #{activeDirective.turnSequence}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                耗时: {activeDirective.durationMs ? `${activeDirective.durationMs}ms` : '--'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded bg-slate-950/70 border border-slate-800/80 text-sm text-cyan-200 font-mono leading-relaxed">
            {activeDirective.userText || '(空白输入)'}
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span>动态注入认知指导词 (Injected Cognitive Directive):</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  activeDirective.fallback
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                {activeDirective.fallback ? '降级兜底' : '精准引导'}
              </span>
            </div>

            <div className="p-3.5 rounded bg-indigo-950/30 border border-indigo-500/30 text-indigo-100 text-sm leading-relaxed whitespace-pre-wrap font-sans">
              {activeDirective.cognitiveHint ? (
                activeDirective.cognitiveHint
              ) : (
                <span className="text-slate-500 italic">本轮直接应用全局预载 CBT 准则流式响应</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-indigo-950/20 border border-indigo-500/30 text-xs text-indigo-200/90 leading-relaxed flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-indigo-200">直通 Live-1 心理陪伴模式已全面生效</div>
            <div className="text-slate-400">
              16 组核心 CBT 心理干预应对策略与学生档案情景记忆已在建联阶段一次性注入系统提示词。
              通话中由 Live-1 直接流式生成，无需等待阻塞式推演，首包端到端延迟低至毫秒级。
            </div>
          </div>
        </div>
      )}

      {/* 历史轮次索引 */}
      {shadowDirectives.length > 1 && (
        <div className="pt-2 border-t border-slate-800/60">
          <div className="text-[11px] text-slate-400 mb-2 font-mono flex items-center justify-between">
            <span>历史指令轮次 (点击切换查看):</span>
            <span className="text-slate-500">共 {shadowDirectives.length} 轮</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {shadowDirectives.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelectTurn(d.id)}
                className={`px-2 py-0.5 rounded text-xs font-mono border transition cursor-pointer ${
                  selectedTurnId === d.id || (!selectedTurnId && d.id === activeDirective?.id)
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                T#{d.turnSequence} ({d.durationMs}ms)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 实时生效的 5 大极简同伴准则卡片 */}
      <div className="pt-3 border-t border-slate-800/60 space-y-2">
        <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>实时生效系统提示词准则 (Live Instructions Invariant):</span>
          </span>
          <span className="text-[10px] text-cyan-400">极简 30 字口语律</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {CORE_SYSTEM_GUIDELINES.map((guide) => (
            <div
              key={guide.id}
              className="p-2.5 rounded bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">{guide.title}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300">
                  {guide.summary}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{guide.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
