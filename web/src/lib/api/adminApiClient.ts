import type {
  AdminStats,
  AdminCrisisItem,
  AdminSessionItem,
  UnmaskedIdentity,
  CrisisAuditLog,
  DispositionStatus,
  UserProfile,
} from '../../types';
import { apiFetch } from '../api';
import {
  computeStatsFromLocalSessions,
  buildZeroStats,
  getLocalRealSessions,
  tryFetchCloudStats,
  mergeCloudWithLocal,
} from './adminAnalytics';

export { computeStatsFromLocalSessions, buildZeroStats };

/**
 * 管理后台 API 客户端 (AdminApiClient)
 * 职责：封装与 Worker 管理后端的高可用安全通信（自动附加 Bearer 鉴权凭证）
 */
export class AdminApiClient {
  public static async login(
    username: string,
    password: string,
  ): Promise<{ success: boolean; token?: string; user?: UserProfile; error?: string }> {
    const res = await apiFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  }

  public static async fetchStats(): Promise<AdminStats> {
    const localSessions = getLocalRealSessions();
    const cloudStats = await tryFetchCloudStats();

    if (cloudStats && cloudStats.totalSessions > 0) {
      return mergeCloudWithLocal(cloudStats, localSessions);
    }

    return computeStatsFromLocalSessions(localSessions);
  }

  public static async fetchCrises(): Promise<AdminCrisisItem[]> {
    try {
      const res = await apiFetch('/api/admin/crises');
      const data = await res.json();
      let list: AdminCrisisItem[] = [];
      if (data.success && Array.isArray(data.crises)) {
        list = data.crises;
      }
      list = list.filter(
        (s) => !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_'),
      );

      // 合并本地真实危机记录
      try {
        const rawLocal =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem('rethink_real_sessions')
            : null;
        if (rawLocal) {
          const localList: AdminSessionItem[] = JSON.parse(rawLocal);
          if (Array.isArray(localList)) {
            for (const loc of localList) {
              if (
                (loc.isCrisis || loc.crisisLevel >= 3) &&
                !loc.sessionId.startsWith('sess_sample_') &&
                !loc.sessionId.startsWith('mock_') &&
                !list.some((c) => c.sessionId === loc.sessionId)
              ) {
                list.push({
                  sessionId: loc.sessionId,
                  duration: loc.duration,
                  crisisLevel: loc.crisisLevel,
                  crisisSummary: loc.crisisSummary,
                  coreConcerns: loc.coreConcerns,
                  emotionalValence: loc.emotionalValence,
                  dispositionStatus: loc.dispositionStatus,
                  dispositionNote: loc.dispositionNote,
                  createdAt: loc.createdAt,
                  hasEncryptedIdentity: loc.hasEncryptedIdentity,
                });
              }
            }
          }
        }
      } catch {}

      list.sort((a, b) => b.createdAt - a.createdAt);
      return list;
    } catch (err) {
      console.warn('[AdminApiClient] 获取危机事件列表异常:', err);
      return [];
    }
  }

