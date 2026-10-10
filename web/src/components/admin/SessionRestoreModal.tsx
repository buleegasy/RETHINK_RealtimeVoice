import React, { useState } from 'react';
import { RotateCcw, X, Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import { useModalEscape } from '../../hooks/useModalEscape';
import type { AdminSessionItem } from '../../types';

interface SessionRestoreModalProps {
  session: AdminSessionItem;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SessionRestoreModal: React.FC<SessionRestoreModalProps> = ({
  session,
  onClose,
  onSuccess,
}) => {
  const { restoreSession } = useAdminStore();
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useModalEscape(onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setErrorMessage('请输入二次安全口令');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await restoreSession(session.sessionId, passcode.trim());
    setIsSubmitting(false);

    if (res.success) {
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setErrorMessage(res.error || '验证未通过，恢复操作已拦截');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-modal-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 select-none"
    >
      <div className="bg-[#ffffff] w-full max-w-md max-h-[92dvh] sm:max-h-[90vh] rounded-2xl sm:rounded-3xl border border-[#bbf7d0] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#f0fdf4] px-4 sm:px-6 py-3 sm:py-4 border-b border-[#bbf7d0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[#166534]">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <h3 id="restore-modal-title" className="text-xs sm:text-sm font-bold tracking-tight">
              恢复个案档案 · #{session.sessionId.slice(-6)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭窗口"
            className="p-1 rounded-full hover:bg-[#dcfce7] text-[#166534] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 text-xs overflow-y-auto min-h-0 flex-1"
        >
          <p className="text-[#5e5e5e] leading-relaxed text-[11px] sm:text-xs">
            该档案此前已被安全归档保护。请输入教师二次安全口令，将其恢复至常规活跃个案库中。
          </p>

          <div className="bg-[#f8f9fa] rounded-xl sm:rounded-2xl p-3 border border-[#e1e3e1] space-y-1">
            <div className="flex justify-between">
              <span className="text-[#747775]">个案编号</span>
              <span className="font-mono font-bold text-[#004a77]">{session.sessionId}</span>
            </div>
            {session.deleteReason && (
              <div className="flex justify-between">
                <span className="text-[#747775]">原归档事由</span>
                <span className="text-[#ba1a1a]">{session.deleteReason}</span>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="bg-[#fce8e6] border border-[#f2b8b5] text-[#ba1a1a] p-3 rounded-xl flex items-center gap-2">
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[#1f1f1f] flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-[#146c2e]" />
              <span>管理端恢复授权口令</span>
              <span className="text-[#ba1a1a]">*</span>
            </label>
            <div className="relative">
              <input
                type={showPasscode ? 'text' : 'password'}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="请输入心理教师二级授权口令"
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#146c2e] text-base sm:text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#747775] hover:text-[#1f1f1f] p-1 cursor-pointer"
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="bg-[#f8f9fa] pt-3 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 pb-4 border-t border-[#e1e3e1] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-medium bg-[#ffffff] border border-[#c4c7c5] text-[#444746] hover:bg-[#f0f4f9] transition-colors cursor-pointer text-center"
            >
              取消 (Esc)
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !passcode}
              className="w-full sm:w-auto justify-center px-5 py-2 rounded-xl text-xs font-medium bg-[#146c2e] text-white hover:bg-[#0f5323] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '核验恢复中...' : '确认恢复档案'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
