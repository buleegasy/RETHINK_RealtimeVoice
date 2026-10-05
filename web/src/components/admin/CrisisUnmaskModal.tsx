import React, { useState, useEffect } from 'react';
import { ShieldAlert, KeyRound, X, Eye, EyeOff, Clock, MapPin } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { AdminCrisisItem } from '../../types';
import { CrisisUnmaskedDetail } from './crisis/CrisisUnmaskedDetail';

interface CrisisUnmaskModalProps {
  crisis: AdminCrisisItem | null;
  onClose: () => void;
}

export const CrisisUnmaskModal: React.FC<CrisisUnmaskModalProps> = ({ crisis, onClose }) => {
  const { unmaskCrisis, unmaskedMap, teacherProfile } = useAdminStore();
  const [passcode, setPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  if (!crisis) return null;

  const currentUnmasked = unmaskedMap[crisis.sessionId];

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setErrorMessage('请输入安全口令');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await unmaskCrisis(
      crisis.sessionId,
      passcode.trim(),
      teacherProfile?.displayName || '心理专职教师',
    );

    setIsSubmitting(false);
    if (!res.success) {
      setErrorMessage(res.error || '口令错误');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="crisis-unmask-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 bg-[#000000]/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 select-none"
    >
      <div className="bg-[#ffffff] w-full max-w-lg max-h-[92dvh] sm:max-h-[90vh] rounded-2xl sm:rounded-3xl border border-[#c4c7c5] shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#fce8e6] px-4 sm:px-6 py-3 sm:py-4 border-b border-[#f2b8b5] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 text-[#ba1a1a]" />
            <h3 id="crisis-unmask-title" className="text-xs sm:text-sm font-bold text-[#410e0b]">
              危机身份穿透核验 · #{crisis.sessionId.slice(-6)}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭窗口"
            className="p-1.5 rounded-full hover:bg-[#f9dedc] text-[#601410] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto min-h-0 flex-1">
          {!currentUnmasked ? (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="bg-[#f8f9fa] border border-[#e1e3e1] rounded-xl sm:rounded-2xl p-3.5 space-y-1.5 text-xs">
                <span className="font-semibold text-[#1f1f1f] block">隐私与双重验证保护说明</span>
                <p className="text-[#5e5e5e] leading-relaxed text-[11px] sm:text-xs">
                  学生身份信息在客户端全程以 Web Crypto AES-GCM
                  算法强加密传输，仅当心理危机评估触发极高危告警时，授权心理专职教师方可凭专属二次安全口令进行解密穿透。解密操作将被严格记入不可篡改的系统审计日志中。
                </p>
                <div className="flex items-center gap-3 pt-1 text-[11px] text-[#747775]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(crisis.createdAt * 1000).toLocaleString('zh-CN')}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    终端 #01
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1f1f1f] mb-2 flex items-center gap-1.5 font-mono">
                  <KeyRound className="w-4 h-4 text-[#004a77]" />
                  教师二次安全口令 (Passcode) <span className="text-[#ba1a1a]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="请输入专属二次口令 (如 teacher-safe-2026)"
                    className="w-full pl-4 pr-10 py-2.5 text-base sm:text-sm rounded-xl border border-[#c4c7c5] focus:outline-none focus:border-[#004a77] bg-[#ffffff]"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#747775] hover:text-[#1f1f1f] p-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errorMessage && (
                  <p className="text-xs font-medium text-[#ba1a1a] mt-2 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#f0f4f9]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#444746] hover:bg-[#f0f4f9] transition-colors cursor-pointer"
                >
                  取消 (Esc)
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !passcode}
                  className="px-5 py-2 rounded-xl text-xs font-medium bg-[#ba1a1a] text-white hover:bg-[#93000a] transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isSubmitting ? '解密验证中...' : '核验口令并穿透'}
                </button>
              </div>
            </form>
          ) : (
            <CrisisUnmaskedDetail crisis={crisis} identity={currentUnmasked} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
};
