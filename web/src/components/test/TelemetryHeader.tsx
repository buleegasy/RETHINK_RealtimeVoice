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

  const isCallActive = sessionStatus === 'connected' || sessionStatus === 'connecting';

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <header className="h-14 border-b border-slate-800 bg-[#0E1322]/90 backdrop-blur px-4 flex items-center justify-between shrink-0 z-20">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setRunMode('web')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition cursor-pointer"
          title="返回常规倾诉视图"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回体验</span>
        </button>
        <div className="h-4 w-[1px] bg-slate-800" />
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-wider bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              RETHINK TELEMETRY
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              DEEPSEEK V4 FLASH SHADOW
            </span>
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? 'bg-emerald-500 animate-pulse'
                : sessionStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-slate-500'
            }`}
          />
          <span className="text-slate-300">
            {isConnected
              ? '全双工网关已连接'
              : sessionStatus === 'connecting'
                ? '正在协商链路...'
                : '网关就绪 (待机)'}
          </span>
        </div>

        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900 border border-slate-800">
          <span className="text-slate-400">阶段:</span>
          <span className="text-cyan-400 font-semibold">{activeCbtStage}</span>
        </div>

        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900 border border-slate-800">
          <span className="text-slate-400">双工态:</span>
          <span
            className={`font-semibold ${
              duplexPhase === 'speaking'
                ? 'text-emerald-400'
                : duplexPhase === 'thinking'
                  ? 'text-amber-400'
                  : duplexPhase === 'listening'
                    ? 'text-cyan-400'
                    : 'text-slate-400'
            }`}
          >
            {duplexPhase === 'speaking'
              ? 'AI 播报中'
              : duplexPhase === 'thinking'
                ? '影子大脑推理'
                : duplexPhase === 'listening'
                  ? '监听倾听中'
                  : '待机'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-300">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>{formatDuration(callDuration)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clearTelemetry}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          title="清空遥测历史"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          disabled={!isCallActive}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs transition cursor-pointer border ${
            isMuted
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isMuted ? '已静音' : '静音'}</span>
        </button>

        <button
          type="button"
          onClick={onInterrupt}
          disabled={!isCallActive || duplexPhase !== 'speaking'}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title="立即打断 AI 当前播报 (Barge-In)"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">打断</span>
        </button>

        {!isCallActive ? (
          <button
            type="button"
            onClick={onStartCall}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer shadow-lg shadow-emerald-900/30 active:scale-95"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>启动通话</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onEndCall}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition cursor-pointer shadow-lg shadow-rose-900/30 active:scale-95"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>{sessionStatus === 'connecting' ? '取消连接' : '挂机'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
