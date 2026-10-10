import type { Env } from '../../types';
import { SessionRepository } from '../../repositories/session-repository';
import { sendCrisisWebhook } from '../../lib/webhook-sender';
import {
  generateStructuredReportWithFlash,
  DEEPSEEK_V4_FLASH_MODEL,
} from '../../lib/deepseek-flash';
import {
  resolveEffectiveStage,
  encryptRealIdentityIfCrisis,
  buildDeidentifiedReport,
  buildSessionRecord,
  consolidateDialogueMemory,
} from './reporter/report-builder';

export interface ConsolidateAndSaveOptions {
  sessionId: string;
  duration?: number;
  stage?: string;
  studentName?: string;
  userId?: string;
  transcriptText: string;
  dialogueTurns?: Array<{ role: 'user' | 'assistant'; content: string }>;
  isCrisisExplicit?: boolean;
  encryptedPayload?: string;
}

interface PersistTaskRecord {
  timestamp: number;
  promise: Promise<{
    ok: boolean;
    session_id: string;
    is_crisis: boolean;
    crisis_level: number;
    report: any;
  }>;
}

const DEDUP_WINDOW_MS = 60_000;

/**
 * 个案评估与建档服务 (SessionReporter)
 * 职责：异步生成 DeepSeek V4 Flash 结构化简报、加密学生隐私身份、记忆归纳与数据库存档
 */
export class SessionReporter {
  private static readonly deduplicationMap = new Map<string, PersistTaskRecord>();

  public static clearDeduplicationCache(): void {
    SessionReporter.deduplicationMap.clear();
  }

  public static async generateAndPersist(
    env: Env,
    options: ConsolidateAndSaveOptions,
    ctx?: ExecutionContext,
  ): Promise<{
    ok: boolean;
    session_id: string;
    is_crisis: boolean;
    crisis_level: number;
    report: any;
  }> {
    const { sessionId } = options;
    const now = Date.now();
    const MAX_DEDUP_MAP_SIZE = 500;

    for (const [id, item] of SessionReporter.deduplicationMap.entries()) {
      if (now - item.timestamp > DEDUP_WINDOW_MS) {
        SessionReporter.deduplicationMap.delete(id);
      }
    }

    if (SessionReporter.deduplicationMap.size >= MAX_DEDUP_MAP_SIZE) {
      const oldestKey = SessionReporter.deduplicationMap.keys().next().value;
      if (oldestKey) SessionReporter.deduplicationMap.delete(oldestKey);
    }

    if (sessionId) {
      const existing = SessionReporter.deduplicationMap.get(sessionId);
      if (existing && now - existing.timestamp < DEDUP_WINDOW_MS) {
        return existing.promise;
      }
    }

    const taskPromise = (async () => {
      try {
        return await SessionReporter.executeGenerateAndPersist(env, options, ctx);
      } catch (err) {
        if (sessionId) {
          SessionReporter.deduplicationMap.delete(sessionId);
        }
        throw err;
      }
    })();

    if (sessionId) {
      SessionReporter.deduplicationMap.set(sessionId, {
        timestamp: now,
        promise: taskPromise,
      });
    }

    return taskPromise;
  }

