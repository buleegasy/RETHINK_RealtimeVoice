import { useRef, useCallback } from 'react';
import { WebCryptoAesGcm } from '../lib/pipelines/security/webCryptoAesGcm';
import { DeidentifiedCbtReportGenerator } from '../lib/pipelines/reporting/deidentifiedReportGenerator';
import { apiFetch } from '../lib/api';
import type { DialogueTurn, SanitizedCbtReport, CBTStage } from '../types';

export interface PersistSessionParams {
  sessionId: string;
  duration: number;
  stageReached: CBTStage;
  user?: { userName?: string; displayName?: string } | null;
  turns: DialogueTurn[];
  onReportGenerated?: (report: SanitizedCbtReport) => void;
}

/**
 * useSessionPersistence
 * 负责脱敏简报生成、客户端本地 AES-GCM 数据加解密、LocalStorage 归档及服务端持久化同步
 */
export function useSessionPersistence() {
  const cryptoRef = useRef<WebCryptoAesGcm>(new WebCryptoAesGcm());
  const reportGeneratorRef = useRef<DeidentifiedCbtReportGenerator>(
    new DeidentifiedCbtReportGenerator(),
  );

  const persistSession = useCallback(async (params: PersistSessionParams) => {
    const { sessionId, duration, stageReached, user, turns, onReportGenerated } = params;
    if (turns.length === 0 && duration === 0) return;

    try {
      const report = await reportGeneratorRef.current.generate({
        sessionId,
        durationSeconds: duration,
        stageReached,
        rawUserName: user?.userName,
        turns,
      });

      onReportGenerated?.(report);

      const plainJson = JSON.stringify({ turns, report });
      let encryptedBundle = '';
      try {
        encryptedBundle = await cryptoRef.current.encrypt(plainJson);
      } catch (err) {
        console.debug('[SessionPersistence] 本地加密会话数据异常:', err);
      }

      const transcriptText = turns
        .map(
          (t) =>
            `${t.role === 'user' ? user?.displayName || user?.userName || '学生' : '智能体'}: ${t.content}`,
        )
        .join('\n');

      const localSessionRecord = {
        id: sessionId,
        sessionId,
        duration,
        stage: stageReached,
        isCrisis: stageReached === 'Crisis_Escalation',
        crisisLevel: stageReached === 'Crisis_Escalation' ? 3 : 0,
        crisisSummary: report.emotionalTrajectory?.deltaNotes || '真实来访倾诉记录',
        coreConcerns: report.coreConcerns || ['真实交流'],
        emotionalValence: 0.0,
        deidentifiedReport: report,
        dispositionStatus: 'pending_contact',
        dispositionNote: '',
        createdAt: Math.floor(Date.now() / 1000),
        hasEncryptedIdentity: Boolean(encryptedBundle),
      };

      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('rethink_real_sessions') || '[]';
          const existing = JSON.parse(raw);
          if (Array.isArray(existing)) {
            const idx = existing.findIndex((s: any) => s.sessionId === sessionId);
            if (idx >= 0) existing[idx] = localSessionRecord;
            else existing.unshift(localSessionRecord);
            localStorage.setItem('rethink_real_sessions', JSON.stringify(existing.slice(0, 50)));
          }
        }
      } catch (err) {
        console.debug('[SessionPersistence] localStorage 写入异常:', err);
      }

      apiFetch('/api/voice/session/persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          duration,
          encrypted_payload: encryptedBundle,
          stage: stageReached,
          username: user?.userName || user?.displayName || 'student_user',
          transcript_text: transcriptText,
        }),
      })
        .then(async (res) => {
          if (res && res.ok) {
            const data: any = await res.json();
            if (data?.report) {
              onReportGenerated?.(data.report);
              try {
                if (typeof localStorage !== 'undefined') {
                  const raw = localStorage.getItem('rethink_real_sessions') || '[]';
                  const existing = JSON.parse(raw);
                  if (Array.isArray(existing)) {
                    const idx = existing.findIndex((s: any) => s.sessionId === sessionId);
                    const updatedRecord = {
                      ...(existing[idx] || localSessionRecord),
                      coreConcerns: data.report.coreConcerns || ['日常交流'],
                      crisisSummary:
                        data.report.emotionalTrajectory?.deltaNotes ||
                        data.report.crisisSummary ||
                        '',
                      crisisLevel: data.crisis_level ?? (data.is_crisis ? 3 : 0),
                      isCrisis: Boolean(data.is_crisis),
                      deidentifiedReport: data.report,
                    };
                    if (idx >= 0) existing[idx] = updatedRecord;
                    else existing.unshift(updatedRecord);
                    localStorage.setItem(
                      'rethink_real_sessions',
                      JSON.stringify(existing.slice(0, 50)),
                    );
                  }
                }
              } catch (cacheErr) {
                console.debug('[SessionPersistence] 更新大模型报告到本地缓存异常:', cacheErr);
              }
            }
          }
        })
        .catch((e) => {
          console.warn('[SessionPersistence] 后台持久化同步异常:', e);
        });
    } catch (err) {
      console.error('[SessionPersistence] 报告生成或持久化处理异常:', err);
    }
  }, []);

  return {
    persistSession,
  };
}
