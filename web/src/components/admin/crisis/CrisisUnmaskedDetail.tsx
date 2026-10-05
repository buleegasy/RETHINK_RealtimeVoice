import React, { useState } from 'react';
import { UserCheck, Phone, Copy, Check, FileCheck2, CheckCircle2, Save } from 'lucide-react';
import type { AdminCrisisItem, DispositionStatus, UnmaskedIdentity } from '../../../types';
import { useAdminStore } from '../../../store/adminStore';
import { copyToClipboard } from '../../../lib/clipboard';

interface CrisisUnmaskedDetailProps {
  crisis: AdminCrisisItem;
  identity: UnmaskedIdentity;
  onClose: () => void;
}

export const CrisisUnmaskedDetail: React.FC<CrisisUnmaskedDetailProps> = ({
  crisis,
  identity,
  onClose,
}) => {
  const { updateDisposition, fetchCrises, fetchStats } = useAdminStore();
  const [copied, setCopied] = useState(false);
  const [followupNote, setFollowupNote] = useState(crisis.dispositionNote || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const copyContact = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopied(false);
    }
  };

  const handleStatusChange = async (status: DispositionStatus) => {
    const ok = await updateDisposition(crisis.sessionId, status, followupNote);
    if (ok) {
      const statusLabels: Record<DispositionStatus, string> = {
        pending_contact: '已恢复为待跟进',
        intervened: '已标记为线下已介入并保存说明',
        closed: '已标记为已结案并保存说明',
      };
      setActionFeedback(statusLabels[status]);
      setTimeout(() => setActionFeedback(null), 3000);
      fetchStats();
      fetchCrises();
    }
  };

  const handleSaveNoteOnly = async () => {
    setIsSavingNote(true);
    const ok = await updateDisposition(crisis.sessionId, crisis.dispositionStatus, followupNote);
    setIsSavingNote(false);
    if (ok) {
      setActionFeedback('处置跟进说明已保存');
      setTimeout(() => setActionFeedback(null), 3000);
      fetchStats();
      fetchCrises();
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl p-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-[#166534] font-medium">
          <UserCheck className="w-4 h-4" />
          <span>二次验证通过 · 身份已安全解密</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-[#15803d]">
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>已记入审计</span>
        </div>
      </div>

      <div className="bg-[#f8f9fa] border border-[#e1e3e1] rounded-2xl p-4 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[#747775] block mb-0.5">学生姓名</span>
            <span className="text-base font-bold text-[#1f1f1f]">{identity.realName}</span>
          </div>
          <div>
            <span className="text-[#747775] block mb-0.5">学号</span>
            <span className="text-sm font-semibold text-[#004a77] font-mono">
              {identity.username}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#e1e3e1]">
          <div>
            <span className="text-[#747775] block mb-0.5">年级班级</span>
            <span className="text-sm font-medium text-[#1f1f1f]">{identity.gradeClass}</span>
          </div>
          <div>
            <span className="text-[#747775] block mb-0.5">终端位置</span>
            <span className="text-sm font-medium text-[#1f1f1f]">{identity.boothLocation}</span>
          </div>
        </div>

        <div className="pt-2 border-t border-[#e1e3e1]">
          <span className="text-[#747775] block mb-1">紧急联系人 / 监护人电话</span>
          <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-[#c4c7c5]">
            <span className="font-semibold text-[#1f1f1f] flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-[#146c2e]" />
              {identity.emergencyContact}
            </span>
            <button
              type="button"
              onClick={() => copyContact(identity.emergencyContact)}
              className="px-2.5 py-1 rounded-lg bg-[#f0f4f9] hover:bg-[#e9eef6] text-[#004a77] font-medium flex items-center gap-1 transition-colors text-[11px] cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-[#146c2e]" /> 已复制
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> 复制联系电话
                </>
              )}
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-[#e1e3e1]">
          <span className="text-[#747775] block mb-1">危机判定记录</span>
          <p className="text-xs text-[#ba1a1a] bg-[#fff5f5] p-2.5 rounded-xl border border-[#fed7d7] leading-relaxed">
            {identity.crisisNote || crisis.crisisSummary}
          </p>
        </div>
      </div>

      {/* 线下跟进记录输入 */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[#1f1f1f] block">即时记录跟进说明</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={followupNote}
            onChange={(e) => setFollowupNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSaveNoteOnly();
              }
            }}
            placeholder="填写与家长或学生沟通的情况 (按回车快速保存)..."
            className="flex-1 px-3 py-2 text-xs bg-white rounded-xl border border-[#c4c7c5] focus:outline-none focus:border-[#004a77]"
          />
          <button
            type="button"
            onClick={handleSaveNoteOnly}
            disabled={isSavingNote}
            className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingNote ? '保存中' : '保存说明'}</span>
          </button>
        </div>
      </div>

      {/* 快捷处置流转闭环 */}
      <div className="bg-[#f0f4f9] border border-[#d2e3fc] rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#004a77]">流转操作与处置状态</span>
          {actionFeedback && (
            <span className="text-[11px] text-[#15803d] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {actionFeedback}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleStatusChange('intervened')}
            className="flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold bg-[#004a77] text-white hover:bg-[#003355] transition-colors cursor-pointer text-center"
          >
            已电话联系 · 标记为已介入
          </button>
          <button
            type="button"
            onClick={() => handleStatusChange('closed')}
            className="py-1.5 px-3 rounded-xl text-xs font-medium bg-[#ffffff] text-[#146c2e] border border-[#bbf7d0] hover:bg-[#dcfce7] transition-colors cursor-pointer text-center"
          >
            危机解除 · 结案
          </button>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors cursor-pointer"
        >
          完成并返回
        </button>
      </div>
    </div>
  );
};