  private static async executeGenerateAndPersist(
    env: Env,
    options: ConsolidateAndSaveOptions,
    ctx?: ExecutionContext,
  ) {
    const {
      sessionId,
      duration = 0,
      stage = 'Active_Listening',
      studentName = '',
      userId = '',
      transcriptText,
      dialogueTurns = [],
      isCrisisExplicit = false,
      encryptedPayload = '',
    } = options;

    const isProduction = env.ENVIRONMENT === 'production';
    if (isProduction && !env.TEACHER_SECONDARY_PASSCODE) {
      console.warn(
        '[SessionReporter] 生产环境未注入 TEACHER_SECONDARY_PASSCODE，严禁使用弱口令兜底',
      );
    }
    const secret = env.TEACHER_SECONDARY_PASSCODE || (!isProduction ? 'teacher-safe-2026' : '');

    // 0. 持久层防重检索：若该会话已由其它隔离区或在途任务持久化，直接复用已保存结果，彻底杜绝重复大模型开销与二次告警
    if (sessionId) {
      const existingRecord = await SessionRepository.findBySessionId(env, sessionId);
      if (existingRecord) {
        let parsedReport: any = null;
        try {
          parsedReport = JSON.parse(existingRecord.deidentified_report || '{}');
        } catch {}

        if (duration > 0 && (!existingRecord.duration || existingRecord.duration === 0)) {
          existingRecord.duration = duration;
          if (parsedReport) parsedReport.durationSeconds = duration;
          await SessionRepository.save(env, existingRecord);
        }

        return {
          ok: true,
          session_id: sessionId,
          is_crisis: Boolean(existingRecord.is_crisis),
          crisis_level: existingRecord.crisis_level,
          report: parsedReport,
        };
      }
    }

    const reportingKey =
      env.MINIMAX_API_KEY ||
      env.OPENROUTER_API_KEY ||
      env.REALTIME_UPSTREAM_KEY ||
      env.MINIMAX_REALTIME_KEY ||
      env.APIYI_API_KEY;

    const isMiniMax = Boolean(
      reportingKey && (reportingKey === env.MINIMAX_API_KEY || reportingKey.startsWith('sk-api--')),
    );

    // 1. 深度评估简报生成
    const report = await generateStructuredReportWithFlash(transcriptText, {
      apiKey: reportingKey,
      baseUrl:
        env.MINIMAX_BASE_URL ||
        (isMiniMax
          ? 'https://api.minimaxi.chat/v1/text/chatcompletion_v2'
          : env.OPENROUTER_BASE_URL),
      model: isMiniMax ? 'MiniMax-M3' : env.OPENROUTER_MODEL || DEEPSEEK_V4_FLASH_MODEL,
    });

    const isCrisis =
      isCrisisExplicit ||
      report.isCrisis ||
      report.crisisLevel >= 3 ||
      stage === 'Crisis_Escalation';
    const crisisLevel = isCrisis ? Math.max(3, report.crisisLevel) : report.crisisLevel;
    const effectiveStage = resolveEffectiveStage(isCrisis, stage);

    // 2. 真实身份机密加密
    const effectiveName = studentName || (userId && !userId.startsWith('sess_') ? userId : '');
    const encryptedIdentity = await encryptRealIdentityIfCrisis({
      isCrisis,
      effectiveName,
      crisisSummary: report.crisisSummary,
      existingPayload: encryptedPayload,
      secret,
    });

    // 3. 构建去标识化公开报告
    const deidentifiedReportObj = buildDeidentifiedReport({
      sessionId,
      duration,
      effectiveName,
      effectiveStage,
      report,
      isCrisis,
    });

    // 4. 持久化至 D1 数据库
    const record = buildSessionRecord({
      sessionId,
      duration,
      effectiveStage,
      isCrisis,
      crisisLevel,
      crisisSummary: report.crisisSummary,
      coreConcerns: report.coreConcerns,
      emotionalValence: report.emotionalValence,
      encryptedIdentity,
      deidentifiedReportObj,
    });

    await SessionRepository.save(env, record);

    // 5. 触发 Webhook 警报
    if (isCrisis && env.CRISIS_WEBHOOK_URL) {
      const webhookTask = sendCrisisWebhook(env.CRISIS_WEBHOOK_URL, {
        sessionId,
        crisisSummary: report.crisisSummary,
        crisisLevel,
        occurredAt: new Date().toLocaleString('zh-CN'),
        boothLocation: '校园心理驿站#01',
        coreConcerns: report.coreConcerns,
      }).catch((err) => console.warn('[SessionReporter] 二次 Webhook 告警发送失败:', err));

      if (ctx?.waitUntil) {
        ctx.waitUntil(webhookTask);
      }
    }

    // 6. 整合情景记忆
    await consolidateDialogueMemory(env, {
      userId: userId || effectiveName || sessionId,
      openRouterKey: reportingKey,
      dialogueTurns,
      transcriptText,
    });

    return {
      ok: true,
      session_id: sessionId,
      is_crisis: isCrisis,
      crisis_level: crisisLevel,
      report: deidentifiedReportObj,
    };
  }
}
