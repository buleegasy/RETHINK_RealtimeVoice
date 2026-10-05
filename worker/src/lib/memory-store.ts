import type { Env, SituationalMemory } from '../types';

const memoryCache = new Map<string, SituationalMemory>();
const MAX_MEMORY_CACHE_SIZE = 500;

function setMemoryCache(key: string, value: SituationalMemory): void {
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE && !memoryCache.has(key)) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey !== undefined) {
      memoryCache.delete(oldestKey);
    }
  }
  memoryCache.set(key, value);
}

export function clearMemoryCache(): void {
  memoryCache.clear();
}

function safeParseJson<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function ensureMemoryTable(_env: Env): Promise<void> {
  // 数据库表结构统一由 migrations/0001_init_schema.sql 维护，彻底避免冷启动 DDL 锁冲突
}

function parseMemoryRow(row: any): SituationalMemory | null {
  if (row.memory_json) {
    try {
      return JSON.parse(row.memory_json);
    } catch (_err) {
      // 降级使用字段分别解析
    }
  }
  if (!row.user_id) return null;
  return {
    userId: row.user_id,
    userName: row.user_name || undefined,
    identityContext: row.identity_context || undefined,
    coreConcerns: safeParseJson<string[]>(row.core_concerns, []),
    significantOthers: safeParseJson<string[]>(row.significant_others, []),
    recentSituations: safeParseJson<string[]>(row.recent_situations, []),
    effectiveStrategies: safeParseJson<string[]>(row.effective_strategies, []),
    summaryParagraph: row.summary_paragraph || '',
    lastUpdated: row.last_updated || row.updated_at || Date.now(),
  };
}

export async function getSituationalMemory(
  env: Env,
  userId: string,
): Promise<SituationalMemory | null> {
  const cleanId = (userId || '').trim();
  if (
    !cleanId ||
    cleanId.startsWith('sess_') ||
    cleanId === '来访者' ||
    cleanId === 'student_user'
  ) {
    return null;
  }

  if (memoryCache.has(cleanId)) {
    return memoryCache.get(cleanId) || null;
  }

  if (env?.DB) {
    try {
      await ensureMemoryTable(env);
      const row = await env.DB.prepare('SELECT * FROM user_situational_memories WHERE user_id = ?')
        .bind(cleanId)
        .first<any>();

      if (row) {
        const parsed = parseMemoryRow(row);
        if (parsed) {
          setMemoryCache(cleanId, parsed);
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[MemoryStore] D1 情景记忆读取异常:', err);
    }
  }

  return null;
}

export async function saveSituationalMemory(env: Env, memory: SituationalMemory): Promise<void> {
  if (!memory || !memory.userId) return;

  const cleanId = memory.userId.trim();
  if (
    !cleanId ||
    cleanId.startsWith('sess_') ||
    cleanId === '来访者' ||
    cleanId === 'student_user'
  ) {
    return;
  }

  // 严格仅以唯一 user_id 为缓存键，杜绝任何同名昵称全局缓存污染
  setMemoryCache(cleanId, memory);

  if (env?.DB) {
    try {
      await ensureMemoryTable(env);
      const memoryJson = JSON.stringify(memory);
      const now = memory.lastUpdated || Date.now();
      await env.DB.prepare(
        `
        INSERT INTO user_situational_memories (
          user_id, user_name, identity_context, core_concerns,
          significant_others, recent_situations, effective_strategies,
          summary_paragraph, memory_json, last_updated, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          user_name = excluded.user_name,
          identity_context = excluded.identity_context,
          core_concerns = excluded.core_concerns,
          significant_others = excluded.significant_others,
          recent_situations = excluded.recent_situations,
          effective_strategies = excluded.effective_strategies,
          summary_paragraph = excluded.summary_paragraph,
          memory_json = excluded.memory_json,
          last_updated = excluded.last_updated,
          updated_at = excluded.updated_at
      `,
      )
        .bind(
          cleanId,
          memory.userName || cleanId,
          memory.identityContext || '',
          JSON.stringify(memory.coreConcerns || []),
          JSON.stringify(memory.significantOthers || []),
          JSON.stringify(memory.recentSituations || []),
          JSON.stringify(memory.effectiveStrategies || []),
          memory.summaryParagraph || '',
          memoryJson,
          now,
          now,
        )
        .run();
    } catch (err) {
      console.warn('[MemoryStore] D1 情景记忆持久化异常:', err);
    }
  }
}
