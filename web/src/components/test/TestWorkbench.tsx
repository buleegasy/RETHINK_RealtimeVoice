import React, { useState } from 'react';
import { Activity, BookOpen, Cpu, Sliders } from 'lucide-react';
import { useVoiceSession } from '../../hooks/useVoiceSession';
import { useBoothStore } from '../../store/boothStore';
import { useTelemetryStore } from '../../store/telemetryStore';
import { TelemetryHeader } from './TelemetryHeader';
import { TelemetryKpiStrip } from './TelemetryKpiStrip';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';
import { RagDiagnosticsPanel } from './panels/RagDiagnosticsPanel';
import { CbtFsmDiagnosticsPanel } from './panels/CbtFsmDiagnosticsPanel';
import { AcousticDiagnosticsPanel } from './panels/AcousticDiagnosticsPanel';
import { RawEventsDiagnosticsPanel } from './panels/RawEventsDiagnosticsPanel';

type DiagnosticsTab = 'rag' | 'fsm' | 'acoustic' | 'events';

export const TestWorkbench: React.FC = () => {
  const { startCall, endCall, interrupt, toggleMute } = useVoiceSession();
  const errorMessage = useBoothStore((s) => s.errorMessage);
  const setErrorMessage = useBoothStore((s) => s.setErrorMessage);

  const ragRetrievals = useTelemetryStore((s) => s.ragRetrievals);
  const cbtFsmState = useTelemetryStore((s) => s.cbtFsmState);
  const activeCbtStage = useTelemetryStore((s) => s.activeCbtStage);
  const activeTransport = useTelemetryStore((s) => s.activeTransport);

  const [activeTab, setActiveTab] = useState<DiagnosticsTab>('rag');

  const currentStage = cbtFsmState.stage || activeCbtStage;

  return (
    <div className="w-full h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans overflow-hidden select-none">
      {/* 顶部主控导航条 */}
      <TelemetryHeader
        onStartCall={startCall}
        onEndCall={endCall}
        onInterrupt={interrupt}
        onToggleMute={toggleMute}
      />

      {/* 链路与硬件异常提示条 */}
      {errorMessage && (
        <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-800/60 text-rose-200 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span className="font-mono font-medium text-rose-400">链路状态:</span>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-white px-2 py-0.5 rounded hover:bg-rose-900/50 cursor-pointer text-xs"
          >
            关闭
          </button>
        </div>
      )}

      {/* 关键性能与链路指标 KPI 条 */}
      <TelemetryKpiStrip />

      {/* 主体工作区 (两栏分布) */}
      <div className="flex-1 min-h-0 p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 overflow-hidden">
        {/* 左侧：语音转写双轨实时流 (7 cols) */}
        <div className="lg:col-span-7 flex flex-col min-h-0 h-full">
          <LiveTranscriptPanel />
        </div>

        {/* 右侧：多维遥测工作台套件 (5 cols) */}
        <div className="lg:col-span-5 flex flex-col min-h-0 h-full bg-slate-900/40 border border-slate-800/80 rounded-lg overflow-hidden shadow-2xl">
          {/* 选项卡导航头 */}
          <div className="flex items-center border-b border-slate-800 bg-[#0E1322] px-2 pt-2 gap-1 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('rag')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-t border-x cursor-pointer transition ${
                activeTab === 'rag'
                  ? 'bg-slate-900 border-slate-700 text-cyan-300 font-bold border-b-2 border-b-slate-900 -mb-[1px]'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>RAG 知识召回</span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                {ragRetrievals.length > 0 ? ragRetrievals.length : '16组'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('fsm')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-t border-x cursor-pointer transition ${
                activeTab === 'fsm'
                  ? 'bg-slate-900 border-slate-700 text-indigo-300 font-bold border-b-2 border-b-slate-900 -mb-[1px]'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>CBT 状态机</span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50 truncate max-w-[80px]">
                {currentStage}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('acoustic')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-t border-x cursor-pointer transition ${
                activeTab === 'acoustic'
                  ? 'bg-slate-900 border-slate-700 text-emerald-300 font-bold border-b-2 border-b-slate-900 -mb-[1px]'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>声学与传输</span>
              <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                {activeTransport === 'webrtc' ? 'WebRTC' : 'WS'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-t border-x cursor-pointer transition ${
                activeTab === 'events'
                  ? 'bg-slate-900 border-slate-700 text-purple-300 font-bold border-b-2 border-b-slate-900 -mb-[1px]'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span>事件与原始帧</span>
            </button>
          </div>

          {/* 选项卡主体区 (保持所有面板在 DOM 中以维持状态并支持测试，非活动者隐藏) */}
          <div className="flex-1 min-h-0 p-3 bg-slate-900/60 overflow-hidden">
            <div className={activeTab === 'rag' ? 'h-full flex flex-col' : 'hidden'}>
              <RagDiagnosticsPanel />
            </div>
            <div className={activeTab === 'fsm' ? 'h-full flex flex-col' : 'hidden'}>
              <CbtFsmDiagnosticsPanel />
            </div>
            <div className={activeTab === 'acoustic' ? 'h-full flex flex-col' : 'hidden'}>
              <AcousticDiagnosticsPanel />
            </div>
            <div className={activeTab === 'events' ? 'h-full flex flex-col' : 'hidden'}>
              <RawEventsDiagnosticsPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
