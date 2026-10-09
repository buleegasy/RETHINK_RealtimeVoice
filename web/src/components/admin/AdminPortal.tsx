import React, { useState, useEffect } from 'react';
import { ShieldAlert, ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import { useModeStore } from '../../store/modeStore';
import { AdminNavbar } from './AdminNavbar';
import { CrisisAlertBanner } from './CrisisAlertBanner';
import { CampusPulseDashboard } from './CampusPulseDashboard';
import { CrisisResponseCenter } from './CrisisResponseCenter';
import { SessionArchiveDrawer } from './SessionArchiveDrawer';
import { AdminSettingsModal } from './AdminSettingsModal';

export const AdminPortal: React.FC = () => {
  const {
    isAuthenticated,
    login,
    isLoading,
    error,
    activeTab,
    fetchStats,
    fetchCrises,
    fetchSessions,
  } = useAdminStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchCrises();
      fetchSessions();
      const interval = setInterval(() => {
        fetchCrises();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchStats, fetchCrises, fetchSessions]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  if (!isAuthenticated) {
    return (
      <div className="h-full w-full overflow-y-auto bg-[#f8f9fa] flex items-center justify-center p-3 sm:p-4">
        <div className="bg-[#ffffff] w-full max-w-sm rounded-3xl border border-[#c4c7c5] shadow-sm p-6 sm:p-8 space-y-5 sm:space-y-6">
          <div className="text-center space-y-1">
            <h1
              className="text-xl sm:text-2xl font-light tracking-[0.2em] sm:tracking-[0.25em] text-[#1f1f1f] uppercase"
              style={{ fontFamily: "'Times New Roman', Georgia, serif" }}
            >
              RETHINK
            </h1>
            <p className="text-[10px] sm:text-[11px] text-[#747775] font-mono tracking-widest uppercase">
              Console
            </p>
          </div>

          {error && (
            <div className="bg-[#fce8e6] border border-[#f2b8b5] text-[#ba1a1a] text-xs p-3 rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#1f1f1f] mb-1.5 font-mono">
                账号
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="teacher"
                className="w-full px-4 py-2.5 text-base sm:text-sm rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1f1f1f] mb-1.5 font-mono">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-4 pr-10 py-2.5 text-base sm:text-sm rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#747775] hover:text-[#1f1f1f] p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 mt-4 cursor-pointer"
            >
              <span>{isLoading ? '登录中...' : '登录'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="pt-2 text-center border-t border-[#c4c7c5]/40">
            <button
              type="button"
              onClick={() => {
                useModeStore.getState().setRunMode('web');
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
              className="text-xs text-[#747775] hover:text-[#004a77] transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回前台咨询终端</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[#f8f9fa] flex flex-col text-[#1f1f1f] scroll-smooth">
      <AdminNavbar onOpenSettings={() => setIsSettingsOpen(true)} />
      <CrisisAlertBanner />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 md:p-8 pb-24 md:pb-16">
        {activeTab === 'pulse' && <CampusPulseDashboard />}
        {activeTab === 'crises' && <CrisisResponseCenter />}
        {activeTab === 'sessions' && <SessionArchiveDrawer />}
      </main>

      {isSettingsOpen && <AdminSettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </div>
  );
};
