import type { Env, SessionRecord } from '../types';
import {
  saveToMemory,
  findActiveFromMemory,
  findArchivedFromMemory,
  findBySessionIdFromMemory,
  softDeleteFromMemory,
  restoreFromMemory,
  updateDispositionInMemory,
  updateReportInMemory,
  purgeMockDataFromMemory,
} from './session/memory-session-store';
import {
  ensureSchemaOnce,
  saveToD1,
  findActiveFromD1,
  findArchivedFromD1,
  findBySessionIdFromD1,
  softDeleteFromD1,
  restoreFromD1,
  updateDispositionInD1,
  updateReportInD1,
  purgeMockDataFromD1,
} from './session/d1-session-store';

export { ensureSchemaOnce };

export class SessionRepository {
  public static async save(env: Env, record: SessionRecord): Promise<void> {
    saveToMemory(record);
    if (env.DB) {
      await saveToD1(env.DB, record);
    }
  }

  public static async findActive(env: Env, limit: number = 500): Promise<SessionRecord[]> {
    if (env.DB) {
      const d1Results = await findActiveFromD1(env.DB, limit);
      if (d1Results !== null) {
        return d1Results;
      }
    }
    return findActiveFromMemory(limit);
  }

  public static async findArchived(env: Env, limit: number = 500): Promise<SessionRecord[]> {
    if (env.DB) {
      const d1Results = await findArchivedFromD1(env.DB, limit);
      if (d1Results !== null) {
        return d1Results;
      }
    }
    return findArchivedFromMemory(limit);
  }

  public static async findBySessionId(env: Env, sessionId: string): Promise<SessionRecord | null> {
    if (env.DB) {
      const d1Record = await findBySessionIdFromD1(env.DB, sessionId);
      if (d1Record) return d1Record;
    }
    return findBySessionIdFromMemory(sessionId);
  }

  public static async softDelete(
    env: Env,
    sessionId: string,
    reason: string,
    operator: string,
  ): Promise<boolean> {
    const deletedAt = Math.floor(Date.now() / 1000);
    const memSuccess = softDeleteFromMemory(sessionId, deletedAt, reason, operator);

    if (env.DB) {
      const d1Success = await softDeleteFromD1(env.DB, sessionId, deletedAt, reason, operator);
      return d1Success || memSuccess;
    }
    return memSuccess;
  }

  public static async restore(env: Env, sessionId: string): Promise<boolean> {
    const memSuccess = restoreFromMemory(sessionId);

    if (env.DB) {
      const d1Success = await restoreFromD1(env.DB, sessionId);
      return d1Success || memSuccess;
    }
    return memSuccess;
  }

  public static async updateDisposition(
    env: Env,
    sessionId: string,
    status: string,
    note?: string,
  ): Promise<boolean> {
    const memSuccess = updateDispositionInMemory(sessionId, status, note);

    if (env.DB) {
      const d1Success = await updateDispositionInD1(env.DB, sessionId, status, note);
      return d1Success || memSuccess;
    }
    return memSuccess;
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
    const memSuccess = updateReportInMemory(sessionId, data);

    if (env.DB) {
      const d1Success = await updateReportInD1(env.DB, sessionId, data);
      return d1Success || memSuccess;
    }
    return memSuccess;
  }

  public static async purgeMockData(env: Env): Promise<number> {
    let deletedCount = purgeMockDataFromMemory();
    if (env.DB) {
      deletedCount += await purgeMockDataFromD1(env.DB);
    }
    return deletedCount;
  }
}
