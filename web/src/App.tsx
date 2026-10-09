import { Suspense, lazy, useEffect, useRef } from 'react';
import { VoiceView } from './components/voice/VoiceView';
import { LoginWall } from './components/auth/LoginWall';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useAuthStore } from './store/authStore';
import { useModeStore } from './store/modeStore';
import { useBoothStore } from './store/boothStore';
import { useVoiceSession } from './hooks/useVoiceSession';
import { useTelephoneBooth } from './hooks/useTelephoneBooth';
import { useKioskWatchdog } from './hooks/useKioskWatchdog';
import { apiFetch } from './lib/api';

const AdminPortal = lazy(() =>
  import('./components/admin/AdminPortal').then((m) => ({
    default: m.AdminPortal,
  })),
);

const TestWorkbench = lazy(() =>
  import('./components/test/TestWorkbench').then((m) => ({
    default: m.TestWorkbench,
  })),
);

export function App() {
  const runMode = useModeStore((s) => s.runMode);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const hasAutoLoggedInRef = useRef(false);

  const hookState = useBoothStore((s) => s.hookState);
  const { startCall, endCall, interrupt, toggleMute } = useVoiceSession();

  // 1. 电话亭物理按键 (Space/Enter/Esc/M) 与挂摘机硬件交互（仅在常规体验模式启用）
  useTelephoneBooth({
    enabled: runMode === 'web' || runMode === 'kiosk',
    onPickUp: startCall,
    onHangUp: endCall,
    onInterrupt: interrupt,
    onToggleMute: toggleMute,
  });

  // 2. 树莓派电话亭无人值守静默看门狗：持续 120 秒静默无声自动挂机复位
  useKioskWatchdog({
    enabled: runMode === 'kiosk' && isAuthenticated,
    isOffHook: hookState !== 'on_hook' && hookState !== 'ended',
    silenceTimeoutSeconds: 120,
    onSilenceTimeout: endCall,
  });

  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (runMode !== 'kiosk' && runMode !== 'test') {
      hasAutoLoggedInRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    }
  }, [runMode]);

  useEffect(() => {
    if (
      (runMode === 'kiosk' || runMode === 'test') &&
      !isAuthenticated &&
      !hasAutoLoggedInRef.current
    ) {
      hasAutoLoggedInRef.current = true;
      const deviceId = runMode === 'test' ? 'telemetry-test-bench' : 'kiosk-booth-01';
      void apiFetch('/api/auth/kiosk-login', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.user && data.token) {
            login(data.user, data.token);
          } else {
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = setTimeout(() => {
              hasAutoLoggedInRef.current = false;
            }, 5000);
          }
        })
        .catch((err) => {
          console.warn('[App] 自动免密鉴权异常:', err);
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = setTimeout(() => {
            hasAutoLoggedInRef.current = false;
          }, 5000);
        });
    }
  }, [runMode, isAuthenticated, login]);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-white text-black font-sans overflow-hidden">
      {runMode === 'admin' ? (
        <ErrorBoundary fallbackTitle="教师管理工作台载入遇到异常">
          <Suspense
            fallback={
              <div className="flex h-screen w-screen items-center justify-center bg-[#f8f9fa] text-[#444746] text-xs">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-7 h-7 border-2 border-[#004a77] border-t-transparent rounded-full animate-spin" />
                  <span>正在加载教师管理工作台...</span>
                </div>
              </div>
            }
          >
            <AdminPortal />
          </Suspense>
        </ErrorBoundary>
      ) : runMode === 'test' ? (
        <ErrorBoundary fallbackTitle="遥测测试工作台载入遇到异常">
          <Suspense
            fallback={
              <div className="flex h-screen w-screen items-center justify-center bg-[#0B0F19] text-slate-400 text-xs">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-7 h-7 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>正在加载影子大脑遥测控制台...</span>
                </div>
              </div>
            }
          >
            <TestWorkbench />
          </Suspense>
        </ErrorBoundary>
      ) : !isAuthenticated ? (
        <LoginWall />
      ) : (
        <VoiceView onStartCall={startCall} onEndCall={endCall} onInterrupt={interrupt} />
      )}
    </div>
  );
}

export default App;
