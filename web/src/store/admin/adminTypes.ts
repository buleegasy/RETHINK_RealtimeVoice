import type {
  AdminStats,
  AdminCrisisItem,
  AdminSessionItem,
  UnmaskedIdentity,
  CrisisAuditLog,
  DispositionStatus,
  UserProfile,
} from '../../types';

export interface AdminState {
  isAuthenticated: boolean;
  token: string | null;
  teacherProfile: UserProfile | null;
  activeTab: 'pulse' | 'crises' | 'sessions' | 'settings';
  stats: AdminStats | null;
  isLoadingStats: boolean;
  statsError: string | null;
  crises: AdminCrisisItem[];
  sessions: AdminSessionItem[];
  showArchived: boolean;
  unmaskedMap: Record<string, UnmaskedIdentity>;
  auditLogs: CrisisAuditLog[];
  buzzerEnabled: boolean;
  isLoading: boolean;
  error: string | null;
  selectedSession: AdminSessionItem | null;

  sessionFilterTag: string | null;
  crisisFilterStatus: DispositionStatus | 'all';
  dismissedAlertSessionIds: string[];
  lastStatsRefreshTime: number | null;

  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchStats: () => Promise<void>;
  fetchCrises: () => Promise<void>;
  fetchSessions: (crisisOnly?: boolean, includeDeleted?: boolean) => Promise<void>;
  fetchAuditLogs: () => Promise<void>;
  unmaskCrisis: (
    sessionId: string,
    passcode: string,
    operatorName?: string,
  ) => Promise<{ success: boolean; identity?: UnmaskedIdentity; error?: string }>;
  updateDisposition: (
    sessionId: string,
    status: DispositionStatus,
    note?: string,
  ) => Promise<boolean>;
  deleteSession: (
    sessionId: string,
    passcode: string,
    reason: string,
    operatorName?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  restoreSession: (
    sessionId: string,
    passcode: string,
    operatorName?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  reEvaluateSession: (
    sessionId: string,
    transcript?: string,
  ) => Promise<{ success: boolean; report?: any; session?: any; error?: string }>;
  refreshAdminData: () => Promise<void>;
  setShowArchived: (show: boolean) => void;
  setBuzzerEnabled: (enabled: boolean) => void;
  playBuzzer: () => void;
  setActiveTab: (tab: 'pulse' | 'crises' | 'sessions' | 'settings') => void;
  setSelectedSession: (session: AdminSessionItem | null) => void;
  setSessionFilterTag: (tag: string | null) => void;
  setCrisisFilterStatus: (status: DispositionStatus | 'all') => void;
  dismissCrisisAlert: (sessionId: string) => void;
  dismissAllCrisisAlerts: (sessionIds: string[]) => void;
  navigateToSessionsWithTag: (tag?: string | null) => void;
  navigateToCrisesWithStatus: (status?: DispositionStatus | 'all') => void;
}
