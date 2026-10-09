import React, { useState } from 'react';
import { Sparkles, BookOpen, UserCheck, Zap } from 'lucide-react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { PRELOADED_CBT_CAPSULES, CBT_CATEGORIES } from '../../data/cbtCapsules';
import { DirectivesTabView } from './DirectivesTabView';
import { CapsulesTabView } from './CapsulesTabView';
import { ProfileTabView } from './ProfileTabView';

type WorkbenchTab = 'directives' | 'capsules' | 'profile';

export const ShadowDirectivePanel: React.FC = () => {
  const latestShadowDirective = useTelemetryStore((s) => s.latestShadowDirective);
  const shadowDirectives = useTelemetryStore((s) => s.shadowDirectives);
  const isConnected = useTelemetryStore((s) => s.isConnected);

  const [activeTab, setActiveTab] = useState<WorkbenchTab>('directives');
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [selectedCapsuleId, setSelectedCapsuleId] = useState<string | null>(null);

  const activeDirective = selectedTurnId
    ? shadowDirectives.find((d) => d.id === selectedTurnId) || latestShadowDirective
    : latestShadowDirective;

  const filteredCapsules = PRELOADED_CBT_CAPSULES.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      !searchKeyword ||
      item.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      item.keywords.some((k) => k.toLowerCase().includes(searchKeyword.toLowerCase())) ||
      item.content.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex-1 min-h-0 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-col overflow-hidden shadow-xl">
      {/* 顶部标签切换栏 */}
      <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">
            Live-1 CBT 认知策略与指令透视
          </h2>
          <span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            直通流式 &lt; 500ms
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('directives')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition ${
              activeTab === 'directives'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>实时指令与准则</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('capsules')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition ${
              activeTab === 'capsules'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-3 h-3" />
            <span>16组CBT策略库</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer transition ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <UserCheck className="w-3 h-3" />
            <span>情景档案与建档</span>
          </button>
        </div>
      </div>

      {/* 主体视窗内容 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {activeTab === 'directives' && (
          <DirectivesTabView
            activeDirective={activeDirective}
            shadowDirectives={shadowDirectives}
            selectedTurnId={selectedTurnId}
            onSelectTurn={setSelectedTurnId}
            isConnected={isConnected}
          />
        )}

        {activeTab === 'capsules' && (
          <CapsulesTabView
            categories={CBT_CATEGORIES}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            searchKeyword={searchKeyword}
            onSearchChange={setSearchKeyword}
            capsules={filteredCapsules}
            selectedCapsuleId={selectedCapsuleId}
            onSelectCapsule={setSelectedCapsuleId}
          />
        )}

        {activeTab === 'profile' && <ProfileTabView />}
      </div>
    </div>
  );
};
