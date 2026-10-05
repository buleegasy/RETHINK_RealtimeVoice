import type { Env, SessionRecord } from '../types';

const memorySessions: SessionRecord[] = [];
const MAX_MEMORY_SESSIONS = 200;

export async function ensureSchemaOnce(_db?: D1Database): Promise<void> {
  // 数据库 Schema 统一由 migrations/0001_init_schema.sql 维护
  // 彻底移除请求主链路中的动态 DDL 执行，消除 SQLite 写锁冲突与冷启动延迟
}

export class SessionRepository {
  public static async save(env: Env, record: SessionRecord): Promise<void> {
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

    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        await env.DB.prepare(
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
  }

  public static async findActive(env: Env, limit: number = 500): Promise<SessionRecord[]> {
    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        const { results } = await env.DB.prepare(
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
    }

    return memorySessions
      .filter(
        (s) =>
          !s.is_deleted &&
          !s.session_id.startsWith('sess_sample_') &&
          !s.session_id.startsWith('mock_'),
      )
      .slice(0, limit);
  }

  public static async findArchived(env: Env, limit: number = 500): Promise<SessionRecord[]> {
    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        const { results } = await env.DB.prepare(
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
    }

    return memorySessions
      .filter(
        (s) =>
          s.is_deleted === 1 &&
          !s.session_id.startsWith('sess_sample_') &&
          !s.session_id.startsWith('mock_'),
      )
      .slice(0, limit);
  }

  public static async findBySessionId(env: Env, sessionId: string): Promise<SessionRecord | null> {
    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        const record = await env.DB.prepare('SELECT * FROM school_sessions WHERE session_id = ?')
          .bind(sessionId)
          .first<SessionRecord>();
        if (record) return record;
      } catch (e) {
        console.warn('[SessionRepository findBySessionId error]:', e);
      }
    }

    return memorySessions.find((s) => s.session_id === sessionId) || null;
  }

  public static async softDelete(
    env: Env,
    sessionId: string,
    reason: string,
    operator: string,
  ): Promise<boolean> {
    const deletedAt = Math.floor(Date.now() / 1000);
    const mem = memorySessions.find((s) => s.session_id === sessionId);
    if (mem) {
      mem.is_deleted = 1;
      mem.deleted_at = deletedAt;
      mem.delete_reason = reason;
      mem.deleted_by = operator;
    }

    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        const res = await env.DB.prepare(
          'UPDATE school_sessions SET is_deleted = 1, deleted_at = ?, delete_reason = ?, deleted_by = ? WHERE session_id = ?',
        )
          .bind(deletedAt, reason, operator, sessionId)
          .run();
        return (res.meta?.changes ?? 0) > 0 || Boolean(mem);
      } catch (e) {
        console.warn('[SessionRepository softDelete error]:', e);
      }
    }

    return Boolean(mem);
  }

  public static async restore(env: Env, sessionId: string): Promise<boolean> {
    const mem = memorySessions.find((s) => s.session_id === sessionId);
    if (mem) {
      mem.is_deleted = 0;
      mem.deleted_at = undefined;
      mem.delete_reason = undefined;
      mem.deleted_by = undefined;
    }

    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        const res = await env.DB.prepare(
          'UPDATE school_sessions SET is_deleted = 0, deleted_at = NULL, delete_reason = NULL, deleted_by = NULL WHERE session_id = ?',
        )
          .bind(sessionId)
          .run();
        return (res.meta?.changes ?? 0) > 0 || Boolean(mem);
      } catch (e) {
        console.warn('[SessionRepository restore error]:', e);
      }
    }

    return Boolean(mem);
  }

  public static async updateDisposition(
    env: Env,
    sessionId: string,
    status: string,
    note?: string,
  ): Promise<boolean> {
    const mem = memorySessions.find((s) => s.session_id === sessionId);
    if (mem) {
      mem.disposition_status = status as any;
      if (note !== undefined) mem.disposition_note = note;
    }

    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        const res = await env.DB.prepare(
          'UPDATE school_sessions SET disposition_status = ?, disposition_note = ? WHERE session_id = ?',
        )
          .bind(status, note || '', sessionId)
          .run();
        return (res.meta?.changes ?? 0) > 0 || Boolean(mem);
      } catch (e) {
        console.warn('[SessionRepository updateDisposition error]:', e);
      }
    }

    return Boolean(mem);
  }

  public static async updateReport(
    env: Env,
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
    const mem = memorySessions.find((s) => s.session_id === sessionId);
    if (mem) {
      mem.deidentified_report = data.deidentifiedReport;
      mem.stage = data.stage;
      mem.is_crisis = data.isCrisis;
      mem.crisis_level = data.crisisLevel as any;
      mem.crisis_summary = data.crisisSummary;
      mem.core_concerns = data.coreConcerns;
      mem.emotional_valence = data.emotionalValence;
    }

    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        const res = await env.DB.prepare(
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
        return (res.meta?.changes ?? 0) > 0 || Boolean(mem);
      } catch (e) {
        console.warn('[SessionRepository updateReport error]:', e);
      }
    }

    return Boolean(mem);
  }

  public static async purgeMockData(env: Env): Promise<number> {
    let deletedCount = 0;

    // 1. 物理清空内存假数据
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

    // 2. 物理从 D1 表中执行 DELETE
    if (env.DB) {
      try {
        await ensureSchemaOnce(env.DB);
        const res = await env.DB.prepare(
          `
          DELETE FROM school_sessions 
          WHERE session_id LIKE 'sess_sample_%' 
             OR session_id LIKE 'mock_%' 
             OR id LIKE 'sess_sample_%' 
             OR id LIKE 'mock_%'
        `,
        ).run();
        deletedCount += res.meta?.changes ?? 0;
      } catch (e) {
        console.warn('[SessionRepository purgeMockData D1 error]:', e);
      }
    }

    return deletedCount;
  }
}
