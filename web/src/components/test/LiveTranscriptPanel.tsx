import React, { useEffect, useRef } from 'react';
import { BookOpen, Cpu, Radio } from 'lucide-react';
import { useTelemetryStore } from '../../store/telemetryStore';

export const LiveTranscriptPanel: React.FC = () => {
  const streamingUserText = useTelemetryStore((s) => s.streamingUserText);
  const streamingAssistantText = useTelemetryStore((s) => s.streamingAssistantText);
  const transcriptFeed = useTelemetryStore((s) => s.transcriptFeed);
  const activeTransport = useTelemetryStore((s) => s.activeTransport);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptFeed, streamingUserText, streamingAssistantText]);

  return (
    <div className="flex-1 min-h-0 bg-[#0B0F19] border border-slate-800 rounded-lg flex flex-col overflow-hidden font-mono select-none">
      <div className="px-3.5 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <h2 className="text-xs font-semibold tracking-wide text-slate-200">双轨实时转写</h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[9px] px-1.5 py-0.2 rounded border ${
              activeTransport === 'webrtc'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                : 'bg-purple-950/60 text-purple-300 border-purple-800/60'
            }`}
          >
            {activeTransport === 'webrtc' ? 'RTCDataChannel 直通' : 'WS 帧传输'}
          </span>
          <span className="text-[10px] text-slate-500">轮次 {transcriptFeed.length}</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 p-3 overflow-y-auto space-y-2.5 font-sans">
        {/* 实时推流 Delta 气泡 */}
        {(streamingUserText || streamingAssistantText) && (
          <div className="space-y-1.5 p-2 rounded bg-slate-900/80 border border-slate-800 font-mono text-xs">
            {streamingUserText && (
              <div className="flex items-start gap-2">
                <span className="px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 text-[10px] shrink-0">
                  来访者
                </span>
                <span className="text-cyan-200 leading-snug break-words">
                  {streamingUserText}
                  <span className="inline-block w-1.5 h-3 bg-cyan-400 ml-1 animate-pulse" />
                </span>
              </div>
            )}
            {streamingAssistantText && (
              <div className="flex items-start gap-2">
                <span className="px-1 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-[10px] shrink-0">
                  AI
                </span>
                <span className="text-emerald-200 leading-snug break-words">
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
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 mb-0.5 px-1">
                <span>{item.role === 'user' ? '来访者' : 'AI'}</span>
                <span>·</span>
                <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                {item.cbtStage && (
                  <>
                    <span>·</span>
                    <span className="text-cyan-400">{item.cbtStage}</span>
                  </>
                )}
              </div>
              <div
                className={`max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed ${
                  item.role === 'user'
                    ? 'bg-cyan-950/40 border border-cyan-800/50 text-cyan-100'
                    : 'bg-slate-900 border border-slate-800 text-slate-200'
                }`}
              >
                <div>{item.text}</div>
                {(item.ragTopic || item.shadowHint) && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                    {item.ragTopic && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                        <BookOpen className="w-2.5 h-2.5" />
                        {item.ragTopic}
                      </span>
                    )}
                    {item.shadowHint && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 truncate max-w-[200px]"
                        title={item.shadowHint}
                      >
                        <Cpu className="w-2.5 h-2.5" />
                        指导注入
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-8 font-mono">
            <span>暂无对话记录</span>
          </div>
        )}
      </div>
    </div>
  );
};
