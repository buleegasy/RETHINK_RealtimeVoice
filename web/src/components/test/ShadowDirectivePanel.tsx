import React, { useState } from 'react';
import { Cpu, Sparkles } from 'lucide-react';
import { useTelemetryStore } from '../../store/telemetryStore';

export const ShadowDirectivePanel: React.FC = () => {
  const latestShadowDirective = useTelemetryStore((s) => s.latestShadowDirective);
  const shadowDirectives = useTelemetryStore((s) => s.shadowDirectives);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);

  const activeDirective = selectedTurnId
    ? shadowDirectives.find((d) => d.id === selectedTurnId) || latestShadowDirective
    : latestShadowDirective;

  return (
    <div className="flex-1 min-h-0 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-col overflow-hidden shadow-xl">
      <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">
            影子大脑动态注入看板 (Injected Directives)
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          {activeDirective && (
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              轮次 #{activeDirective.turnSequence}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            耗时: {activeDirective?.durationMs ? `${activeDirective.durationMs}ms` : '--'}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 overflow-y-auto space-y-4">
        {activeDirective ? (
          <>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>来访学生发言输入 (User Utterance):</span>
              </div>
              <div className="p-3 rounded bg-slate-950/70 border border-slate-800/80 text-sm text-cyan-200 font-mono leading-relaxed">
                {activeDirective.userText || '(空白输入)'}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>动态注入认知指导词 (Injected Cognitive Directive):</span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded border ${
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
                  <span className="text-slate-500 italic">
                    本轮推理未产出特定认知指导，采用全局系统准则流式响应
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-2 py-12">
            <Cpu className="w-8 h-8 text-slate-700 animate-pulse" />
            <span>等待开始通话或学生发言...</span>
            <span className="text-[11px] text-slate-600 text-center max-w-sm">
              学生开口说话停顿后，影子大脑将在 800ms 内推理并在此实时展示注入提示词
            </span>
          </div>
        )}

        {shadowDirectives.length > 1 && (
          <div className="pt-2 border-t border-slate-800/60">
            <div className="text-[11px] text-slate-400 mb-2 font-mono">
              历史注入轮次索引 (点击切换详情):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {shadowDirectives.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedTurnId(d.id)}
                  className={`px-2.5 py-1 rounded text-xs font-mono border transition cursor-pointer ${
                    selectedTurnId === d.id ||
                    (!selectedTurnId && d.id === latestShadowDirective?.id)
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
      </div>
    </div>
  );
};
