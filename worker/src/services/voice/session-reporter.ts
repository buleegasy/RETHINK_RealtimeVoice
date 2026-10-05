import type { Env, SessionRecord } from '../../types';
import { SessionRepository } from '../../repositories/session-repository';
import { sendCrisisWebhook } from '../../lib/webhook-sender';
import {
  generateStructuredReportWithFlash,
  consolidateSituationalMemoryWithLLM,
  DEEPSEEK_V4_FLASH_MODEL,
} from '../../lib/deepseek-flash';
import { getSituationalMemory, saveSituationalMemory } from '../../lib/memory-store';
import { encryptAesGcm } from '../../lib/crypto-helper';

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

function resolveEffectiveStage(isCrisis: boolean, stage: string): string {
  if (isCrisis) return 'Crisis_Escalation';
  if (stage === 'Active_Listening') return 'Socratic_Questioning';
  return stage;
}

async function encryptRealIdentityIfCrisis(params: {
  isCrisis: boolean;
  effectiveName: string;
  crisisSummary: string;
  existingPayload?: string;
  secret: string;
}): Promise<string> {
  const { isCrisis, effectiveName, crisisSummary, existingPayload = '', secret } = params;
  if (!isCrisis || !effectiveName) return existingPayload;

  try {
    const payload = JSON.stringify({
      username: effectiveName,
      realName: effectiveName,
      gradeClass: '学生来访者',
      emergencyContact: '校园学生工作处 / 班主任',
      boothLocation: '校园心理驿站#01',
      crisisNote: crisisSummary,
    });
    return await encryptAesGcm(payload, secret);
  } catch {
    return existingPayload;
  }
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

    for (const [id, item] of SessionReporter.deduplicationMap.entries()) {
      if (now - item.timestamp > DEDUP_WINDOW_MS) {
        SessionReporter.deduplicationMap.delete(id);
      }
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

    const openRouterKey =
      env.OPENROUTER_API_KEY ||
      env.REALTIME_UPSTREAM_KEY ||
      env.MINIMAX_REALTIME_KEY ||
      env.APIYI_API_KEY ||
      env.MINIMAX_API_KEY;

    // 1. 深度评估简报生成
    const report = await generateStructuredReportWithFlash(transcriptText, {
      apiKey: openRouterKey,
      baseUrl: env.OPENROUTER_BASE_URL,
      model: env.OPENROUTER_MODEL || DEEPSEEK_V4_FLASH_MODEL,
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
    const deidentifiedReportObj = {
      sessionId,
      generatedAt: Date.now(),
      durationSeconds: duration,
      userDisplayName: effectiveName ? `${effectiveName[0]}*同学` : '来访者',
      cbtStageReached: effectiveStage,
      coreConcerns: report.coreConcerns,
      cognitiveDistortions: report.cognitiveDistortions,
      emotionalTrajectory: {
        initial:
          report.initialEmotion || (report.crisisLevel >= 2 ? '高度负性情绪倾诉' : '情绪低落'),
        final:
          report.finalEmotion ||
          (isCrisis ? '危机紧急触发，已转专业干预' : '事实与情绪逐步分离，趋向平稳'),
        deltaNotes: report.deltaNotes || report.crisisSummary,
      },
      keyTakeaways:
        report.keyTakeaways && report.keyTakeaways.length > 0
          ? report.keyTakeaways
          : ['梳理事实与情绪边界，逐步重建掌控感。'],
      homeworkAction: report.homeworkAction || '',
      actionItems: report.actionItems,
      deidentifiedTranscript: report.deidentifiedTranscript,
      evaluatedBy: 'DeepSeek V4 Flash',
      isDeidentified: true,
    };

    // 4. 持久化至 D1 数据库
    const record: SessionRecord = {
      id: sessionId,
      session_id: sessionId,
      duration,
      stage: effectiveStage,
      is_crisis: isCrisis ? 1 : 0,
      crisis_level: crisisLevel as any,
      crisis_summary: report.crisisSummary,
      core_concerns: JSON.stringify(report.coreConcerns),
      emotional_valence: report.emotionalValence,
      encrypted_real_identity: encryptedIdentity || '',
      deidentified_report: JSON.stringify(deidentifiedReportObj),
      disposition_status: isCrisis ? 'pending_contact' : 'closed',
      disposition_note: '',
      created_at: Math.floor(Date.now() / 1000),
    };

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
    await this.consolidateMemory(env, {
      userId: userId || effectiveName || sessionId,
      openRouterKey,
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

  private static async consolidateMemory(
    env: Env,
    params: {
      userId: string;
      openRouterKey: string | undefined;
      dialogueTurns: Array<{ role: 'user' | 'assistant'; content: string }>;
      transcriptText: string;
    },
  ): Promise<void> {
    const { userId, openRouterKey, dialogueTurns, transcriptText } = params;
    const existingMemory = await getSituationalMemory(env, userId);

    let turns = dialogueTurns;
    if (turns.length === 0 && transcriptText) {
      turns = transcriptText
        .split('\n')
        .filter(Boolean)
        .map((line) => ({
          role:
            line.startsWith('学生') || line.startsWith('来访者')
              ? ('user' as const)
              : ('assistant' as const),
          content: line.replace(/^(学生|智能体|来访者|助手)[:：]\s*/, ''),
        }));
    }

    if (turns.length < 2) return;

    try {
      const consolidated = await consolidateSituationalMemoryWithLLM(
        userId,
        existingMemory,
        turns,
        {
          apiKey: openRouterKey,
          baseUrl: env.OPENROUTER_BASE_URL,
          model: env.OPENROUTER_MODEL || atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx'),
        },
      );
      if (consolidated) {
        await saveSituationalMemory(env, consolidated);
      }
    } catch {}
  }
}
