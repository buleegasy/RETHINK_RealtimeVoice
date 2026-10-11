import React from 'react';
import {
  Activity,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Zap,
  RotateCcw,
  ArrowLeft,
  Cpu,
} from 'lucide-react';
import { useBoothStore } from '../../store/boothStore';
import { useModeStore } from '../../store/modeStore';
import { useTelemetryStore } from '../../store/telemetryStore';

interface TelemetryHeaderProps {
  onStartCall: () => void;
  onEndCall: () => void;
  onInterrupt: () => void;
  onToggleMute: () => void;
}

function getSessionStatusDotClass(isConnected: boolean, sessionStatus: string): string {
  if (isConnected) return 'bg-emerald-400';
  if (sessionStatus === 'connecting') return 'bg-amber-400 animate-pulse';
  return 'bg-slate-600';
}

function getSessionStatusText(isConnected: boolean, sessionStatus: string): string {
  if (isConnected) return '已连接';
  if (sessionStatus === 'connecting') return '协商中';
  return '就绪';
}

export const TelemetryHeader: React.FC<TelemetryHeaderProps> = ({
  onStartCall,
  onEndCall,
  onInterrupt,
  onToggleMute,
}) => {
  const sessionStatus = useBoothStore((s) => s.sessionStatus);
  const callDuration = useBoothStore((s) => s.callDuration);
  const isMuted = useBoothStore((s) => s.isMuted);
  const setRunMode = useModeStore((s) => s.setRunMode);

  const isConnected = useTelemetryStore((s) => s.isConnected);
  const activeCbtStage = useTelemetryStore((s) => s.activeCbtStage);
  const duplexPhase = useTelemetryStore((s) => s.duplexPhase);
  const clearTelemetry = useTelemetryStore((s) => s.clearTelemetry);
  const activeTransport = useTelemetryStore((s) => s.activeTransport);

  const isCallActive = sessionStatus === 'connected' || sessionStatus === 'connecting';

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <header className="h-12 border-b border-slate-800 bg-[#0B0F19] px-4 flex items-center justify-between shrink-0 z-20 font-mono select-none overflow-x-auto scrollbar-none">
      {/* 左侧：导航与系统品牌标识 */}
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <button
          type="button"
          onClick={() => setRunMode('web')}
          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer border border-slate-800 shrink-0"
          title="返回常规体验"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回</span>
        </button>
        <button
          type="button"
          onClick={() => setRunMode('admin')}
          className="px-2 py-1 rounded bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 hover:text-indigo-200 text-xs transition cursor-pointer border border-indigo-800/50 shrink-0"
          title="教师管理后台"
        >
          教师后台
        </button>

        <div className="h-3.5 w-px bg-slate-800 shrink-0" />

        <div className="flex items-center gap-2 shrink-0">
          <div className="p-1 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 shrink-0">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-wider text-cyan-400 shrink-0">
            RETHINK TELEMETRY
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 shrink-0">
            LIVE-1 DIRECT · CBT EMBEDDED
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${
              activeTransport === 'webrtc'
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            {activeTransport === 'webrtc' ? 'WEBRTC OPUS' : 'WS PCM16'}
          </span>
          <span className="hidden xl:inline text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 shrink-0">
            DEEPSEEK V4 FLASH EVAL
          </span>
        </div>
      </div>

      {/* 中间：链路与双工运行态指标（极简紧凑单行对齐） */}
      <div className="hidden lg:flex items-center gap-3 text-xs whitespace-nowrap shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-emerald-300 font-medium">WebRTC (UDP/Opus 直连)</span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400 text-[11px] shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${getSessionStatusDotClass(
              isConnected,
              sessionStatus,
            )}`}
          />
          <span className="text-slate-300">{getSessionStatusText(isConnected, sessionStatus)}</span>
        </div>

        <div className="h-3 w-px bg-slate-800 shrink-0" />

        <div className="flex items-center gap-1 text-[11px] shrink-0">
          <span className="text-slate-500">阶段</span>
          <span className="text-cyan-400 font-semibold">{activeCbtStage}</span>
        </div>

        <div className="h-3 w-px bg-slate-800 shrink-0" />

        <div className="flex items-center gap-1 text-[11px] shrink-0">
          <span className="text-slate-500">双工</span>
          <span
            className={`font-semibold shrink-0 ${
              duplexPhase === 'speaking'
                ? 'text-emerald-400'
                : duplexPhase === 'thinking'
                  ? 'text-amber-400'
                  : duplexPhase === 'listening'
                    ? 'text-cyan-400'
                    : 'text-slate-500'
            }`}
          >
            {duplexPhase === 'speaking'
              ? '播报'
              : duplexPhase === 'thinking'
                ? '生成'
                : duplexPhase === 'listening'
                  ? '倾听'
                  : '待机'}
          </span>
        </div>

        <div className="h-3 w-px bg-slate-800 shrink-0" />

        <div className="flex items-center gap-1 text-slate-300 text-[11px] shrink-0">
          <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>{formatDuration(callDuration)}</span>
        </div>
      </div>

      {/* 右侧：动作控制按键（统一高度 h-7.5，对齐） */}
      <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
        <button
          type="button"
          onClick={clearTelemetry}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          title="清空遥测历史"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          disabled={!isCallActive}
          className={`flex items-center gap-1 px-2.5 h-7.5 rounded text-xs transition cursor-pointer border ${
            isMuted
              ? 'bg-rose-950/60 text-rose-300 border-rose-800/60 hover:bg-rose-900/60'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          <span>{isMuted ? '已静音' : '静音'}</span>
        </button>

        <button
          type="button"
          onClick={onInterrupt}
          disabled={!isCallActive || duplexPhase !== 'speaking'}
          className="flex items-center gap-1 px-2.5 h-7.5 rounded text-xs bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-800/60 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title="立即打断 AI 当前播报 (Barge-In)"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>打断</span>
        </button>

        {!isCallActive ? (
          <button
            type="button"
            onClick={onStartCall}
            className="flex items-center gap-1.5 px-3 h-7.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm shadow-emerald-950"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>启动通话</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onEndCall}
            className="flex items-center gap-1.5 px-3 h-7.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm shadow-rose-950"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>{sessionStatus === 'connecting' ? '取消' : '挂机'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
