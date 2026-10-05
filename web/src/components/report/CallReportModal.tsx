import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, CheckCircle2, Clock, User, Sparkles, Printer, X } from 'lucide-react';
import { useBoothStore } from '../../store/boothStore';

export const CallReportModal: React.FC = () => {
  const { latestReport, isReportModalOpen, setReportModalOpen } = useBoothStore();

  useEffect(() => {
    if (!isReportModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setReportModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReportModalOpen, setReportModalOpen]);

  if (!isReportModalOpen || !latestReport) return null;

  const durationMin = Math.floor(latestReport.durationSeconds / 60);
  const durationSec = latestReport.durationSeconds % 60;
  const durationText = `${durationMin}分${durationSec}秒`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => {
          if (e.target === e.currentTarget) setReportModalOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setReportModalOpen(false);
        }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm select-none"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg bg-white rounded-2xl border-2 border-black/15 shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          <div className="px-6 py-4 border-b border-black/10 flex items-center justify-between bg-[#f8f9fa]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-medium tracking-wide text-black font-sans">
                倾诉通话简报 (脱敏版)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setReportModalOpen(false)}
              aria-label="关闭简报"
              className="p-1 text-[#747775] hover:text-black rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-5 text-sm font-sans text-black leading-relaxed">
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-black/10 bg-[#f8f9fa] font-mono text-xs">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-[#747775]" />
                <span>来访称呼: {latestReport.userDisplayName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#747775]" />
                <span>通话时长: {durationText}</span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-mono tracking-wider uppercase text-[#747775] mb-2">
                探讨核心议题
              </h3>
              <ul className="list-disc list-inside space-y-1 text-black">
                {latestReport.coreConcerns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-mono tracking-wider uppercase text-[#747775] mb-2">
                情绪与思维觉察
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const filtered = (latestReport.cognitiveDistortions || []).filter(
                    (d) =>
                      !d.includes('阶段性现实困扰') && !d.includes('未检测到显著偏执型认知歪曲'),
                  );
                  const list = filtered.length > 0 ? filtered : ['表达自然，未见负向认知偏差'];
                  return list.map((d, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-md text-xs border border-black/15 bg-[#f8f9fa] font-mono"
                    >
                      {d}
                    </span>
                  ));
                })()}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-mono tracking-wider uppercase text-[#747775] mb-2">
                情绪转变轨迹
              </h3>
              <div className="p-3 rounded-xl border border-black/10 bg-[#f8f9fa] space-y-1.5 text-xs">
                <div>
                  <span className="font-semibold text-[#747775]">初始状态: </span>
                  <span>{latestReport.emotionalTrajectory.initial}</span>
                </div>
                <div>
                  <span className="font-semibold text-[#747775]">挂机状态: </span>
                  <span className="text-emerald-700 font-medium">
                    {latestReport.emotionalTrajectory.final}
                  </span>
                </div>
              </div>
            </div>

            {latestReport.homeworkAction &&
              latestReport.homeworkAction.trim() !== '' &&
              !latestReport.homeworkAction.includes('保持规律作息') &&
              !latestReport.homeworkAction.includes('写下最近的感受') && (
                <div>
                  <h3 className="text-xs font-mono tracking-wider uppercase text-[#747775] mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-black" />
                    <span>课后微行动建议</span>
                  </h3>
                  <p className="p-3 rounded-xl border border-black/15 bg-white text-xs leading-relaxed text-neutral-800">
                    {latestReport.homeworkAction}
                  </p>
                </div>
              )}
          </div>

          <div className="p-4 border-t border-black/10 bg-[#f8f9fa] flex gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 py-2.5 px-4 rounded-lg border border-black/20 text-xs font-mono tracking-wider hover:border-black transition-all flex items-center justify-center gap-1.5 bg-white cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>打印简报</span>
            </button>
            <button
              type="button"
              onClick={() => setReportModalOpen(false)}
              className="flex-1 py-2.5 px-4 rounded-lg bg-black text-white text-xs font-mono tracking-wider hover:bg-neutral-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>完成，重新待机</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
