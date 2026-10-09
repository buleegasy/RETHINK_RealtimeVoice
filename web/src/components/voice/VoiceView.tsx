import React from 'react';
import { LogOut, AlertCircle } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';
import { CrisisOverlay } from '../common/CrisisOverlay';
import { useAuthStore } from '../../store/authStore';
import { useBoothStore } from '../../store/boothStore';
import { useModeStore } from '../../store/modeStore';

interface VoiceViewProps {
  onStartCall: () => void;
  onEndCall: () => void;
  onInterrupt: () => void;
}

export const VoiceView: React.FC<VoiceViewProps> = ({ onStartCall, onEndCall }) => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const runMode = useModeStore((s) => s.runMode);
  const setRunMode = useModeStore((s) => s.setRunMode);
  const sessionStatus = useBoothStore((s) => s.sessionStatus);
  const duplexPhase = useBoothStore((s) => s.duplexPhase);
  const audioLevel = useBoothStore((s) => s.audioLevel);
  const callDuration = useBoothStore((s) => s.callDuration);
  const cbtStage = useBoothStore((s) => s.cbtStage);
  const errorMessage = useBoothStore((s) => s.errorMessage);
  const setErrorMessage = useBoothStore((s) => s.setErrorMessage);

  const handleLogout = () => {
    if (runMode === 'kiosk') {
      setRunMode('web');
      try {
        localStorage.removeItem('rethink_run_mode');
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          const url = new URL(window.location.href);
          url.searchParams.delete('mode');
          url.searchParams.delete('device');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        }
      } catch {}
    }
    logout();
  };

  const isActive = sessionStatus === 'connected' || sessionStatus === 'connecting';

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-full flex flex-col justify-between bg-white text-black select-none">
      <header className="w-full flex items-center justify-between px-6 py-4 border-b border-black/10">
        <h1
          className="text-xl tracking-[0.25em] uppercase font-light text-black"
          style={{ fontFamily: "'Times New Roman', Georgia, serif" }}
        >
          RETHINK
        </h1>
        <div className="flex items-center gap-4 text-xs font-mono">
          <button
            type="button"
            onClick={() => setRunMode('test')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-black/15 text-black/70 hover:text-black hover:border-black/30 hover:bg-black/5 transition-all text-xs font-mono cursor-pointer"
            title="打开影子大脑与实时遥测测试台"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>遥测控制台</span>
          </button>
          <span className="text-black/60">{user?.displayName || user?.userName}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1 text-black/50 hover:text-black transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>退出</span>
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col items-center justify-center p-3 sm:p-6 overflow-visible">
        {errorMessage && (
          <div className="mb-6 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between gap-3 max-w-md shadow-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-700 font-bold px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <VoiceOrb
          status={sessionStatus}
          duplexPhase={duplexPhase}
          audioLevel={audioLevel}
          fsmState={cbtStage}
          onClick={isActive ? onEndCall : onStartCall}
        />
        {sessionStatus === 'connecting' && (
          <p className="mt-4 sm:mt-8 text-xs font-mono text-black/50 tracking-wider animate-pulse text-center">
            正在建立语音专线连接...
          </p>
        )}
        {sessionStatus === 'connected' && duplexPhase === 'listening' && (
          <p className="mt-4 sm:mt-8 text-xs font-mono text-black/40 tracking-wider text-center">
            请随时开口说话，我在听...
          </p>
        )}
        {sessionStatus === 'connected' && duplexPhase === 'speaking' && (
          <p className="mt-4 sm:mt-8 text-xs font-mono text-black/40 tracking-wider text-center">
            倾听中（可直接开口打断）...
          </p>
        )}
        {sessionStatus === 'connected' && duplexPhase === 'thinking' && (
          <p className="mt-4 sm:mt-8 text-xs font-mono text-black/40 tracking-wider animate-pulse text-center">
            正在思考中...
          </p>
        )}
      </main>

      <footer className="w-full flex items-center justify-center pb-6 sm:pb-12 pt-2 sm:pt-4 px-4 sm:px-6 shrink-0">
        {!isActive ? (
          <button
            type="button"
            onClick={onStartCall}
            className="px-8 py-3.5 rounded-full bg-black text-white text-sm font-medium tracking-wider hover:bg-neutral-800 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            开始倾诉
          </button>
        ) : (
          <button
            type="button"
            onClick={onEndCall}
            className="px-8 py-3.5 rounded-full bg-neutral-900 text-white text-sm font-medium tracking-wider hover:bg-black active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>{sessionStatus === 'connecting' ? '取消连接' : '结束通话'}</span>
            <span className="font-mono text-xs opacity-75">{formatDuration(callDuration)}</span>
          </button>
        )}
      </footer>

      <CrisisOverlay />
    </div>
  );
};
