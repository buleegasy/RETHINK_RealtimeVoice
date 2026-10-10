import type { Env } from '../../types';
import { SessionRepository } from '../../repositories/session-repository';
import {
  generateWeeklySummaryDeepSeekV4Flash,
  generateStructuredReportWithFlash,
} from '../../lib/deepseek-flash';

export class AdminReportingService {
  public static async getMacroStats(env: Env) {
    const allSessions = await SessionRepository.findActive(env);

    const totalSessions = allSessions.length;
    const crisisCount = allSessions.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3).length;
    const pendingInterventions = allSessions.filter(
      (s) =>
        (s.is_crisis === 1 || s.crisis_level >= 3) && s.disposition_status === 'pending_contact',
    ).length;

    const validValences = allSessions
      .map((s) => s.emotional_valence)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const avgValence =
      validValences.length > 0
        ? Number(
            (validValences.reduce((acc, curr) => acc + curr, 0) / validValences.length).toFixed(2),
          )
        : 0.0;

    const concernCounts: Record<string, number> = {};
    for (const s of allSessions) {
      try {
        const parsed = JSON.parse(s.core_concerns || '[]');
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim()) {
              concernCounts[item] = (concernCounts[item] || 0) + 1;
            }
          }
        }
      } catch (err) {
        console.debug('[AdminReportingService] 解析 core_concerns 异常:', err);
      }
    }

    const concernDistribution = Object.entries(concernCounts).map(([name, count]) => ({
      name,
      count,
    }));

    const riskDistribution = [
      {
        level: 0,
        label: '正常稳定',
        count: allSessions.filter((s) => (s.crisis_level || 0) === 0 && s.is_crisis !== 1).length,
      },
      {
        level: 1,
        label: '轻度波动',
        count: allSessions.filter((s) => s.crisis_level === 1 && s.is_crisis !== 1).length,
      },
      {
        level: 2,
        label: '中度压力',
        count: allSessions.filter((s) => s.crisis_level === 2 && s.is_crisis !== 1).length,
      },
      {
        level: 3,
        label: '极高危预警',
        count: allSessions.filter((s) => (s.crisis_level || 0) >= 3 || s.is_crisis === 1).length,
      },
    ];

    const now = new Date();
    const weeklyTrend = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - idx));
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      const daySessions = allSessions.filter((s) => {
        const ms = (s.created_at || 0) > 1e11 ? s.created_at : (s.created_at || 0) * 1000;
        const sDate = new Date(ms);
        return (
          sDate.getDate() === d.getDate() &&
          sDate.getMonth() === d.getMonth() &&
          sDate.getFullYear() === d.getFullYear()
        );
      });
      const dayValences = daySessions
        .map((s) => s.emotional_valence)
        .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
      const dayAvgValence =
        dayValences.length > 0
          ? Number(
              (dayValences.reduce((acc, curr) => acc + curr, 0) / dayValences.length).toFixed(2),
            )
          : 0.0;

      return {
        date: dateStr,
        sessions: daySessions.length,
        crisis: daySessions.filter((s) => (s.crisis_level || 0) >= 3 || s.is_crisis === 1).length,
        avgValence: dayAvgValence,
      };
    });

    let weeklySummary = '当前暂无足够的学生来访数据，各咨询终端正常就绪待命。';
    try {
      weeklySummary = await generateWeeklySummaryDeepSeekV4Flash(
        {
          totalSessions,
          crisisCount,
          avgValence,
          topConcerns: concernDistribution.slice(0, 3),
        },
        {
          apiKey: env.MINIMAX_API_KEY || env.OPENROUTER_API_KEY,
          baseUrl:
            env.MINIMAX_BASE_URL ||
            (env.MINIMAX_API_KEY
              ? 'https://api.minimaxi.chat/v1/text/chatcompletion_v2'
              : env.OPENROUTER_BASE_URL),
          model: env.MINIMAX_API_KEY ? 'MiniMax-M3' : env.OPENROUTER_MODEL,
          signal: AbortSignal.timeout(6000),
        },
      );
    } catch (err) {
      console.warn('[AdminReportingService] 宏观周报提炼超时或异常:', err);
    }

    return {
      totalSessions,
      crisisCount,
      pendingInterventions,
      avgValence,
      concernDistribution,
      riskDistribution,
      weeklyTrend,
      weeklySummary,
    };
  }

  public static async getSessions(
    env: Env,
    options?: { includeDeleted?: boolean; crisisOnly?: boolean },
  ) {
    const rawSessions = options?.includeDeleted
      ? await SessionRepository.findArchived(env).then(async (arch) => {
          const act = await SessionRepository.findActive(env);
          return [...act, ...arch].sort((a, b) => b.created_at - a.created_at);
        })
      : await SessionRepository.findActive(env);

    let filtered = rawSessions;
    if (options?.crisisOnly) {
      filtered = filtered.filter((s) => s.is_crisis === 1 || s.crisis_level >= 3);
    }

    return filtered.map((s) => {
      let reportObj: any = null;
      try {
        reportObj = JSON.parse(s.deidentified_report || '{}');
      } catch (err) {
        console.debug('[AdminReportingService] 解析 deidentified_report 异常:', err);
        reportObj = null;
      }

      let coreConcerns: string[] = [];
      try {
        coreConcerns = JSON.parse(s.core_concerns || '[]');
      } catch (err) {
        console.debug('[AdminReportingService] 解析 core_concerns 异常:', err);
        coreConcerns = [];
      }

      return {
        id: s.id,
        sessionId: s.session_id,
        duration: s.duration,
        stage: s.stage,
        isCrisis: s.is_crisis === 1,
        crisisLevel: s.crisis_level,
        crisisSummary: s.crisis_summary || '',
        coreConcerns,
        emotionalValence: s.emotional_valence ?? 0,
        deidentifiedReport: reportObj,
        dispositionStatus: s.disposition_status || 'pending_contact',
        dispositionNote: s.disposition_note || '',
        isDeleted: s.is_deleted === 1,
        deletedAt: s.deleted_at || null,
        deleteReason: s.delete_reason || null,
        deletedBy: s.deleted_by || null,
        createdAt: s.created_at,
        hasEncryptedIdentity: Boolean(s.encrypted_real_identity),
      };
    });
  }

  public static async reEvaluateSession(env: Env, sessionId: string, overrideTranscript?: string) {
    if (!sessionId) {
      return { success: false, error: '缺少会话标识', status: 400 };
    }

    const target = await SessionRepository.findBySessionId(env, sessionId);
    if (!target) {
      return { success: false, error: '未找到该个案记录', status: 404 };
    }

    let existingReport: any = {};
    try {
      existingReport = JSON.parse(target.deidentified_report || '{}');
    } catch (err) {
      console.debug('[AdminReportingService] 解析 existingReport 异常:', err);
    }

    const transcript =
      overrideTranscript ||
      existingReport.deidentifiedTranscript ||
      existingReport.transcript ||
      '';
    if (!transcript) {
      return { success: false, error: '个案对话记录为空，无法重算评估简报', status: 400 };
    }

    const newReport = await generateStructuredReportWithFlash(transcript, {
      apiKey: env.MINIMAX_API_KEY || env.OPENROUTER_API_KEY,
      baseUrl:
        env.MINIMAX_BASE_URL ||
        (env.MINIMAX_API_KEY
          ? 'https://api.minimaxi.chat/v1/text/chatcompletion_v2'
          : env.OPENROUTER_BASE_URL),
      model: env.MINIMAX_API_KEY ? 'MiniMax-M3' : env.OPENROUTER_MODEL,
    });

    const mergedReport = {
      ...existingReport,
      cbtStageReached: newReport.isCrisis ? 'Crisis_Escalation' : 'Socratic_Questioning',
      coreConcerns: newReport.coreConcerns,
      cognitiveDistortions: newReport.cognitiveDistortions,
      emotionalTrajectory: {
        initial:
          newReport.initialEmotion || existingReport.emotionalTrajectory?.initial || '情绪低落',
        final:
          newReport.finalEmotion ||
          existingReport.emotionalTrajectory?.final ||
          '事实与情绪逐步分离',
        deltaNotes: newReport.deltaNotes || newReport.crisisSummary,
      },
      keyTakeaways: newReport.keyTakeaways,
      homeworkAction: newReport.homeworkAction,
      actionItems: newReport.actionItems,
      deidentifiedTranscript:
        newReport.deidentifiedTranscript || existingReport.deidentifiedTranscript || transcript,
      evaluatedBy: 'DeepSeek V4 Flash',
      reEvaluatedAt: Date.now(),
    };

    const reportJson = JSON.stringify(mergedReport);
    await SessionRepository.updateReport(env, sessionId, {
      deidentifiedReport: reportJson,
      stage: mergedReport.cbtStageReached,
      isCrisis: newReport.isCrisis ? 1 : 0,
      crisisLevel: newReport.crisisLevel,
      crisisSummary: newReport.crisisSummary,
      coreConcerns: JSON.stringify(newReport.coreConcerns),
      emotionalValence: newReport.emotionalValence,
    });

    return {
      success: true,
      session_id: sessionId,
      report: mergedReport,
      updatedReport: mergedReport,
      status: 200,
    };
  }
}
