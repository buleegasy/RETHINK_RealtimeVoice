import React, { useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  X,
  Send,
  FileCheck2,
  Bell,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useAdminStore } from '../../store/adminStore';
import { apiFetch } from '../../lib/api';

interface AdminSettingsModalProps {
  onClose: () => void;
}

export const AdminSettingsModal: React.FC<AdminSettingsModalProps> = ({ onClose }) => {
  const { auditLogs, fetchAuditLogs } = useAdminStore();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'webhook' | 'audit'>('webhook');

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleTestWebhook = async () => {
    if (!webhookUrl.trim() || !webhookUrl.startsWith('http')) {
      setWebhookStatus({
        type: 'error',
        msg: '请输入以 http:// 或 https:// 开头的有效 Webhook URL',
      });
      return;
    }
    setIsTestingWebhook(true);
    setWebhookStatus(null);
    try {
      const res = await apiFetch('/api/admin/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: webhookUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setWebhookStatus({
          type: 'success',
          msg: '测试通知发送成功！机器人端应已收到危机模拟告警。',
        });
      } else {
        setWebhookStatus({ type: 'error', msg: `发送失败: ${data.error || '无法连通目标服务'}` });
      }
    } catch (e: any) {
      setWebhookStatus({ type: 'error', msg: `请求异常: ${e?.message || '网络连接超时'}` });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 select-none"
    >
      <div className="bg-[#ffffff] w-full max-w-xl max-h-[90dvh] sm:max-h-[85vh] rounded-2xl sm:rounded-3xl border border-[#c4c7c5] shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#f0f4f9] px-4 sm:px-6 py-3 sm:py-4 border-b border-[#e1e3e1] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#004a77]" />
            <h3 id="settings-modal-title" className="text-xs sm:text-sm font-bold text-[#1f1f1f]">
              设置与审计
            </h3>
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

        <div className="px-4 sm:px-6 pt-3 sm:pt-4 border-b border-[#e1e3e1] flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('webhook')}
            className={`px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'webhook'
                ? 'bg-[#004a77] text-white shadow-xs'
                : 'text-[#444746] hover:bg-[#f0f4f9]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Webhook 危机告警</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('audit')}
            className={`px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'audit'
                ? 'bg-[#004a77] text-white shadow-xs'
                : 'text-[#444746] hover:bg-[#f0f4f9]'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>安全审计记录 ({auditLogs.length})</span>
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs min-h-0 flex-1">
          {activeSubTab === 'webhook' ? (
            <div className="space-y-4">
              <div className="bg-[#f8f9fa] border border-[#e1e3e1] rounded-xl sm:rounded-2xl p-3.5 space-y-1.5 text-xs text-[#5e5e5e]">
                <span className="font-semibold text-[#1f1f1f] block">
                  实时外呼与多端即时通讯联动
                </span>
                <p className="leading-relaxed text-[11px] sm:text-xs">
                  当终端检测到极高危自杀或伤人风险时，系统除在控制台蜂鸣告警与锁定档案外，可同步将脱敏告警推送到企业微信、飞书或钉钉群机器人中。
                </p>
              </div>

              <div className="space-y-2">
                <label className="font-medium text-[#1f1f1f] block font-mono">
                  Webhook URL (企业微信 / 飞书 / 钉钉机器人)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-[#c4c7c5] bg-[#ffffff] focus:outline-none focus:border-[#004a77]"
                  />
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook}
                    className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors flex items-center gap-1.5 disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>{isTestingWebhook ? '发送中...' : '测试连通性'}</span>
                  </button>
                </div>
                {webhookStatus && (
                  <div
                    className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                      webhookStatus.type === 'success'
                        ? 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]'
                        : 'bg-[#fce8e6] text-[#ba1a1a] border-[#f2b8b5]'
                    }`}
                  >
                    {webhookStatus.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-[#16a34a]" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-[#ba1a1a]" />
                    )}
                    <span>{webhookStatus.msg}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {auditLogs.length === 0 ? (
                <div className="text-center py-8 text-[#747775] bg-[#f8f9fa] rounded-2xl border border-dashed border-[#e1e3e1]">
                  暂无安全身份穿透与档案变更审计记录
                </div>
              ) : (
                <div className="border border-[#e1e3e1] rounded-2xl overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[420px]">
                    <thead className="bg-[#f0f4f9] text-[#444746] font-semibold border-b border-[#e1e3e1]">
                      <tr>
                        <th className="py-2.5 px-3">发生时间</th>
                        <th className="py-2.5 px-3">操作教师</th>
                        <th className="py-2.5 px-3">会话编号</th>
                        <th className="py-2.5 px-3">操作事由</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e1e3e1]">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[#f8f9fa] transition-colors">
                          <td className="py-2 px-3 text-[#747775] whitespace-nowrap">
                            {new Date(log.created_at * 1000).toLocaleString('zh-CN')}
                          </td>
                          <td className="py-2 px-3 font-medium text-[#1f1f1f] whitespace-nowrap">
                            {log.operator_name}
                          </td>
                          <td className="py-2 px-3 font-mono text-[#004a77] whitespace-nowrap">
                            #{log.session_id.slice(-6)}
                          </td>
                          <td className="py-2 px-3 text-[#ba1a1a]">{log.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-[#f8f9fa] px-4 sm:px-6 py-2.5 sm:py-3 border-t border-[#e1e3e1] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-medium bg-[#004a77] text-white hover:bg-[#003355] transition-colors cursor-pointer text-center"
          >
            完成 (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
