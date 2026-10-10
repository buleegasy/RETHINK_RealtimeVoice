import type { Env, SessionRecord } from '../../../types';
import { encryptAesGcm } from '../../../lib/crypto-helper';
import { consolidateSituationalMemoryWithLLM } from '../../../lib/deepseek-flash';
import { getSituationalMemory, saveSituationalMemory } from '../../../lib/memory-store';

export function resolveEffectiveStage(isCrisis: boolean, stage: string): string {
  if (isCrisis) return 'Crisis_Escalation';
  if (stage === 'Active_Listening') return 'Socratic_Questioning';
  return stage;
}

export async function encryptRealIdentityIfCrisis(params: {
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

export interface DeidentifiedReportParams {
  sessionId: string;
  duration: number;
  effectiveName: string;
  effectiveStage: string;
  report: any;
  isCrisis: boolean;
}

export function buildDeidentifiedReport(params: DeidentifiedReportParams) {
  const { sessionId, duration, effectiveName, effectiveStage, report, isCrisis } = params;
  return {
    sessionId,
    generatedAt: Date.now(),
    durationSeconds: duration,
    userDisplayName: effectiveName ? `${effectiveName[0]}*同学` : '来访者',
    cbtStageReached: effectiveStage,
    coreConcerns: report.coreConcerns,
    cognitiveDistortions: report.cognitiveDistortions,
    emotionalTrajectory: {
      initial: report.initialEmotion || (report.crisisLevel >= 2 ? '高度负性情绪倾诉' : '情绪低落'),
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
}

export interface SessionRecordParams {
  sessionId: string;
  duration: number;
  effectiveStage: string;
  isCrisis: boolean;
  crisisLevel: number;
  crisisSummary: string;
  coreConcerns: any;
  emotionalValence?: number;
  encryptedIdentity: string;
  deidentifiedReportObj: any;
}

export function buildSessionRecord(params: SessionRecordParams): SessionRecord {
  const {
    sessionId,
    duration,
    effectiveStage,
    isCrisis,
    crisisLevel,
    crisisSummary,
    coreConcerns,
    emotionalValence,
    encryptedIdentity,
    deidentifiedReportObj,
  } = params;

  return {
    id: sessionId,
    session_id: sessionId,
    duration,
    stage: effectiveStage,
    is_crisis: isCrisis ? 1 : 0,
    crisis_level: crisisLevel as any,
    crisis_summary: crisisSummary,
    core_concerns: JSON.stringify(coreConcerns),
    emotional_valence: emotionalValence,
    encrypted_real_identity: encryptedIdentity || '',
    deidentified_report: JSON.stringify(deidentifiedReportObj),
    disposition_status: isCrisis ? 'pending_contact' : 'closed',
    disposition_note: '',
    created_at: Math.floor(Date.now() / 1000),
  };
}

export async function consolidateDialogueMemory(
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
    const consolidated = await consolidateSituationalMemoryWithLLM(userId, existingMemory, turns, {
      apiKey: openRouterKey,
      baseUrl: env.OPENROUTER_BASE_URL,
      model: env.OPENROUTER_MODEL || atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx'),
    });
    if (consolidated) {
      await saveSituationalMemory(env, consolidated);
    }
  } catch {}
}
