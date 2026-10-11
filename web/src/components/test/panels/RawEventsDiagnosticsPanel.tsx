import React, { useState } from 'react';
import { Activity, Copy, Check, FileDown, BookOpen, Cpu } from 'lucide-react';
import { useTelemetryStore } from '../../../store/telemetryStore';

export const RawEventsDiagnosticsPanel: React.FC = () => {
  const {
    shadowDirectives,
    latestShadowDirective,
    activeCbtStage,
    cbtFsmState,
    ragRetrievals,
    rttMs,
    avgRttMs,
    ttftMs,
    lastShadowDurationMs,
    totalAudioChunks,
    totalBargeIns,
    jitter,
    activeTransport,
    isConnected,
    duplexPhase,
  } = useTelemetryStore();

  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const rawPayload = {
    architecture: 'Live-1 Direct + 16 CBT Capsules (TTFT < 500ms)',
    engine: 'DeepSeek V4 Flash',
    postSessionEvaluator: 'DeepSeek V4 Flash',
    transport: activeTransport,
    rtcDataChannel: activeTransport === 'webrtc' ? 'minimax-events' : null,
    gatewayRttMs: rttMs,
    avgRttMs,
    ttftMs,
    lastShadowDurationMs,
    cbtStage: activeCbtStage,
    fsmValence: cbtFsmState.emotionalValence,
    fsmExposure: cbtFsmState.cognitiveExposure,
    fsmLocked: cbtFsmState.isEmotionallyLocked,
    cbtCapsulesPreloaded: 16,
    ragRetrievalCount: ragRetrievals.length,
    latestRagTopic: ragRetrievals[0]?.topic || null,
    latestRagScore: ragRetrievals[0]?.score || null,
    jitterWatermarkMs: jitter.bufferedMs,
    jitterBuffering: jitter.isBuffering,
    totalAudioChunks,
    totalBargeIns,
    duplexPhase,
    wsConnected: isConnected,
    latestShadowDirective: latestShadowDirective || null,
  };

  const handleCopyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(rawPayload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleExportReport = () => {
    const markdown = `# RETHINK Realtime E2E 诊断测试报告
- 生成时间: ${new Date().toLocaleString()}
- 传输架构: ${activeTransport === 'webrtc' ? 'WebRTC (UDP/Opus 48kHz)' : 'WebSocket (PCM16)'}
- 认知引擎: DeepSeek V4 Flash
- 首帧响应时延 (TTFT): ${ttftMs > 0 ? `${ttftMs}ms` : '未测'}
- 网关往返时延 (RTT): 当前 ${rttMs}ms, 平均 ${avgRttMs}ms
- CBT 状态机: 阶段 ${cbtFsmState.stage}, 情绪效价 ${cbtFsmState.emotionalValence.toFixed(2)}, 认知暴露度 ${(cbtFsmState.cognitiveExposure * 100).toFixed(0)}%
- RAG 召回命中数: ${ragRetrievals.length} 次
- 音频分片吞吐: ${totalAudioChunks} 帧, 插话打断: ${totalBargeIns} 次

## RAG 知识检索详情
${ragRetrievals
  .map(
    (r, i) =>
      `### ${i + 1}. [${r.source}] ${r.topic || '未命名'} (得分: ${(r.score * 100).toFixed(0)}%, 耗时: ${r.durationMs}ms)
- 查询文本: "${r.query}"
- 分类: ${r.category || '通用'}
- 共情引导: ${r.empathyLead || '无'}
- 苏格拉底追问: ${r.socraticPivot || '无'}
- 禁语雷区: ${(r.tabooPhrases || []).join(' / ') || '无'}`,
  )
  .join('\n\n')}

## 影子大脑认知指导 (DeepSeek V4 Flash)
${shadowDirectives
  .map(
    (s, i) =>
      `### ${i + 1}. 轮次 #${s.turnSequence} (耗时: ${s.durationMs}ms)
- 学生原话: "${s.userText}"
- 认知指导: ${s.cognitiveHint || '直通放行'}`,
  )
  .join('\n\n')}
`;
    void navigator.clipboard.writeText(markdown);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const latestRag = ragRetrievals[0];

  return (
    <div className="flex flex-col gap-2.5 min-h-0 h-full overflow-y-auto pr-0.5 font-mono select-none">
      {/* 1. 操作条 */}
      <div className="flex items-center justify-between bg-[#0B0F19] border border-slate-800 rounded-md p-2 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <Activity className="w-3.5 h-3.5 text-purple-400" />
          <span className="font-semibold">端到端遥测诊断流</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyJson}
            className="flex items-center gap-1 px-2 h-7 rounded bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-300 hover:text-white border border-slate-800 transition cursor-pointer"
          >
            {copiedJson ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{copiedJson ? '已复制' : '复制 JSON'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportReport}
            className="flex items-center gap-1 px-2.5 h-7 rounded bg-indigo-600 hover:bg-indigo-500 text-[11px] text-white transition cursor-pointer shadow-sm shadow-indigo-950"
          >
            {copiedReport ? <Check className="w-3 h-3" /> : <FileDown className="w-3 h-3" />}
            <span>{copiedReport ? '已复制' : '导出测试报告'}</span>
          </button>
        </div>
      </div>

      {/* 2. 影子大脑推理与 RAG 知识检索汇总 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
        {/* 影子大脑卡片 */}
        <div className="bg-[#0B0F19] border border-slate-800 rounded-md p-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <div className="flex items-center gap-1 text-indigo-300 font-semibold">
              <Cpu className="w-3.5 h-3.5" />
              <span>影子大脑认知指导</span>
            </div>
            <span>{lastShadowDurationMs > 0 ? `${lastShadowDurationMs}ms` : '0ms'}</span>
          </div>
          <div className="text-[11px] text-slate-300 line-clamp-2 bg-slate-950 p-1.5 rounded border border-slate-800">
            {latestShadowDirective?.cognitiveHint || '直通流式（无干预指令）'}
          </div>
        </div>

        {/* RAG 知识检索卡片 */}
        <div className="bg-[#0B0F19] border border-slate-800 rounded-md p-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <div className="flex items-center gap-1 text-cyan-300 font-semibold">
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>RAG 知识检索与胶囊</span>
            </div>
            <span>{latestRag ? `${(latestRag.score * 100).toFixed(0)}%` : 'BGE-M3'}</span>
          </div>
          <div className="text-[11px] text-slate-300 bg-slate-950 p-1.5 rounded border border-slate-800 space-y-0.5">
            <div className="flex items-center justify-between truncate">
              <span className="text-slate-400 truncate max-w-[130px]">
                {latestRag?.topic || '16 组 CBT 胶囊预载'}
              </span>
              <span className="text-cyan-400 font-bold ml-1">
                {latestRag ? `${latestRag.durationMs}ms` : '预载就绪'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>分类: {latestRag?.category || '通用'}</span>
              <span>召回: {ragRetrievals.length} 次</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 原始遥测 JSON 帧 */}
      <div className="flex-1 min-h-[180px] bg-[#0B0F19] border border-slate-800 rounded-md flex flex-col overflow-hidden">
        <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-slate-200">实时遥测原始数据帧</span>
          <span className="text-[10px] text-slate-500">JSON</span>
        </div>

        <div className="flex-1 min-h-0 p-2.5 overflow-auto bg-slate-950 font-mono text-[11px] text-slate-300 leading-relaxed">
          <pre className="whitespace-pre-wrap break-all">{JSON.stringify(rawPayload, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
};
