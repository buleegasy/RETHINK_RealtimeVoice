export interface Env {
  MINIMAX_API_KEY?: string;
  MINIMAX_BASE_URL?: string;
  APIYI_API_KEY?: string;
  APIYI_BASE_URL?: string;
  MINIMAX_REALTIME_KEY?: string;
  MINIMAX_REALTIME_BASE_URL?: string;
  [key: string]: any;
  EMBEDDING_API_KEY?: string;
  EMBEDDING_API_URL?: string;
  RERANK_API_KEY?: string;
  RERANK_API_URL?: string;
  DB?: D1Database;
  ENVIRONMENT?: string;
  TEACHER_SECONDARY_PASSCODE?: string;
  CRISIS_WEBHOOK_URL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_MODEL?: string;
}

export type CrisisLevel = 0 | 1 | 2 | 3;

export interface SituationRAGItem {
  situationId: string;
  topic: string;
  summary50: string;
  fullContext?: string;
  effectiveApproaches?: string;
  timestamp: number;
}

export interface SituationalMemory {
  userId: string;
  userName?: string;
  identityContext?: string;
  coreConcerns: string[];
  significantOthers?: string[];
  recentSituations?: string[];
  effectiveStrategies?: string[];
  summaryParagraph: string;
  situations?: SituationRAGItem[];
  lastUpdated: number;
}

export type DispositionStatus = 'pending_contact' | 'intervened' | 'closed';

export interface SessionRecord {
  id: string;
  session_id: string;
  duration: number;
  stage: string;
  is_crisis: number;
  crisis_level: CrisisLevel;
  crisis_summary?: string;
  core_concerns?: string;
  emotional_valence?: number;
  encrypted_real_identity?: string;
  deidentified_report?: string;
  disposition_status?: DispositionStatus;
  disposition_note?: string;
  is_deleted?: number;
  deleted_at?: number;
  delete_reason?: string;
  deleted_by?: string;
  created_at: number;
}

export interface CrisisAuditLog {
  id: string;
  session_id: string;
  operator_name: string;
  reason: string;
  created_at: number;
}

export interface PersistSessionPayload {
  session_id: string;
  duration: number;
  encrypted_payload: string;
  stage: string;
  username?: string;
  transcript_text?: string;
  crisis_level?: CrisisLevel;
  is_crisis?: boolean;
}

export interface KnowledgeQueryPayload {
  query: string;
  topK?: number;
}

export interface TeacherAuthPayload {
  username?: string;
  password?: string;
}

export interface CrisisUnmaskPayload {
  session_id: string;
  secondary_passcode: string;
  operator_name?: string;
}

export interface DispositionPayload {
  session_id: string;
  status: DispositionStatus;
  note?: string;
}

export interface WebhookTestPayload {
  webhook_url?: string;
  webhookUrl?: string;
  provider?: string;
  crisisLevel?: number;
}

export interface DeleteSessionPayload {
  session_id: string;
  secondary_passcode: string;
  reason: string;
  operator_name?: string;
}

export interface RestoreSessionPayload {
  session_id: string;
  secondary_passcode: string;
  operator_name?: string;
}
