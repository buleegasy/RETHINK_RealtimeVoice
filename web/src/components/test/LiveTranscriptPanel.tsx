import React from 'react';
import { Radio } from 'lucide-react';
import { useTelemetryStore } from '../../store/telemetryStore';

export const LiveTranscriptPanel: React.FC = () => {
  const streamingUserText = useTelemetryStore((s) => s.streamingUserText);
  const streamingAssistantText = useTelemetryStore((s) => s.streamingAssistantText);
  const transcriptFeed = useTelemetryStore((s) => s.transcriptFeed);
  const activeTransport = useTelemetryStore((s) => s.activeTransport);

  return (
    <div className="flex-1 min-h-0 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-col overflow-hidden shadow-xl">
      <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">
            语音转写双轨实时流 (Live Dual-Track Transcripts)
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              activeTransport === 'webrtc'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                : 'bg-purple-950/60 text-purple-300 border-purple-500/40'
            }`}
          >
            {activeTransport === 'webrtc' ? 'RTCDataChannel 直通' : 'WebSocket 帧传输'}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            已沉淀轮次: {transcriptFeed.length}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 overflow-y-auto space-y-3">
        {/* 实时推流 Delta 气泡 (流式生成中) */}
        {(streamingUserText || streamingAssistantText) && (
          <div className="space-y-2 p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
            {streamingUserText && (
              <div className="flex items-start gap-2 text-xs font-mono">
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shrink-0">
                  学生实时
                </span>
                <span className="text-cyan-200 leading-relaxed break-words">
                  {streamingUserText}
                  <span className="inline-block w-1.5 h-3 bg-cyan-400 ml-1 animate-pulse" />
                </span>
              </div>
            )}
            {streamingAssistantText && (
              <div className="flex items-start gap-2 text-xs font-mono">
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  AI 流式
                </span>
                <span className="text-emerald-200 leading-relaxed break-words">
                  {streamingAssistantText}
                  <span className="inline-block w-1.5 h-3 bg-emerald-400 ml-1 animate-pulse" />
                </span>
              </div>
            )}
          </div>
        )}

        {/* 历史对话记录瀑布流 */}
        {transcriptFeed.length > 0 ? (
          transcriptFeed.map((item) => (
            <div
              key={item.id}
              className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mb-1 px-1">
                <span>{item.role === 'user' ? '学生来访者' : 'Re-think AI'}</span>
                <span>•</span>
                <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
              <div
                className={`max-w-[85%] rounded-lg px-3.5 py-2 text-xs leading-relaxed ${
                  item.role === 'user'
                    ? 'bg-cyan-950/50 border border-cyan-500/30 text-cyan-100'
                    : 'bg-slate-800/80 border border-slate-700/80 text-slate-100'
                }`}
              >
                {item.text}
              </div>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-10">
            <span>暂无对话转写记录</span>
            <span className="text-[11px] text-slate-600 mt-1">
              开始通话并说话后，双轨 ASR 与 TTS 将在此实时滚动显示
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
