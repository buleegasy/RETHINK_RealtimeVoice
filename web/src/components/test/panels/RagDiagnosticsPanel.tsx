import React, { useState } from 'react';
import { BookOpen, Search, Sparkles, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTelemetryStore, type RagRetrievalLog } from '../../../store/telemetryStore';
import { DefaultRagProvider } from '../../../lib/pipelines/rag/defaultRagProvider';
import { FALLBACK_KNOWLEDGE } from '../../../lib/pipelines/rag/fallbackKnowledge';

const PRESET_QUERIES = [
  { label: '过度通气', text: '大口喘气胸闷憋气过度通气' },
  { label: '心慌手抖', text: '手抖身体发抖心跳过速' },
  { label: '考前灾难化', text: '月考成绩差模拟考考砸了考不上大学' },
  { label: '寝室排挤', text: '宿舍寝室大家都不理我被排挤孤立了' },
  { label: '拖延瘫痪', text: '不想学学不进去作业太多烦躁做不完' },
];

export const RagDiagnosticsPanel: React.FC = () => {
  const ragRetrievals = useTelemetryStore((s) => s.ragRetrievals);
  const addRagRetrieval = useTelemetryStore((s) => s.addRagRetrieval);

  const [sandboxInput, setSandboxInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<RagRetrievalLog | null>(null);

  const ragProvider = React.useMemo(() => new DefaultRagProvider(), []);

  const handleRunSandboxQuery = async (queryText: string) => {
    const text = queryText.trim();
    if (!text) return;
    setIsSearching(true);
    const startTime = Date.now();
    try {
      const chunks = await ragProvider.retrieve(text, { topK: 2 });
      const durationMs = Date.now() - startTime;
      const top = chunks[0];
      const logItem: Omit<RagRetrievalLog, 'id'> = {
        query: text,
        status: chunks.length > 0 ? 'matched' : 'no_relevant_context',
        score: top?.score || 0,
        topic: top?.title,
        category: top?.category,
        empathyLead: top?.empathyLead,
        socraticPivot: top?.socraticPivot,
        tabooPhrases: top?.tabooPhrases,
        conciseDirective: ragProvider.formatContext(chunks),
        durationMs,
        timestamp: Date.now(),
        source: 'manual_test',
      };
      addRagRetrieval(logItem);
      setSelectedLog({ ...logItem, id: `test_${Date.now()}` });
    } finally {
      setIsSearching(false);
    }
  };

  const filteredCapsules = React.useMemo(() => {
    if (activeCategoryFilter === 'all') return FALLBACK_KNOWLEDGE;
    return FALLBACK_KNOWLEDGE.filter((c) => c.category === activeCategoryFilter);
  }, [activeCategoryFilter]);

  return (
    <div className="flex flex-col gap-2.5 min-h-0 h-full overflow-y-auto pr-0.5 font-mono select-none">
      {/* 1. 交互式 RAG 评测沙盒 */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-md p-2.5 shrink-0">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">交互式 RAG 靶向评测沙盒</span>
          </div>
          <span className="text-[10px] text-cyan-300 bg-cyan-950 px-1.5 py-0.2 rounded border border-cyan-800/60">
            16 组 CBT 胶囊
          </span>
        </div>

        <div className="mt-2 space-y-2">
          {/* 预设典型用例按钮组 */}
          <div className="flex flex-wrap items-center gap-1">
            {PRESET_QUERIES.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setSandboxInput(p.text);
                  handleRunSandboxQuery(p.text);
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 输入框与检索触发 */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={sandboxInput}
              onChange={(e) => setSandboxInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunSandboxQuery(sandboxInput)}
              placeholder="输入来访学生诉求（回车快速检索）..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 h-7 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60"
            />
            <button
              type="button"
              onClick={() => handleRunSandboxQuery(sandboxInput)}
              disabled={isSearching || !sandboxInput.trim()}
              className="flex items-center gap-1 px-2.5 h-7 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Search className="w-3 h-3" />
              <span>{isSearching ? '检索中' : '测试检索'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. 实时会话 RAG 召回命中流 */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-md p-2.5 flex-1 min-h-[190px] flex flex-col">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-200">会话 RAG 召回流</span>
          </div>
          <span className="text-[10px] text-slate-500">命中记录 {ragRetrievals.length} 条</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-2 space-y-1.5">
          {ragRetrievals.length > 0 ? (
            ragRetrievals.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedLog(item)}
                className={`p-2 rounded border text-xs cursor-pointer transition ${
                  selectedLog?.id === item.id
                    ? 'bg-indigo-950/40 border-indigo-700/60'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1 py-0.2 rounded border ${
                        item.source === 'live_shadow'
                          ? 'border-indigo-800/60 bg-indigo-950 text-indigo-300'
                          : item.source === 'live_tool'
                            ? 'border-emerald-800/60 bg-emerald-950 text-emerald-300'
                            : 'border-cyan-800/60 bg-cyan-950 text-cyan-300'
                      }`}
                    >
                      {item.source === 'live_shadow'
                        ? '影子注入'
                        : item.source === 'live_tool'
                          ? '工具调用'
                          : '沙盒评测'}
                    </span>
                    {item.turnSequence ? <span>#轮次 {item.turnSequence}</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{item.durationMs}ms</span>
                    <span
                      className={`px-1 py-0.2 rounded font-bold ${
                        item.status === 'matched'
                          ? 'text-emerald-400 bg-emerald-950/60'
                          : 'text-amber-400 bg-amber-950/60'
                      }`}
                    >
                      {item.status === 'matched' ? `${(item.score * 100).toFixed(0)}%` : '未命中'}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-300 truncate mb-1">
                  &ldquo;{item.query}&rdquo;
                </div>

                {item.topic && (
                  <div className="text-xs text-indigo-300 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">{item.topic}</span>
                  </div>
                )}

                {item.empathyLead && (
                  <div className="mt-1 text-[10px] text-slate-400 line-clamp-1 bg-slate-950 p-1 rounded border border-slate-800">
                    <span className="text-slate-500">共情: </span>
                    {item.empathyLead}
                  </div>
                )}

                {item.tabooPhrases && item.tabooPhrases.length > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-300">
                    <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
                    <span>禁语: {item.tabooPhrases.slice(0, 2).join(' / ')}</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-6">
              <span>暂无 RAG 召回流水</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. 16 CBT 胶囊知识库矩阵 */}
      <div className="bg-[#0B0F19] border border-slate-800 rounded-md p-2.5 shrink-0">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-slate-200">CBT 微干预胶囊库</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('all')}
              className={`text-[9px] px-1.5 py-0.2 rounded transition cursor-pointer ${
                activeCategoryFilter === 'all'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              全部 ({FALLBACK_KNOWLEDGE.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('somatic')}
              className={`text-[9px] px-1.5 py-0.2 rounded transition cursor-pointer ${
                activeCategoryFilter === 'somatic'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              躯体化
            </button>
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('academic')}
              className={`text-[9px] px-1.5 py-0.2 rounded transition cursor-pointer ${
                activeCategoryFilter === 'academic'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/60'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              学业人际
            </button>
          </div>
        </div>

        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-32 overflow-y-auto font-sans">
          {filteredCapsules.map((cap) => (
            <div
              key={cap.id}
              onClick={() => {
                setSandboxInput(cap.keywords?.[0] || cap.title);
                handleRunSandboxQuery(cap.keywords?.[0] || cap.title);
              }}
              className="p-1 rounded bg-slate-900/60 border border-slate-800 hover:border-cyan-800 text-[10px] cursor-pointer transition flex items-center gap-1.5"
              title="点击在沙盒中测试此胶囊"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-slate-200 truncate block">{cap.title}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
