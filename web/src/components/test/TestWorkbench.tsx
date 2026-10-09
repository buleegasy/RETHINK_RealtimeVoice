import React from 'react';
import { useVoiceSession } from '../../hooks/useVoiceSession';
import { TelemetryHeader } from './TelemetryHeader';
import { TelemetryKpiStrip } from './TelemetryKpiStrip';
import { ShadowDirectivePanel } from './ShadowDirectivePanel';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';
import { AudioDiagnosticsPanel } from './AudioDiagnosticsPanel';

export const TestWorkbench: React.FC = () => {
  const { startCall, endCall, interrupt, toggleMute } = useVoiceSession();

  return (
    <div className="w-full h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans overflow-hidden select-none">
      {/* 顶部主控导航条 */}
      <TelemetryHeader
        onStartCall={startCall}
        onEndCall={endCall}
        onInterrupt={interrupt}
        onToggleMute={toggleMute}
      />

      {/* 关键性能与链路指标 KPI 条 */}
      <TelemetryKpiStrip />

      {/* 主体工作区 (两栏分布) */}
      <div className="flex-1 min-h-0 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* 左侧/中部：影子大脑提示词注入 + 转写双轨实时流 (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4 min-h-0 h-full">
          <ShadowDirectivePanel />
          <LiveTranscriptPanel />
        </div>

        {/* 右侧：音频管线、抖动缓冲、遥测仪表盘 (5 cols) */}
        <AudioDiagnosticsPanel />
      </div>
    </div>
  );
};
