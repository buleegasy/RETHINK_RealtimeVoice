import type { SessionRecord } from '../../types';

const memorySessions: SessionRecord[] = [];
const MAX_MEMORY_SESSIONS = 200;

export function saveToMemory(record: SessionRecord): void {
  const idx = memorySessions.findIndex((s) => s.session_id === record.session_id);
  if (idx >= 0) {
    const existing = memorySessions[idx];
    memorySessions[idx] = {
      ...record,
      created_at: existing.created_at,
      encrypted_real_identity: record.encrypted_real_identity || existing.encrypted_real_identity,
    };
  } else {
    memorySessions.unshift(record);
    if (memorySessions.length > MAX_MEMORY_SESSIONS) {
      memorySessions.pop();
    }
  }
}

export function findActiveFromMemory(limit: number): SessionRecord[] {
  return memorySessions
    .filter(
      (s) =>
        !s.is_deleted &&
        !s.session_id.startsWith('sess_sample_') &&
        !s.session_id.startsWith('mock_'),
    )
    .slice(0, limit);
}

export function findArchivedFromMemory(limit: number): SessionRecord[] {
  return memorySessions
    .filter(
      (s) =>
        s.is_deleted === 1 &&
        !s.session_id.startsWith('sess_sample_') &&
        !s.session_id.startsWith('mock_'),
    )
    .slice(0, limit);
}

export function findBySessionIdFromMemory(sessionId: string): SessionRecord | null {
  return memorySessions.find((s) => s.session_id === sessionId) || null;
}

export function softDeleteFromMemory(
  sessionId: string,
  deletedAt: number,
  reason: string,
  operator: string,
): boolean {
  const mem = memorySessions.find((s) => s.session_id === sessionId);
  if (mem) {
    mem.is_deleted = 1;
    mem.deleted_at = deletedAt;
    mem.delete_reason = reason;
    mem.deleted_by = operator;
    return true;
  }
  return false;
}

export function restoreFromMemory(sessionId: string): boolean {
  const mem = memorySessions.find((s) => s.session_id === sessionId);
  if (mem) {
    mem.is_deleted = 0;
    mem.deleted_at = undefined;
    mem.delete_reason = undefined;
    mem.deleted_by = undefined;
    return true;
  }
  return false;
}

export function updateDispositionInMemory(
  sessionId: string,
  status: string,
  note?: string,
): boolean {
  const mem = memorySessions.find((s) => s.session_id === sessionId);
  if (mem) {
    mem.disposition_status = status as any;
    if (note !== undefined) mem.disposition_note = note;
    return true;
  }
  return false;
}

export function updateReportInMemory(
  sessionId: string,
  data: {
    deidentifiedReport: string;
    stage: string;
    isCrisis: number;
    crisisLevel: number;
    crisisSummary: string;
    coreConcerns: string;
    emotionalValence: number;
  },
): boolean {
  const mem = memorySessions.find((s) => s.session_id === sessionId);
  if (mem) {
    mem.deidentified_report = data.deidentifiedReport;
    mem.stage = data.stage;
    mem.is_crisis = data.isCrisis;
    mem.crisis_level = data.crisisLevel as any;
    mem.crisis_summary = data.crisisSummary;
    mem.core_concerns = data.coreConcerns;
    mem.emotional_valence = data.emotionalValence;
    return true;
  }
  return false;
}

export function purgeMockDataFromMemory(): number {
  let deletedCount = 0;
  for (let i = memorySessions.length - 1; i >= 0; i--) {
    const s = memorySessions[i];
    if (
      s.session_id.startsWith('sess_sample_') ||
      s.session_id.startsWith('mock_') ||
      s.id.startsWith('sess_sample_') ||
      s.id.startsWith('mock_')
    ) {
      memorySessions.splice(i, 1);
      deletedCount++;
    }
  }
  return deletedCount;
}
