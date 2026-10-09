import React from 'react';
import { useVoiceSession } from '../../hooks/useVoiceSession';
import { useBoothStore } from '../../store/boothStore';
import { TelemetryHeader } from './TelemetryHeader';
import { TelemetryKpiStrip } from './TelemetryKpiStrip';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';
import { AudioDiagnosticsPanel } from './AudioDiagnosticsPanel';

export const TestWorkbench: React.FC = () => {
  const { startCall, endCall, interrupt, toggleMute } = useVoiceSession();
  const errorMessage = useBoothStore((s) => s.errorMessage);
  const setErrorMessage = useBoothStore((s) => s.setErrorMessage);

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
      <div className="flex-1 min-h-0 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* 左侧：语音转写双轨实时流 (7 cols) */}
        <div className="lg:col-span-7 flex flex-col min-h-0 h-full">
          <LiveTranscriptPanel />
        </div>

        {/* 右侧：音频管线、抖动缓冲、遥测仪表盘 (5 cols) */}
        <AudioDiagnosticsPanel />
      </div>
    </div>
  );
};
