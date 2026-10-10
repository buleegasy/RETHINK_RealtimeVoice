import type { SessionRecord } from '../../types';

export async function ensureSchemaOnce(_db?: D1Database): Promise<void> {
  // 数据库 Schema 统一由 migrations/0001_init_schema.sql 维护
  // 彻底移除请求主链路中的动态 DDL 执行，消除 SQLite 写锁冲突与冷启动延迟
}

export async function saveToD1(db: D1Database, record: SessionRecord): Promise<void> {
  try {
    await ensureSchemaOnce(db);
    await db
      .prepare(
        `
        INSERT INTO school_sessions (
          id, session_id, duration, stage, is_crisis, crisis_level,
          crisis_summary, core_concerns, emotional_valence,
          encrypted_real_identity, deidentified_report, disposition_status, disposition_note,
          is_deleted, deleted_at, delete_reason, deleted_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          duration = excluded.duration,
          stage = excluded.stage,
          is_crisis = excluded.is_crisis,
          crisis_level = excluded.crisis_level,
          crisis_summary = excluded.crisis_summary,
          core_concerns = excluded.core_concerns,
          emotional_valence = excluded.emotional_valence,
          encrypted_real_identity = CASE WHEN excluded.encrypted_real_identity != '' THEN excluded.encrypted_real_identity ELSE school_sessions.encrypted_real_identity END,
          deidentified_report = excluded.deidentified_report,
          disposition_status = excluded.disposition_status,
          disposition_note = excluded.disposition_note
      `,
      )
      .bind(
        record.id,
        record.session_id,
        record.duration,
        record.stage,
        record.is_crisis,
        record.crisis_level,
        record.crisis_summary || '',
        record.core_concerns || '[]',
        record.emotional_valence || 0,
        record.encrypted_real_identity || '',
        record.deidentified_report || '',
        record.disposition_status || 'pending_contact',
        record.disposition_note || '',
        record.is_deleted || 0,
        record.deleted_at || null,
        record.delete_reason || null,
        record.deleted_by || null,
        record.created_at,
      )
      .run();
  } catch (e) {
    console.warn('[SessionRepository save error]:', e);
  }
}

export async function findActiveFromD1(
  db: D1Database,
  limit: number,
): Promise<SessionRecord[] | null> {
  try {
    await ensureSchemaOnce(db);
    const { results } = await db
      .prepare(
        'SELECT * FROM school_sessions WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT ?',
      )
      .bind(limit)
      .all<SessionRecord>();
    if (results && results.length >= 0) {
      return results.filter(
        (s) => !s.session_id.startsWith('sess_sample_') && !s.session_id.startsWith('mock_'),
      );
    }
  } catch (e) {
    console.warn('[SessionRepository findActive error]:', e);
  }
  return null;
}

export async function findArchivedFromD1(
  db: D1Database,
  limit: number,
): Promise<SessionRecord[] | null> {
  try {
    await ensureSchemaOnce(db);
    const { results } = await db
      .prepare(
        'SELECT * FROM school_sessions WHERE is_deleted = 1 ORDER BY deleted_at DESC LIMIT ?',
      )
      .bind(limit)
      .all<SessionRecord>();
    if (results && results.length >= 0) {
      return results.filter(
        (s) => !s.session_id.startsWith('sess_sample_') && !s.session_id.startsWith('mock_'),
      );
    }
  } catch (e) {
    console.warn('[SessionRepository findArchived error]:', e);
  }
  return null;
}

export async function findBySessionIdFromD1(
  db: D1Database,
  sessionId: string,
): Promise<SessionRecord | null> {
  try {
    await ensureSchemaOnce(db);
    const record = await db
      .prepare('SELECT * FROM school_sessions WHERE session_id = ?')
      .bind(sessionId)
      .first<SessionRecord>();
    if (record) return record;
  } catch (e) {
    console.warn('[SessionRepository findBySessionId error]:', e);
  }
  return null;
}

export async function softDeleteFromD1(
  db: D1Database,
  sessionId: string,
  deletedAt: number,
  reason: string,
  operator: string,
): Promise<boolean> {
  try {
    await ensureSchemaOnce(db);
    const res = await db
      .prepare(
        'UPDATE school_sessions SET is_deleted = 1, deleted_at = ?, delete_reason = ?, deleted_by = ? WHERE session_id = ?',
      )
      .bind(deletedAt, reason, operator, sessionId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  } catch (e) {
    console.warn('[SessionRepository softDelete error]:', e);
    return false;
  }
}

export async function restoreFromD1(db: D1Database, sessionId: string): Promise<boolean> {
  try {
    await ensureSchemaOnce(db);
    const res = await db
      .prepare(
        'UPDATE school_sessions SET is_deleted = 0, deleted_at = NULL, delete_reason = NULL, deleted_by = NULL WHERE session_id = ?',
      )
      .bind(sessionId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  } catch (e) {
    console.warn('[SessionRepository restore error]:', e);
    return false;
  }
}

export async function updateDispositionInD1(
  db: D1Database,
  sessionId: string,
  status: string,
  note?: string,
): Promise<boolean> {
  try {
    await ensureSchemaOnce(db);
    const res = await db
      .prepare(
        'UPDATE school_sessions SET disposition_status = ?, disposition_note = ? WHERE session_id = ?',
      )
      .bind(status, note || '', sessionId)
      .run();
    return (res.meta?.changes ?? 0) > 0;
  } catch (e) {
    console.warn('[SessionRepository updateDisposition error]:', e);
    return false;
  }
}

export async function updateReportInD1(
  db: D1Database,
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
): Promise<boolean> {
  try {
    await ensureSchemaOnce(db);
    const res = await db
      .prepare(
        `
        UPDATE school_sessions
        SET deidentified_report = ?, stage = ?, is_crisis = ?, crisis_level = ?, crisis_summary = ?, core_concerns = ?, emotional_valence = ?
        WHERE session_id = ?
      `,
      )
      .bind(
        data.deidentifiedReport,
        data.stage,
        data.isCrisis,
        data.crisisLevel,
        data.crisisSummary,
        data.coreConcerns,
        data.emotionalValence,
        sessionId,
      )
      .run();
    return (res.meta?.changes ?? 0) > 0;
  } catch (e) {
    console.warn('[SessionRepository updateReport error]:', e);
    return false;
  }
}

export async function purgeMockDataFromD1(db: D1Database): Promise<number> {
  try {
    await ensureSchemaOnce(db);
    const res = await db
      .prepare(
        `
        DELETE FROM school_sessions 
        WHERE session_id LIKE 'sess_sample_%' 
           OR session_id LIKE 'mock_%' 
           OR id LIKE 'sess_sample_%' 
           OR id LIKE 'mock_%'
      `,
      )
      .run();
    return res.meta?.changes ?? 0;
  } catch (e) {
    console.warn('[SessionRepository purgeMockData D1 error]:', e);
    return 0;
  }
}
