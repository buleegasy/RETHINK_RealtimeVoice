import React from 'react';
import { Activity, FileText, Sparkles, Lightbulb } from 'lucide-react';
import type { AdminSessionItem } from '../../../types';

interface SessionCbtReportViewProps {
  session: AdminSessionItem;
}

export const SessionCbtReportView: React.FC<SessionCbtReportViewProps> = ({ session }) => {
  const report = session.deidentifiedReport;
  const concerns =
    session.coreConcerns && session.coreConcerns.length > 0 ? session.coreConcerns : ['常规交流'];

  // 获取真实的去标识化对话转写原文
  const rawTranscript = report?.deidentifiedTranscript?.trim() || '';

  // 获取真实的会谈观察与心境演进纪要
  const notes = report?.emotionalTrajectory?.deltaNotes?.trim() || session.crisisSummary || '';

  // 提取真实的思维与沟通特点（滤除空值与假套话）
  const distortions = (report?.cognitiveDistortions || [])
    .filter(
      (d: string) =>
        typeof d === 'string' &&
        d.trim().length > 0 &&
        !d.includes('未检测到显著偏执') &&
        !d.includes('阶段性现实困扰'),
    )
    .map((d: string) => d.trim());

  // 真实课后微行动建议
  const action = report?.homeworkAction?.trim() || '';
  const hasRealAction =
    action &&
    !action.includes('保持规律作息') &&
    !action.includes('深呼吸') &&
    !action.includes('写下最近的感受');

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 1. 会谈基本背景与真实议题 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f8f9fa] border border-[#e1e3e1] p-3 sm:p-3.5 rounded-xl sm:rounded-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#e8f0fe] text-[#004a77] flex items-center justify-center font-bold text-xs shrink-0">
            {report?.userDisplayName?.[0] || '访'}
          </div>
          <div>
            <span className="font-bold text-[#1f1f1f] text-sm block">
              {report?.userDisplayName || `来访者 #S${session.sessionId.slice(-4)}`}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#747775]">
              通话时长 {Math.floor(session.duration / 60)}分{session.duration % 60}秒 ·{' '}
              {new Date(session.createdAt * 1000).toLocaleString('zh-CN')}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {concerns.map((item: string, i: number) => (
            <span
              key={i}
              className="px-2.5 py-0.5 sm:py-1 bg-[#ffffff] border border-[#d2e3fc] text-[#004a77] rounded-full text-[10px] sm:text-[11px] font-medium shadow-2xs"
            >
              {item}
            </span>
          ))}
          {report?.evaluatedBy && (
            <span className="flex items-center gap-1 text-[9px] sm:text-[10px] text-[#004a77] bg-[#e8f0fe] border border-[#d2e3fc] px-2 py-0.5 rounded-full font-medium">
              <Sparkles className="w-2.5 h-2.5" />
              AI 督导纪要
            </span>
          )}
        </div>
      </div>

      {/* 2. 真实个案会谈纪要与心境观察 (MiniMax M3 手记) */}
      {notes && (
        <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-2">
          <div className="flex items-center gap-2 border-b border-[#f0f0f0] pb-2">
            <Activity className="w-3.5 h-3.5 text-[#004a77]" />
            <span className="font-semibold text-[#1f1f1f] text-xs">督导老师会谈纪要与心境观察</span>
          </div>
          <p className="text-xs text-[#333a40] leading-relaxed bg-[#f8f9fa] p-3 sm:p-3.5 rounded-xl border border-[#f0f2f5] whitespace-pre-wrap">
            {notes}
          </p>
        </div>
      )}

      {/* 3. 思维与沟通特点 (若识别出具体特点则真实呈现) */}
      {distortions.length > 0 && (
        <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-2">
          <span className="font-semibold text-[#1f1f1f] text-xs block">思维表现与沟通观察</span>
          <div className="text-xs text-[#444746] leading-relaxed bg-[#f8f9fa] p-3 sm:p-3.5 rounded-xl border border-[#f0f2f5]">
            {distortions.join('；')}。
          </div>
        </div>
      )}

      {/* 4. 真实协同微行动建议 (仅在真实讨论出具体行动时展示) */}
      {hasRealAction && (
        <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-1.5 text-xs text-[#92400e]">
          <div className="flex items-center gap-1.5 font-semibold text-[#b45309]">
            <Lightbulb className="w-3.5 h-3.5" />
            <span>课后微行动与协同关怀建议</span>
          </div>
          <p className="leading-relaxed whitespace-pre-wrap">{action}</p>
        </div>
      )}

      {/* 5. 真实会谈对话实录 (去标识化原文) */}
      <div className="bg-[#ffffff] border border-[#e1e3e1] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 space-y-2.5">
        <div className="flex items-center justify-between border-b border-[#f0f0f0] pb-2">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#004a77]" />
            <span className="font-semibold text-[#1f1f1f] text-xs">会谈对话实录（去标识化）</span>
          </div>
          <span className="text-[10px] text-[#747775]">已脱敏隐去姓名/班级等隐私</span>
        </div>

        {rawTranscript ? (
          <div className="text-xs text-[#1f1f1f] leading-relaxed bg-[#f8f9fa] p-3 sm:p-3.5 rounded-xl border border-[#f0f2f5] max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] sm:text-xs">
            {rawTranscript}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-[#747775] bg-[#f8f9fa] rounded-xl border border-dashed border-[#e1e3e1]">
            本次通话未采集到有效语音转写文本
          </div>
        )}
      </div>
    </div>
  );
};
