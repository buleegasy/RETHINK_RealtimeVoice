import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useModeStore } from '../../store/modeStore';
import { apiFetch } from '../../lib/api';
import type { AuthResponse } from '../../types';

type AuthTab = 'login' | 'register';

export const LoginWall: React.FC = () => {
  const login = useAuthStore((state) => state.login);
  const setRunMode = useModeStore((state) => state.setRunMode);

  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    if (activeTab === 'register' && password.length < 6) {
      setError('密码长度至少需要 6 个字符');
      return;
    }

    setLoading(true);
    setError(null);

    const endpoint = activeTab === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload =
      activeTab === 'register'
        ? {
            username: username.trim(),
            password,
            displayName: displayName.trim() || username.trim(),
          }
        : { username: username.trim(), password };

    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data: AuthResponse = await res.json();

      if (!res.ok || !data.success || !data.user || !data.token) {
        setError(data.error || '登录失败，请检查账号密码');
        setLoading(false);
        return;
      }

      login(data.user, data.token);
    } catch {
      setError('网络连接异常，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 bg-[#f8f9fa] text-black select-none font-sans">
      <motion.div
        initial={{ opacity: 0.9, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full max-w-sm bg-white border border-black/15 shadow-sm rounded-2xl p-8 flex flex-col"
      >
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-light tracking-[0.25em] uppercase text-black"
            style={{ fontFamily: "'Times New Roman', Georgia, serif" }}
          >
            RETHINK
          </h1>
        </div>

        <div className="flex border-b border-black/10 mb-6 font-mono text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setError(null);
            }}
            className={`flex-1 pb-2.5 font-medium transition-colors cursor-pointer text-center ${
              activeTab === 'login'
                ? 'border-b-2 border-black text-black'
                : 'text-black/40 hover:text-black'
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setError(null);
            }}
            className={`flex-1 pb-2.5 font-medium transition-colors cursor-pointer text-center ${
              activeTab === 'register'
                ? 'border-b-2 border-black text-black'
                : 'text-black/40 hover:text-black'
            }`}
          >
            注册
          </button>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-black/60 mb-1">用户名</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 bg-white text-sm text-black focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
            />
          </div>

          {activeTab === 'register' && (
            <div>
              <label className="block text-xs font-mono text-black/60 mb-1">称呼</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：同学"
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/15 bg-white text-sm text-black focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-black/60 mb-1">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete={activeTab === 'register' ? 'new-password' : 'current-password'}
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-black/15 bg-white text-sm text-black focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/50 hover:text-black p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-black text-white text-sm font-medium tracking-wider flex items-center justify-center gap-2 hover:bg-neutral-800 disabled:opacity-50 transition-all cursor-pointer shadow-sm mt-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <span>{activeTab === 'register' ? '注册' : '登录'}</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-black/10 flex items-center justify-between text-xs font-mono">
          <button
            type="button"
            onClick={() => setRunMode('test')}
            className="flex items-center gap-1.5 text-black/60 hover:text-black cursor-pointer transition-colors px-2 py-1 rounded-md hover:bg-black/5 border border-black/10"
            title="进入影子大脑与实时遥测测试台"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>遥测测试台</span>
          </button>
          <button
            type="button"
            onClick={() => setRunMode('admin')}
            className="text-black/50 hover:text-black cursor-pointer transition-colors"
          >
            管理后台
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginWall;
