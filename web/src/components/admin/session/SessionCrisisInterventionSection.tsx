import React, { useState } from 'react';
import {
  AlertTriangle,
  UserCheck,
  Eye,
  Phone,
  Copy,
  Check,
  Save,
  CheckCircle2,
} from 'lucide-react';
import type {
  AdminSessionItem,
  DispositionStatus,
  AdminCrisisItem,
  UnmaskedIdentity,
} from '../../../types';
import { copyToClipboard } from '../../../lib/clipboard';

interface SessionCrisisInterventionSectionProps {
  session: AdminSessionItem;
  unmasked?: UnmaskedIdentity;
  currentNote: string;
  onNoteChange: (val: string) => void;
  onStatusChange: (status: DispositionStatus) => void;
  onSaveNote: () => void;
  isSavingNote: boolean;
  dispositionFeedback: string | null;
  onOpenUnmask: (crisisItem: AdminCrisisItem) => void;
}

export const SessionCrisisInterventionSection: React.FC<SessionCrisisInterventionSectionProps> = ({
  session,
  unmasked,
  currentNote,
  onNoteChange,
  onStatusChange,
  onSaveNote,
  isSavingNote,
  dispositionFeedback,
  onOpenUnmask,
}) => {
  const [copiedPhone, setCopiedPhone] = useState(false);

  const copyContact = async (text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } else {
      setCopiedPhone(false);
    }
  };

  const toCrisisItem = (): AdminCrisisItem => ({
    sessionId: session.sessionId,
    duration: session.duration,
    crisisLevel: session.crisisLevel,
    crisisSummary: session.crisisSummary,
    coreConcerns: session.coreConcerns,
    emotionalValence: session.emotionalValence,
    dispositionStatus: session.dispositionStatus,
    dispositionNote: session.dispositionNote,
    createdAt: session.createdAt,
    hasEncryptedIdentity: session.hasEncryptedIdentity,
  });

  return (
    <div className="bg-[#fce8e6]/60 border border-[#f2b8b5] rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 text-[#ba1a1a] font-bold text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>极高危危机个案 (Level {session.crisisLevel || 3})</span>
        </div>

        <div className="flex items-center gap-1 bg-white p-0.5 rounded-full border border-[#f2b8b5] text-[11px]">
          <button
            type="button"
            onClick={() => onStatusChange('pending_contact')}
            className={`px-2 py-0.5 rounded-full cursor-pointer transition-all ${
              session.dispositionStatus === 'pending_contact'
                ? 'bg-[#ba1a1a] text-white font-bold'
                : 'text-[#601410] hover:bg-[#fce8e6]'
            }`}
          >
            待跟进
          </button>
          <button
            type="button"
            onClick={() => onStatusChange('intervened')}
            className={`px-2 py-0.5 rounded-full cursor-pointer transition-all ${
              session.dispositionStatus === 'intervened'
                ? 'bg-[#004a77] text-white font-bold'
                : 'text-[#004a77] hover:bg-[#f0f4f9]'
            }`}
          >
            已介入
          </button>
          <button
            type="button"
            onClick={() => onStatusChange('closed')}
            className={`px-2 py-0.5 rounded-full cursor-pointer transition-all ${
              session.dispositionStatus === 'closed'
                ? 'bg-[#146c2e] text-white font-bold'
                : 'text-[#146c2e] hover:bg-[#f0fdf4]'
            }`}
          >
            已结案
          </button>
        </div>
      </div>

      {/* 身份解密状态 */}
      {!unmasked ? (
        <div className="flex items-center justify-between bg-white/80 p-2.5 rounded-xl border border-[#f2b8b5]">
          <span className="text-[11px] text-[#601410]">
            学生身份在脱敏保护中，如需紧急干预可输入口令穿透解密
          </span>
          <button
            type="button"
            onClick={() => onOpenUnmask(toCrisisItem())}
            className="px-3 py-1 rounded-full text-xs font-semibold bg-[#ba1a1a] text-white hover:bg-[#93000a] transition-colors flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>查验身份</span>
          </button>
        </div>
      ) : (
        <div className="bg-white p-3 rounded-xl border border-[#bbf7d0] space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#166534] flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              {unmasked.realName} (学号: {unmasked.username} · {unmasked.gradeClass})
            </span>
            <span className="text-[#15803d] font-mono">{unmasked.boothLocation}</span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-[#f0f0f0]">
            <span className="text-[#444746] flex items-center gap-1">
              <Phone className="w-3 h-3 text-[#146c2e]" />
              紧急电话: {unmasked.emergencyContact}
            </span>
            <button
              type="button"
              onClick={() => copyContact(unmasked.emergencyContact)}
              className="px-2 py-0.5 rounded bg-[#f0f4f9] hover:bg-[#e9eef6] text-[#004a77] text-[10px] font-medium flex items-center gap-1 cursor-pointer"
            >
              {copiedPhone ? (
                <>
                  <Check className="w-3 h-3 text-[#146c2e]" /> 已复制
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" /> 复制电话
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 处置说明输入 */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={currentNote}
          onChange={(e) => onNoteChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSaveNote();
            }
          }}
          placeholder="填写线下介入跟进说明..."
          title="按回车键可直接保存说明"
          className="flex-1 px-3 py-1.5 text-xs bg-white rounded-lg border border-[#c4c7c5] focus:outline-none focus:border-[#004a77]"
        />
        <button
          type="button"
          onClick={onSaveNote}
          disabled={isSavingNote}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Save className="w-3 h-3" />
          <span>{isSavingNote ? '保存中' : '保存说明'}</span>
        </button>
      </div>

      {dispositionFeedback && (
        <div className="text-[11px] text-[#15803d] font-semibold flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{dispositionFeedback}</span>
        </div>
      )}
    </div>
  );
};
