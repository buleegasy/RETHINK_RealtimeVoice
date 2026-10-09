export type CBTStage =
  | 'Pre_Info_Collection'
  | 'Active_Listening'
  | 'CBT_Stripping'
  | 'Socratic_Questioning'
  | 'Crisis_Escalation';

export type BoothHookState = 'on_hook' | 'off_hook' | 'dialing' | 'connected' | 'ended';

export type DuplexPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export type VoiceSessionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type AppRunMode = 'web' | 'kiosk' | 'admin' | 'test';

export type DispositionStatus = 'pending_contact' | 'intervened' | 'closed';

export interface AdminStats {
  totalSessions: number;
  crisisCount: number;
  pendingInterventions: number;
  avgValence: number;
  concernDistribution: Array<{ name: string; count: number }>;
  riskDistribution: Array<{ level: number; label: string; count: number }>;
  weeklyTrend: Array<{ date: string; sessions: number; crisis: number; avgValence: number }>;
  weeklySummary?: string;
}

export interface AdminCrisisItem {
  sessionId: string;
  duration: number;
  crisisLevel: number;
  crisisSummary: string;
  coreConcerns: string[];
  emotionalValence: number;
  dispositionStatus: DispositionStatus;
  dispositionNote: string;
  createdAt: number;
  hasEncryptedIdentity: boolean;
}

export interface AdminSessionItem {
  id: string;
  sessionId: string;
  duration: number;
  stage: string;
  isCrisis: boolean;
  crisisLevel: number;
  crisisSummary: string;
  coreConcerns: string[];
  emotionalValence: number;
  deidentifiedReport: SanitizedCbtReport | null;
  dispositionStatus: DispositionStatus;
  dispositionNote: string;
  isDeleted: boolean;
  deletedAt: number | null;
  deleteReason: string | null;
  deletedBy: string | null;
  createdAt: number;
  hasEncryptedIdentity: boolean;
}

export interface UnmaskedIdentity {
  username: string;
  realName: string;
  gradeClass: string;
  emergencyContact: string;
  boothLocation: string;
  crisisNote: string;
}

export interface CrisisAuditLog {
  id: string;
  session_id: string;
  operator_name: string;
  reason: string;
  created_at: number;
}

export interface KioskConfig {
  deviceId: string;
  locationName: string;
  autoResetSeconds: number;
  silenceTimeoutSeconds: number;
  eInkHighContrast: boolean;
  hardwareKeyboardEnabled: boolean;
}

export interface ConsultationHistoryRecord {
  id: string;
  date: number;
  duration: number;
  stage: CBTStage;
  report: SanitizedCbtReport;
}

export interface UserProfile {
  uid: string;
  userName?: string;
  displayName?: string;
  role?: 'user' | 'kiosk_device' | 'teacher' | 'admin';
  deviceId?: string;
  isAuthenticated: boolean;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: UserProfile;
  error?: string;
}

export interface DialogueTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  stage?: CBTStage;
}

export interface SanitizedCbtReport {
  sessionId: string;
  generatedAt: number;
  durationSeconds: number;
  userDisplayName: string;
  cbtStageReached: CBTStage;
  coreConcerns: string[];
  cognitiveDistortions: string[];
  emotionalTrajectory: {
    initial: string;
    final: string;
    deltaNotes: string;
  };
  keyTakeaways: string[];
  homeworkAction?: string;
  deidentifiedTranscript?: string;
  evaluatedBy?: string;
  isDeidentified: boolean;
}
