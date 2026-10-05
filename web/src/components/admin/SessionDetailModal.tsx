import React, { useState, useEffect } from 'react';
import { Sparkles, X, Trash2, RotateCcw, RefreshCw } from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import type { AdminSessionItem, DispositionStatus, AdminCrisisItem } from '../../types';
import { SessionCrisisInterventionSection } from './session/SessionCrisisInterventionSection';
import { SessionCbtReportView } from './session/SessionCbtReportView';

interface SessionDetailModalProps {
  session: AdminSessionItem;
  onClose: () => void;
  onOpenDelete: (session: AdminSessionItem) => void;
  onOpenRestore: (session: AdminSessionItem) => void;
  onOpenUnmask: (crisisItem: AdminCrisisItem) => void;
}

export const SessionDetailModal: React.FC<SessionDetailModalProps> = ({
  session: initialSession,
  onClose,
  onOpenDelete,
  onOpenRestore,
  onOpenUnmask,
}) => {
  const { reEvaluateSession, unmaskedMap, updateDisposition, fetchCrises, fetchStats } =
    useAdminStore();

  const [activeSession, setActiveSession] = useState<AdminSessionItem>(initialSession);
  const [isReEvaluating, setIsReEvaluating] = useState(false);
  const [reEvaluateStatus, setReEvaluateStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [currentNote, setCurrentNote] = useState(initialSession.dispositionNote || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [dispositionFeedback, setDispositionFeedback] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const unmasked = unmaskedMap[activeSession.sessionId];
  const isCrisisCase =
    activeSession.isCrisis || activeSession.crisisLevel >= 3 || activeSession.hasEncryptedIdentity;

  const handleReEvaluate = async () => {
    if (isReEvaluating) return;
    setIsReEvaluating(true);
    setReEvaluateStatus(null);
    try {
      const transcript =
        activeSession.deidentifiedReport?.deidentifiedTranscript ||
        activeSession.deidentifiedReport?.emotionalTrajectory?.deltaNotes ||
        activeSession.crisisSummary ||
        '';
      const res = await reEvaluateSession(activeSession.sessionId, transcript);
      if (res && res.success && res.report) {
        setActiveSession((prev) => ({
          ...prev,
          deidentifiedReport: res.report,
          coreConcerns: res.report.coreConcerns || res.session?.coreConcerns || prev.coreConcerns,
          crisisSummary:
            res.report.crisisSummary || res.session?.crisisSummary || prev.crisisSummary,
          crisisLevel: res.session?.crisisLevel ?? prev.crisisLevel,
          isCrisis: res.session?.isCrisis ?? (res.session?.crisisLevel >= 3 || prev.isCrisis),
          emotionalValence: res.session?.emotionalValence ?? prev.emotionalValence,
        }));
        setReEvaluateStatus({
          type: 'success',
          message: '已由 AI 重新提炼并更新档案',
        });
        setTimeout(() => setReEvaluateStatus(null), 4000);
      } else {
        setReEvaluateStatus({
          type: 'error',
          message: res?.error || '提炼未返回有效数据，请检查网络或后端',
        });
        setTimeout(() => setReEvaluateStatus(null), 5000);
      }
    } catch (err: any) {
      setReEvaluateStatus({
        type: 'error',
        message: err?.message || '提炼请求异常',
      });
      setTimeout(() => setReEvaluateStatus(null), 5000);
    } finally {
      setIsReEvaluating(false);
    }
  };

  const handleStatusChange = async (status: DispositionStatus) => {
    const ok = await updateDisposition(activeSession.sessionId, status, currentNote);
    if (ok) {
      setActiveSession((prev) => ({ ...prev, dispositionStatus: status }));
      const labels: Record<DispositionStatus, string> = {
        pending_contact: '已置为待跟进',
        intervened: '已标记为线下已介入',
        closed: '已标记为已结案',
      };
      setDispositionFeedback(labels[status]);
      setTimeout(() => setDispositionFeedback(null), 3000);
      fetchCrises();
      fetchStats();
    }
  };

  const handleSaveNote = async () => {
    setIsSavingNote(true);
    const ok = await updateDisposition(
      activeSession.sessionId,
      activeSession.dispositionStatus,
      currentNote,
    );
    setIsSavingNote(false);
    if (ok) {
      setActiveSession((prev) => ({ ...prev, dispositionNote: currentNote }));
      setDispositionFeedback('处置说明已同步保存');
      setTimeout(() => setDispositionFeedback(null), 3000);
      fetchCrises();
      fetchStats();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-detail-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none"
    >
      <div className="bg-[#ffffff] w-full max-w-xl max-h-[92dvh] sm:max-h-[90vh] rounded-2xl sm:rounded-3xl border border-[#c4c7c5] shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#f0f4f9] px-4 sm:px-6 py-3 sm:py-4 border-b border-[#e1e3e1] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
            <Sparkles className="w-4 h-4 text-[#004a77]" />
            <h3 id="session-detail-title" className="text-xs sm:text-sm font-bold text-[#1f1f1f]">
              来访情绪简报 · #{activeSession.sessionId.slice(-6)}
            </h3>
            <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-[#e8f0fe] text-[#004a77] border border-[#d2e3fc]">
              AI 智能建档
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭窗口"
            className="p-1.5 rounded-full hover:bg-[#e1e3e1] text-[#747775] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto text-xs min-h-0 flex-1">
          {/* 危机个案穿透与处置流转卡片 (若为危机个案时呈现) */}
          {isCrisisCase && (
            <SessionCrisisInterventionSection
              session={activeSession}
              unmasked={unmasked}
              currentNote={currentNote}
              onNoteChange={setCurrentNote}
              onStatusChange={handleStatusChange}
              onSaveNote={handleSaveNote}
              isSavingNote={isSavingNote}
              dispositionFeedback={dispositionFeedback}
              onOpenUnmask={onOpenUnmask}
            />
          )}

          {/* 简报正文 (CBT评估与分析) */}
          <SessionCbtReportView session={activeSession} />
        </div>

        {/* Footer Actions */}
        <div className="bg-[#f8f9fa] px-4 sm:px-6 py-2.5 sm:py-3 border-t border-[#e1e3e1] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {!activeSession.isDeleted ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDelete(activeSession);
                }}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium text-[#ba1a1a] hover:bg-[#fce8e6] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>安全归档</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRestore(activeSession);
                }}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium text-[#166534] hover:bg-[#dcfce7] transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>恢复此档案</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleReEvaluate}
              disabled={isReEvaluating}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium text-[#004a77] bg-[#ffffff] border border-[#c4c7c5] hover:bg-[#f0f4f9] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="调用 AI 重新提炼本次会话的情绪评估简报"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReEvaluating ? 'animate-spin' : ''}`} />
              <span>{isReEvaluating ? '提炼中...' : '重新提炼'}</span>
            </button>

            {reEvaluateStatus && (
              <span
                className={`text-[10px] sm:text-[11px] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-medium transition-all ${
                  reEvaluateStatus.type === 'success'
                    ? 'text-[#166534] bg-[#dcfce7] border border-[#bbf7d0]'
                    : 'text-[#ba1a1a] bg-[#fee2e2] border border-[#fecaca]'
                }`}
              >
                {reEvaluateStatus.type === 'success' ? '✓ ' : '✕ '}
                {reEvaluateStatus.message}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors cursor-pointer text-center"
          >
            关闭 (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
