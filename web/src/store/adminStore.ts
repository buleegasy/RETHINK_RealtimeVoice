import { create } from 'zustand';
import type { UserProfile, DispositionStatus } from '../types';
import { AdminApiClient } from '../lib/api/adminApiClient';
import type { AdminState } from './admin/adminTypes';
import { playAdminBuzzer } from './admin/buzzer';
import {
  executeDeleteSession,
  executeRestoreSession,
  executeReEvaluateSession,
} from './admin/adminSessionActions';

export type { AdminState };

const STORAGE_KEY = 'rethink_teacher_auth';

function getStoredAuth(): { token: string | null; user: UserProfile | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { token: null, user: null };
}

export const useAdminStore = create<AdminState>((set, get) => {
  const initial = getStoredAuth();

  return {
    isAuthenticated: Boolean(initial.token),
    token: initial.token,
    teacherProfile: initial.user,
    activeTab: 'pulse',
    stats: null,
    isLoadingStats: false,
    statsError: null,
    crises: [],
    sessions: [],
    showArchived: false,
    unmaskedMap: {},
    auditLogs: [],
    buzzerEnabled: true,
    isLoading: false,
    error: null,
    selectedSession: null,
    sessionFilterTag: null,
    crisisFilterStatus: 'all',
    dismissedAlertSessionIds: [],
    lastStatsRefreshTime: null,

    login: async (username: string, password: string) => {
      set({ isLoading: true, error: null });
      try {
        const data = await AdminApiClient.login(username, password);
        if (data.success && data.token) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, user: data.user }));
          set({
            isAuthenticated: true,
            token: data.token,
            teacherProfile: data.user || null,
            isLoading: false,
          });
          await get().fetchStats();
          await get().fetchCrises();
          return true;
        }
        set({ isLoading: false, error: data.error || '登录失败' });
        return false;
      } catch (e: any) {
        set({ isLoading: false, error: e?.message || '网络连接失败' });
        return false;
      }
    },

    logout: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({
        isAuthenticated: false,
        token: null,
        teacherProfile: null,
        stats: null,
        isLoadingStats: false,
        statsError: null,
        crises: [],
        sessions: [],
        showArchived: false,
        unmaskedMap: {},
        auditLogs: [],
        selectedSession: null,
        sessionFilterTag: null,
        crisisFilterStatus: 'all',
        dismissedAlertSessionIds: [],
        lastStatsRefreshTime: null,
      });
    },

    fetchStats: async () => {
      set({ isLoadingStats: true, statsError: null });
      try {
        const stats = await AdminApiClient.fetchStats();
        set({ stats, isLoadingStats: false, lastStatsRefreshTime: Date.now() });
      } catch (err: any) {
        set({
          isLoadingStats: false,
          statsError: err?.message || '获取大盘统计失败',
        });
      }
    },

    fetchCrises: async () => {
      const combinedCrises = await AdminApiClient.fetchCrises();
      const currentCount = get().crises.length;
      set({ crises: combinedCrises });
      if (combinedCrises.length > currentCount && get().buzzerEnabled) {
        get().playBuzzer();
      }
    },

    fetchSessions: async (crisisOnly = false, includeDeleted?: boolean) => {
      set({ isLoading: true });
      const incDel = includeDeleted ?? get().showArchived;
      const combined = await AdminApiClient.fetchSessions(crisisOnly, incDel);
      set({ sessions: combined, isLoading: false });
    },

    fetchAuditLogs: async () => {
      const logs = await AdminApiClient.fetchAuditLogs();
      set({ auditLogs: logs });
    },

    unmaskCrisis: async (sessionId: string, passcode: string, operatorName?: string) => {
      try {
        const op = operatorName || get().teacherProfile?.displayName || '心理专职教师';
        const data = await AdminApiClient.unmaskCrisis(sessionId, passcode, op);
        if (data.success && data.realIdentity) {
          set((state) => ({
            unmaskedMap: {
              ...state.unmaskedMap,
              [sessionId]: data.realIdentity!,
            },
          }));
          await get().fetchAuditLogs();
          return { success: true, identity: data.realIdentity };
        }
        return { success: false, error: data.error || '二次安全口令校验未通过' };
      } catch (err: any) {
        return { success: false, error: err?.message || '网络异常' };
      }
    },

    updateDisposition: async (sessionId: string, status: DispositionStatus, note?: string) => {
      const currentCrisis = get().crises.find((c) => c.sessionId === sessionId);
      const currentSession = get().sessions.find((s) => s.sessionId === sessionId);
      const finalNote =
        note ?? (currentCrisis?.dispositionNote || currentSession?.dispositionNote || '');

      set((state) => ({
        crises: state.crises.map((c) =>
          c.sessionId === sessionId
            ? { ...c, dispositionStatus: status, dispositionNote: finalNote }
            : c,
        ),
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId
            ? { ...s, dispositionStatus: status, dispositionNote: finalNote }
            : s,
        ),
        selectedSession:
          state.selectedSession?.sessionId === sessionId
            ? { ...state.selectedSession, dispositionStatus: status, dispositionNote: finalNote }
            : state.selectedSession,
      }));

      return AdminApiClient.updateDisposition(sessionId, status, finalNote);
    },

    refreshAdminData: async () => {
      await get().fetchSessions(false, get().showArchived);
      await get().fetchCrises();
      await get().fetchStats();
      await get().fetchAuditLogs();
    },

    deleteSession: async (
      sessionId: string,
      passcode: string,
      reason: string,
      operatorName?: string,
    ) => {
      const op = operatorName || get().teacherProfile?.displayName || '心理专职教师';
      return executeDeleteSession(sessionId, passcode, reason, op, () => get().refreshAdminData());
    },

    restoreSession: async (sessionId: string, passcode: string, operatorName?: string) => {
      const op = operatorName || get().teacherProfile?.displayName || '心理专职教师';
      return executeRestoreSession(sessionId, passcode, op, () => get().refreshAdminData());
    },

    reEvaluateSession: async (sessionId: string, transcript?: string) => {
      return executeReEvaluateSession(sessionId, transcript, (updater) => {
        set((state) => ({
          sessions: state.sessions.map((s) => (s.sessionId === sessionId ? updater(s) : s)),
        }));
      });
    },

    setShowArchived: (show: boolean) => {
      set({ showArchived: show });
      get().fetchSessions(false, show);
    },

    setBuzzerEnabled: (enabled: boolean) => {
      set({ buzzerEnabled: enabled });
    },

    playBuzzer: () => {
      playAdminBuzzer();
    },

    setActiveTab: (tab) => set({ activeTab: tab }),
    setSelectedSession: (session) => set({ selectedSession: session }),
    setSessionFilterTag: (tag) => set({ sessionFilterTag: tag }),
    setCrisisFilterStatus: (status) => set({ crisisFilterStatus: status }),
    dismissCrisisAlert: (sessionId) =>
      set((state) => ({
        dismissedAlertSessionIds: [...state.dismissedAlertSessionIds, sessionId],
      })),
    dismissAllCrisisAlerts: (sessionIds) =>
      set((state) => ({
        dismissedAlertSessionIds: Array.from(
          new Set([...state.dismissedAlertSessionIds, ...sessionIds]),
        ),
      })),
    navigateToSessionsWithTag: (tag) =>
      set({ activeTab: 'sessions', sessionFilterTag: tag || null }),
    navigateToCrisesWithStatus: (status) =>
      set({ activeTab: 'crises', crisisFilterStatus: status || 'all' }),
  };
});
