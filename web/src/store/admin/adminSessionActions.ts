import { AdminApiClient } from '../../lib/api/adminApiClient';
import type { AdminSessionItem } from '../../types';

export async function executeDeleteSession(
  sessionId: string,
  passcode: string,
  reason: string,
  operatorName: string,
  refreshFn: () => Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await AdminApiClient.deleteSession(sessionId, passcode, reason, operatorName);
    if (data.success) {
      await refreshFn();
      return { success: true };
    }
    return { success: false, error: data.error || '删除验证失败' };
  } catch (err: any) {
    return { success: false, error: err?.message || '网络异常' };
  }
}

export async function executeRestoreSession(
  sessionId: string,
  passcode: string,
  operatorName: string,
  refreshFn: () => Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await AdminApiClient.restoreSession(sessionId, passcode, operatorName);
    if (data.success) {
      await refreshFn();
      return { success: true };
    }
    return { success: false, error: data.error || '恢复操作失败' };
  } catch (err: any) {
    return { success: false, error: err?.message || '网络异常' };
  }
}

export async function executeReEvaluateSession(
  sessionId: string,
  transcript: string | undefined,
  updateSessionFn: (updater: (s: AdminSessionItem) => AdminSessionItem) => void,
): Promise<{ success: boolean; report?: any; session?: any; error?: string }> {
  try {
    const data = await AdminApiClient.reEvaluateSession(sessionId, transcript);
    if (data.success && data.report) {
      updateSessionFn((s) => ({
        ...s,
        deidentifiedReport: data.report,
        crisisLevel: data.session?.crisisLevel ?? s.crisisLevel,
        isCrisis: data.session?.isCrisis ?? (data.session?.crisisLevel >= 3 || s.isCrisis),
        crisisSummary: data.session?.crisisSummary ?? s.crisisSummary,
        coreConcerns: data.session?.coreConcerns ?? s.coreConcerns,
        emotionalValence: data.session?.emotionalValence ?? s.emotionalValence,
      }));
      return { success: true, report: data.report, session: data.session };
    }
    return { success: false, error: data.error || '重新解析失败' };
  } catch (err: any) {
    return { success: false, error: err?.message || '网络异常' };
  }
}
