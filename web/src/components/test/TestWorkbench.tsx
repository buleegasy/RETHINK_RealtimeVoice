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

      {/* 主体工作区 (两栏分布: 左转写 7 cols, 右遥测套件 5 cols) */}
      <div className="flex-1 min-h-0 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-hidden">
        {/* 左侧：语音转写实时流 (7 cols) */}
        <div className="lg:col-span-7 flex flex-col min-h-0 h-full">
          <LiveTranscriptPanel />
        </div>

        {/* 右侧：多维遥测工作台套件 (5 cols) */}
        <div className="lg:col-span-5 flex flex-col min-h-0 h-full bg-[#0B0F19] border border-slate-800 rounded-lg overflow-hidden">
          {/* 选项卡导航头 (统一紧凑 h-9) */}
          <div className="flex items-center border-b border-slate-800 bg-slate-900/60 px-2 h-9 gap-1 shrink-0 font-mono">
            <button
              type="button"
              onClick={() => setActiveTab('rag')}
              className={`flex items-center gap-1.5 px-2.5 h-7 text-xs rounded transition cursor-pointer ${
                activeTab === 'rag'
                  ? 'bg-slate-800 text-cyan-300 font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>RAG 知识召回</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                {ragRetrievals.length > 0 ? ragRetrievals.length : '16组'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('fsm')}
              className={`flex items-center gap-1.5 px-2.5 h-7 text-xs rounded transition cursor-pointer ${
                activeTab === 'fsm'
                  ? 'bg-slate-800 text-indigo-300 font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>CBT 状态机</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 truncate max-w-[80px]">
                {currentStage}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('acoustic')}
              className={`flex items-center gap-1.5 px-2.5 h-7 text-xs rounded transition cursor-pointer ${
                activeTab === 'acoustic'
                  ? 'bg-slate-800 text-emerald-300 font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>声学与传输</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                {activeTransport === 'webrtc' ? 'WebRTC' : 'WS'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`flex items-center gap-1.5 px-2.5 h-7 text-xs rounded transition cursor-pointer ${
                activeTab === 'events'
                  ? 'bg-slate-800 text-purple-300 font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span>事件与原始帧</span>
            </button>
          </div>

          {/* 选项卡主体区 (保持所有面板在 DOM 中以维持状态) */}
          <div className="flex-1 min-h-0 p-2.5 bg-slate-950/40 overflow-hidden">
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