  public static async fetchSessions(
    crisisOnly = false,
    includeDeleted = false,
  ): Promise<AdminSessionItem[]> {
    try {
      const res = await apiFetch(
        `/api/admin/sessions?crisisOnly=${crisisOnly ? 'true' : 'false'}&includeDeleted=${includeDeleted ? 'true' : 'false'}`,
      );
      const data = await res.json();
      let serverSessions: AdminSessionItem[] = [];
      if (data.success && Array.isArray(data.sessions)) {
        serverSessions = data.sessions;
      }

      // 严禁假数据进入展示层，真实反映服务端记录
      serverSessions = serverSessions.filter(
        (s) => !s.sessionId.startsWith('sess_sample_') && !s.sessionId.startsWith('mock_'),
      );

      // 合并本地真实通话建档记录（确保刚在终端完成的倾诉在离线或冷启动时也能秒级呈现在档案库中）
      try {
        const rawLocal =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem('rethink_real_sessions')
            : null;
        if (rawLocal) {
          const localList: AdminSessionItem[] = JSON.parse(rawLocal);
          if (Array.isArray(localList)) {
            // 清理并剔除包含历史假模板套话的残留记录
            const sanitizedLocalList = localList.filter((loc) => {
              if (loc.sessionId.startsWith('sess_sample_') || loc.sessionId.startsWith('mock_')) {
                return false;
              }
              const concerns = Array.isArray(loc.coreConcerns) ? loc.coreConcerns : [];
              const hasFakeTemplate = concerns.some(
                (c: string) =>
                  typeof c === 'string' && (c.includes('展开的真实倾诉') || c.includes('围绕“')),
              );
              const summary =
                loc.crisisSummary ||
                (loc as any).deidentifiedReport?.emotionalTrajectory?.deltaNotes ||
                '';
              const isFakePsychobabble =
                summary.includes('情绪承压与倾诉表达') && summary.includes('完成初步表达');
              return !hasFakeTemplate && !isFakePsychobabble;
            });

            if (sanitizedLocalList.length !== localList.length) {
              localStorage.setItem('rethink_real_sessions', JSON.stringify(sanitizedLocalList));
            }

            for (const loc of sanitizedLocalList) {
              if (!serverSessions.some((s) => s.sessionId === loc.sessionId)) {
                if (!crisisOnly || loc.isCrisis || loc.crisisLevel >= 3) {
                  serverSessions.push(loc);
                }
              }
            }
          }
        }
      } catch {}

      serverSessions.sort((a, b) => b.createdAt - a.createdAt);
      return serverSessions;
    } catch (err) {
      console.warn('[AdminApiClient] 获取个案档案列表异常:', err);
      return [];
    }
  }

  public static async cleanMockData(): Promise<{ success: boolean; purged?: number }> {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('rethink_real_sessions');
      }
      const res = await apiFetch('/api/admin/clean-mock-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return await res.json();
    } catch (err) {
      console.warn('[AdminApiClient] 清理假数据异常:', err);
      return { success: false };
    }
  }

  public static async fetchAuditLogs(): Promise<CrisisAuditLog[]> {
    try {
      const res = await apiFetch('/api/admin/audit-logs');
      const data = await res.json();
      return data.success && Array.isArray(data.logs) ? data.logs : [];
    } catch (err) {
      console.warn('[AdminApiClient] 获取审计日志异常:', err);
      return [];
    }
  }

  public static async unmaskCrisis(
    sessionId: string,
    passcode: string,
    operatorName: string,
  ): Promise<{ success: boolean; realIdentity?: UnmaskedIdentity; error?: string }> {
    const res = await apiFetch('/api/admin/crisis/unmask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        secondary_passcode: passcode,
        operator_name: operatorName,
      }),
    });
    return res.json();
  }

  public static async updateDisposition(
    sessionId: string,
    status: DispositionStatus,
    note?: string,
  ): Promise<boolean> {
    try {
      const res = await apiFetch('/api/admin/crisis/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          status,
          note: note || '',
        }),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.warn('[AdminApiClient] 更新处置状态异常:', err);
      return false;
    }
  }

  public static async deleteSession(
    sessionId: string,
    passcode: string,
    reason: string,
    operatorName: string,
  ): Promise<{ success: boolean; error?: string }> {
    const res = await apiFetch('/api/admin/sessions/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        secondary_passcode: passcode,
        reason,
        operator_name: operatorName,
      }),
    });
    return res.json();
  }

  public static async restoreSession(
    sessionId: string,
    passcode: string,
    operatorName: string,
  ): Promise<{ success: boolean; error?: string }> {
    const res = await apiFetch('/api/admin/sessions/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        secondary_passcode: passcode,
        operator_name: operatorName,
      }),
    });
    return res.json();
  }

  public static async reEvaluateSession(
    sessionId: string,
    transcript?: string,
  ): Promise<{ success: boolean; report?: any; session?: any; error?: string }> {
    const res = await apiFetch('/api/admin/sessions/re-evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, transcript }),
    });
    return res.json();
  }
}
