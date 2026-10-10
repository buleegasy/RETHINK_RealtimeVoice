import type { AdminSessionItem, AdminStats } from '../../types';
import { apiFetch } from '../api';

export function aggregateValence(sessions: AdminSessionItem[]): number {
  const valences = sessions
    .map((s) => s.emotionalValence)
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (valences.length === 0) return 0;
  const sum = valences.reduce((acc, curr) => acc + curr, 0);
  return Number((sum / valences.length).toFixed(2));
}

export function aggregateConcerns(
  sessions: AdminSessionItem[],
): Array<{ name: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    for (const c of s.coreConcerns || []) {
      if (typeof c === 'string' && c.trim()) {
        counts[c] = (counts[c] || 0) + 1;
      }
    }
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateRiskDistribution(
  sessions: AdminSessionItem[],
  crisisCount: number,
): Array<{ level: number; label: string; count: number }> {
  return [
    {
      level: 0,
      label: '正常稳定',
      count: sessions.filter((s) => (s.crisisLevel || 0) === 0 && !s.isCrisis).length,
    },
    {
      level: 1,
      label: '轻度波动',
      count: sessions.filter((s) => s.crisisLevel === 1 && !s.isCrisis).length,
    },
    {
      level: 2,
      label: '中度压力',
      count: sessions.filter((s) => s.crisisLevel === 2 && !s.isCrisis).length,
    },
    { level: 3, label: '极高危预警', count: crisisCount },
  ];
}

export function isSameCalendarDay(d1: Date, d2: Date): boolean {
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

export function aggregateWeeklyTrend(
  sessions: AdminSessionItem[],
): Array<{ date: string; sessions: number; crisis: number; avgValence: number }> {
  const days: Array<{ date: string; sessions: number; crisis: number; avgValence: number }> = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() - i);
    const dateStr = `${(targetDate.getMonth() + 1).toString().padStart(2, '0')}/${targetDate.getDate().toString().padStart(2, '0')}`;

    const daysSessions = sessions.filter((s) => {
      const rawTime = s.createdAt ?? (s as any).startedAt;
      if (!rawTime) return false;
      const timeMs =
        typeof rawTime === 'number'
          ? rawTime < 1e11
            ? rawTime * 1000
            : rawTime
          : new Date(rawTime).getTime();
      return isSameCalendarDay(new Date(timeMs), targetDate);
    });

    const dayCrisis = daysSessions.filter((s) => s.isCrisis || (s.crisisLevel ?? 0) >= 3).length;
    days.push({
      date: dateStr,
      sessions: daysSessions.length,
      crisis: dayCrisis,
      avgValence: aggregateValence(daysSessions),
    });
  }
  return days;
}

export function generateObjectiveSummary(
  concernDistribution: Array<{ name: string; count: number }>,
  crisisCount: number,
): string {
  const topConcerns = concernDistribution.slice(0, 3).map((c) => c.name);
  let summary = `本周倾诉焦点集中于【${topConcerns.join('、')}】等真实议题。`;
  if (crisisCount > 0) {
    summary += ` 累计阻断并守护 ${crisisCount} 起严重情绪危机个案，请重点跟进危机协同专区。`;
  } else {
    summary += ` 本周未出现极高危预警，学生情绪总体处于健康可调适区间。`;
  }
  return summary;
}

export function buildZeroStats(): AdminStats {
  return {
    totalSessions: 0,
    crisisCount: 0,
    pendingInterventions: 0,
    avgValence: 0,
    concernDistribution: [],
    riskDistribution: [],
    weeklyTrend: [],
    weeklySummary: '当前暂无倾诉数据，各终端已就绪待命',
  };
}

export function filterValidSessions(sessions: AdminSessionItem[]): AdminSessionItem[] {
  return (sessions || []).filter(
    (s) =>
      s &&
      !s.isDeleted &&
      !s.sessionId?.startsWith('sess_sample_') &&
      !s.sessionId?.startsWith('mock_'),
  );
}

export function computeStatsFromLocalSessions(sessions: AdminSessionItem[]): AdminStats {
  const valid = filterValidSessions(sessions);
  if (valid.length === 0) return buildZeroStats();

  const crisisLocals = valid.filter((s) => s.isCrisis || (s.crisisLevel ?? 0) >= 3);
  const crisisCount = crisisLocals.length;
  const pendingInterventions = crisisLocals.filter(
    (s) => s.dispositionStatus === 'pending_contact',
  ).length;
  const concernDistribution = aggregateConcerns(valid);

  return {
    totalSessions: valid.length,
    crisisCount,
    pendingInterventions,
    avgValence: aggregateValence(valid),
    concernDistribution,
    riskDistribution: aggregateRiskDistribution(valid, crisisCount),
    weeklyTrend: aggregateWeeklyTrend(valid),
    weeklySummary: generateObjectiveSummary(concernDistribution, crisisCount),
  };
}

export function getLocalRealSessions(): AdminSessionItem[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem('rethink_real_sessions');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return filterValidSessions(parsed);
  } catch {
    return [];
  }
}

export async function tryFetchCloudStats(): Promise<AdminStats | null> {
  try {
    const res = await apiFetch('/api/admin/stats');
    if (res?.ok) {
      const data = await res.json();
      if (data?.success && data?.stats) {
        return data.stats;
      }
    }
  } catch (err) {
    console.warn('[AdminApiClient] 获取云端宏观统计数据异常:', err);
  }
  return null;
}

export async function mergeCloudWithLocal(
  cloudStats: AdminStats,
  localSessions: AdminSessionItem[],
): Promise<AdminStats> {
  if (localSessions.length === 0) return cloudStats;
  try {
    const sessionsRes = await apiFetch('/api/admin/sessions');
    if (sessionsRes?.ok) {
      const sData = await sessionsRes.json();
      if (sData?.success && Array.isArray(sData.sessions) && sData.sessions.length > 0) {
        const serverIds = new Set(sData.sessions.map((s: AdminSessionItem) => s.sessionId));
        const unsynced = localSessions.filter((s) => !serverIds.has(s.sessionId));
        if (unsynced.length > 0) {
          const combined = [...sData.sessions, ...unsynced];
          const merged = computeStatsFromLocalSessions(combined);
          if (
            cloudStats.weeklySummary &&
            cloudStats.weeklySummary !== '当前暂无倾诉数据，各终端已就绪待命' &&
            !cloudStats.weeklySummary.includes('暂无足够的学生来访数据')
          ) {
            merged.weeklySummary = cloudStats.weeklySummary;
          }
          return merged;
        }
      }
    }
  } catch (err) {
    console.warn('[AdminApiClient] 合并本地个案至云端大盘异常:', err);
  }
  return cloudStats;
}
