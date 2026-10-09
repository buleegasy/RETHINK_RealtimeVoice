import React from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { CBT_CATEGORIES, CbtCapsuleItem } from '../../data/cbtCapsules';

interface CapsulesTabViewProps {
  categories: typeof CBT_CATEGORIES;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  searchKeyword: string;
  onSearchChange: (kw: string) => void;
  capsules: CbtCapsuleItem[];
  selectedCapsuleId: string | null;
  onSelectCapsule: (id: string | null) => void;
}

export const CapsulesTabView: React.FC<CapsulesTabViewProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  searchKeyword,
  onSearchChange,
  capsules,
  selectedCapsuleId,
  onSelectCapsule,
}) => {
  return (
    <div className="space-y-3">
      {/* 搜索与分类过滤器 */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索 16 组 CBT 策略 (如 考砸、喘不上气、自责、讨好)..."
            className="w-full bg-slate-950/70 border border-slate-800 rounded px-8 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => onSelectCategory(cat.key)}
              className={`px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap cursor-pointer transition ${
                selectedCategory === cat.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 胶囊卡片列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {capsules.map((capsule) => {
          const isExpanded = selectedCapsuleId === capsule.id;
          return (
            <div
              key={capsule.id}
              onClick={() => onSelectCapsule(isExpanded ? null : capsule.id)}
              className={`p-3 rounded-lg border transition cursor-pointer ${
                isExpanded
                  ? 'bg-slate-950 border-indigo-500/60 shadow-md'
                  : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {capsule.categoryLabel}
                  </span>
                  <h3 className="text-xs font-semibold text-slate-200 mt-1">{capsule.title}</h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {isExpanded ? '收起' : '详情'}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {capsule.keywords.slice(0, 4).map((kw) => (
                  <span
                    key={kw}
                    className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800/80 text-cyan-300 border border-slate-700/50"
                  >
                    #{kw}
                  </span>
                ))}
              </div>

              <div className="mt-2 text-xs text-slate-300 leading-relaxed font-sans">
                {capsule.content}
              </div>

              {isExpanded && (
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 block mb-0.5">
                      同理心共情示范 (Empathy Lead):
                    </span>
                    <p className="text-emerald-200/90 bg-emerald-950/20 p-2 rounded border border-emerald-500/20">
                      “{capsule.empathyLead}”
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-mono text-cyan-400 block mb-0.5">
                      苏格拉底反问引导 (Socratic Pivot):
                    </span>
                    <p className="text-cyan-200/90 bg-cyan-950/20 p-2 rounded border border-cyan-500/20">
                      “{capsule.socraticPivot}”
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-rose-300">
                    <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                    <span>严禁生硬说教：“{capsule.tabooPhrases.join('”、“')}”</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
