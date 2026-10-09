import React from 'react';
import {
  ShieldAlert,
  Volume2,
  VolumeX,
  LogOut,
  SlidersHorizontal,
  LayoutDashboard,
  Archive,
  Monitor,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import { useModeStore } from '../../store/modeStore';

interface AdminNavbarProps {
  onOpenSettings: () => void;
}

export const AdminNavbar: React.FC<AdminNavbarProps> = ({ onOpenSettings }) => {
  const {
    activeTab,
    setActiveTab,
    crises,
    buzzerEnabled,
    setBuzzerEnabled,
    teacherProfile,
    logout,
  } = useAdminStore();

  const { setRunMode } = useModeStore();

  const activeCrisisCount = crises.filter(
    (c) => c.crisisLevel >= 3 && c.dispositionStatus !== 'closed',
  ).length;

  return (
    <>
      <header className="bg-[#ffffff] border-b border-[#e1e3e1] px-3.5 sm:px-6 py-2.5 sm:py-3.5 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <h1
                className="text-base sm:text-lg font-light tracking-[0.15em] sm:tracking-[0.2em] uppercase text-black"
                style={{ fontFamily: "'Times New Roman', Georgia, serif" }}
              >
                RETHINK
              </h1>
              <span className="bg-[#f0f4f9] text-[#004a77] text-[9px] sm:text-[10px] font-mono font-medium px-1.5 sm:px-2 py-0.5 rounded-md">
                Console
              </span>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center bg-[#f0f4f9] p-1 rounded-full gap-1">
              <button
                onClick={() => setActiveTab('pulse')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'pulse'
                    ? 'bg-[#ffffff] text-[#004a77] shadow-sm'
                    : 'text-[#444746] hover:bg-[#e1e3e1]'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>情绪大盘</span>
              </button>

              <button
                onClick={() => setActiveTab('crises')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-colors relative cursor-pointer ${
                  activeTab === 'crises'
                    ? 'bg-[#ffffff] text-[#ba1a1a] shadow-sm font-semibold'
                    : 'text-[#444746] hover:bg-[#e1e3e1]'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>危机中心</span>
                {activeCrisisCount > 0 && (
                  <span className="bg-[#ba1a1a] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {activeCrisisCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('sessions')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'sessions'
                    ? 'bg-[#ffffff] text-[#004a77] shadow-sm'
                    : 'text-[#444746] hover:bg-[#e1e3e1]'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>个案档案</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={() => setBuzzerEnabled(!buzzerEnabled)}
              title={buzzerEnabled ? '警报声音开启' : '警报声音静音'}
              className={`p-1.5 sm:p-2 rounded-full border transition-colors cursor-pointer ${
                buzzerEnabled
                  ? 'bg-[#ffffff] border-[#c4c7c5] text-[#1f1f1f] hover:bg-[#f0f4f9]'
                  : 'bg-[#feedc2] border-[#f59e0b] text-[#442c00]'
              }`}
            >
              {buzzerEnabled ? (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#146c2e]" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ba1a1a]" />
              )}
            </button>

            <button
              onClick={onOpenSettings}
              title="设置与审计"
              className="p-1.5 sm:p-2 rounded-full bg-[#ffffff] border border-[#c4c7c5] text-[#444746] hover:bg-[#f0f4f9] transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button
              onClick={() => setRunMode('kiosk')}
              title="切换至前台终端模式"
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-full bg-[#ffffff] border border-[#c4c7c5] text-[#444746] hover:bg-[#f0f4f9] transition-colors cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5 text-[#004a77]" />
              <span className="hidden md:inline">终端模式</span>
            </button>

            <div className="h-4 w-px bg-[#c4c7c5] mx-0.5 sm:mx-1" />

            <div className="flex items-center gap-1 sm:gap-2 bg-[#ffffff] border border-[#c4c7c5] pl-2 sm:pl-3 pr-1 py-1 rounded-full">
              <span className="text-xs font-medium text-[#1f1f1f] max-w-[4rem] sm:max-w-none truncate">
                {teacherProfile?.displayName || '教师'}
              </span>
              <button
                onClick={() => {
                  logout();
                  setRunMode('web');
                  try {
                    if (typeof window !== 'undefined' && window.history?.replaceState) {
                      const url = new URL(window.location.href);
                      url.searchParams.delete('mode');
                      window.history.replaceState(
                        {},
                        '',
                        url.pathname + (url.search ? url.search : ''),
                      );
                    }
                  } catch {}
                }}
                title="退出登录并返回终端"
                className="p-1 rounded-full hover:bg-[#f0f4f9] text-[#747775] hover:text-[#ba1a1a] transition-colors cursor-pointer"
              >
                <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Dock */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#e1e3e1] px-2 py-1.5 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('pulse')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl text-[11px] font-medium transition-all active:scale-95 cursor-pointer ${
              activeTab === 'pulse'
                ? 'text-[#004a77] font-semibold bg-[#e8f0fe]/60'
                : 'text-[#747775] hover:text-[#1f1f1f]'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>情绪大盘</span>
          </button>

          <button
            onClick={() => setActiveTab('crises')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl text-[11px] font-medium transition-all relative active:scale-95 cursor-pointer ${
              activeTab === 'crises'
                ? 'text-[#ba1a1a] font-semibold bg-[#fce8e6]/60'
                : 'text-[#747775] hover:text-[#1f1f1f]'
            }`}
          >
            <div className="relative">
              <ShieldAlert className="w-4 h-4" />
              {activeCrisisCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-[#ba1a1a] text-white text-[9px] font-bold px-1 py-0.2 rounded-full min-w-[14px] text-center">
                  {activeCrisisCount}
                </span>
              )}
            </div>
            <span>危机中心</span>
          </button>

          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl text-[11px] font-medium transition-all active:scale-95 cursor-pointer ${
              activeTab === 'sessions'
                ? 'text-[#004a77] font-semibold bg-[#e8f0fe]/60'
                : 'text-[#747775] hover:text-[#1f1f1f]'
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>个案档案</span>
          </button>
        </div>
      </nav>
    </>
  );
};
