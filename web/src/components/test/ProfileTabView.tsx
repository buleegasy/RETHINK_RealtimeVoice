import React from 'react';
import { UserCheck, Shield, Clock, Sparkles, CheckCircle2 } from 'lucide-react';

export const ProfileTabView: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* 注入的学生情景档案 */}
      <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold text-slate-200">
              预载来访学生个人情景记忆档案 (Situational Memory)
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            首包即时注入
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
            <div className="text-[10px] text-slate-500">来访身份代号</div>
            <div className="text-slate-200 font-semibold mt-0.5">林同学 (高中二年级)</div>
          </div>
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
            <div className="text-[10px] text-slate-500">核心倾诉议题</div>
            <div className="text-slate-200 font-semibold mt-0.5">模考失利、排名压力与家庭期待</div>
          </div>
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
            <div className="text-[10px] text-slate-500">典型思维模式</div>
            <div className="text-indigo-300 font-semibold mt-0.5">灾难化思维、全或无归因倾向</div>
          </div>
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
            <div className="text-[10px] text-slate-500">积极赋能支点</div>
            <div className="text-emerald-300 font-semibold mt-0.5">理科思维敏锐、乐于探索证据</div>
          </div>
        </div>
      </div>

      {/* 挂机异步建档机制说明 */}
      <div className="p-3.5 rounded-lg bg-indigo-950/20 border border-indigo-500/30 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-semibold text-indigo-200">
            挂机后异步深度评估引擎 (DeepSeek V4 Flash Post-Session Evaluator)
          </h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed font-sans">
          为确保实时语音全双工响应速度低于 500ms，通话期间不执行大模型长程思考。
          当来访者挂机后，系统将自动触发异步流转通道，由{' '}
          <span className="font-semibold text-indigo-300">DeepSeek V4 Flash</span> 深度提炼：
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>1. 结构化个案简报</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
              归纳本次倾诉的核心议题、情绪峰值变化轨迹与干预阶段达标情况。
            </p>
          </div>

          <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>2. 认知歪曲与三栏表</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
              提取负性自动想法（NAT），完成自动化思维三栏表重构与去灾难化分析。
            </p>
          </div>

          <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>3. 定制化微行动作业</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
              设计 1-2 项可立即执行的低阻力微行动（如草稿纸法、五感着陆），沉淀至管理大盘。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
