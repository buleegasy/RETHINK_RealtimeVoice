import { CbtStateMachine } from '../../lib/cbt-fsm';
import { BargeInCoordinator } from './barge-in-coordinator';
import { CrisisHandler } from './crisis-handler';
import { ShadowReasoningPipeline } from './shadow-reasoning-pipeline';
import { isL1Crisis, checkL2FlashSafety } from '../../lib/safety-filter';

export interface SidebandAgentConfig {
  sessionId: string;
  userId: string;
  studentName: string;
  situationalMemory: any;
  serverWs: WebSocket;
  upstreamWs: WebSocket;
  coordinator: BargeInCoordinator;
  crisisHandler: CrisisHandler;
  shadowPipeline: ShadowReasoningPipeline;
  openRouterConfig: {
    openRouterKey: string;
    openRouterBaseUrl?: string;
    openRouterModel: string;
  };
  isDirectLive: boolean;
}

/**
 * 原生旁路监护智能体 (SidebandAgent)
 * 职责：作为全双工语音会话的独立控制与认知平面，托管转写监听、L1/L2 双轨安全熔断、CBT 状态机及思维注入
 */
export class SidebandAgent {
  private readonly dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private readonly cbtFsm = new CbtStateMachine();
  private readonly processedItemIds = new Set<string>();
  private activeDelegationId: string | null = null;
  private attachWs: WebSocket | null = null;
  private studentName: string;

  constructor(private readonly config: SidebandAgentConfig) {
    this.studentName = config.studentName;
  }

  public attachControlStream(ws: WebSocket): void {
    this.attachWs = ws;
  }

  public getDialogueHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.dialogueHistory;
  }

  public getCbtStage(): string {
    return this.cbtFsm.getStage();
  }

  public getStudentName(): string {
    return this.studentName;
  }

  public setStudentName(name: string): void {
    this.studentName = name;
  }

  public getActiveDelegationId(): string | null {
    return this.activeDelegationId;
  }

  public setActiveDelegationId(id: string | null): void {
    this.activeDelegationId = id;
  }

  /**
   * 监听上游下行事件并提取旁路认知要素
   */
  public async handleUpstreamEvent(payload: any): Promise<void> {
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'session.delegation.created' && payload.delegation_id) {
      this.setActiveDelegationId(payload.delegation_id);
      return;
    }

    if (
      payload.type === 'input_audio_buffer.speech_started' ||
      payload.type === 'session.input_audio.speech_started'
    ) {
      this.config.coordinator.interrupt();
      return;
    }

    const userText = this.extractTranscriptText(payload);
    const itemId = payload.item_id || payload.item?.id || payload.event_id;
    if (userText) {
      await this.processUserSpeech(userText, itemId);
      return;
    }

    this.recordAssistantTranscript(payload);
  }

  /**
   * 处理用户有效发言的旁路认知推演与安全审计
   */
  public async processUserSpeech(userText: string, itemId?: string): Promise<void> {
    if (itemId && this.processedItemIds.has(itemId)) return;
    if (itemId) {
      this.processedItemIds.add(itemId);
      if (this.processedItemIds.size > 50) {
        const oldest = this.processedItemIds.values().next().value;
        if (oldest) this.processedItemIds.delete(oldest);
      }
    }

    this.dialogueHistory.push({ role: 'user', content: userText });
    this.cbtFsm.recordTurn('user');
    const { sequenceId, signal } = this.config.coordinator.nextTurn();

    // 1. L1 边缘即时硬过滤
    if (isL1Crisis(userText)) {
      this.config.crisisHandler.triggerIntervention('L1', 'L1本地即时硬过滤命中危机敏感词', [
        '自伤自杀危机',
        '紧急干预',
      ]);
      return;
    }

    // 非云端直连模式下触发显式流式回复
    if (!this.config.isDirectLive) {
      this.triggerTurnResponse(sequenceId, signal);
    }

    // 2. L2 异步语义旁路熔断
    this.dispatchL2SafetyCheck(userText, sequenceId);

    // 3. 影子大脑认知指导推演与旁路注入（异步非阻塞执行）
    this.dispatchShadowReasoning(userText, sequenceId, signal).catch(() => {});
  }

  /**
   * 旁路注入思维帧 (session.thinking.append / instructions)
   */
  public injectCognitiveGuidance(hint: string): void {
    const { upstreamWs, isDirectLive } = this.config;
    const trimmed = hint.trim();

    if (this.attachWs && this.attachWs.readyState === WebSocket.OPEN) {
      try {
        this.attachWs.send(
          JSON.stringify({
            type: 'rethink.sideband.directive',
            cognitiveHint: trimmed,
            timestamp: Date.now(),
          }),
        );
      } catch {}
    }

    if (upstreamWs.readyState !== WebSocket.OPEN) return;

    if (isDirectLive) {
      if (this.activeDelegationId) {
        upstreamWs.send(
          JSON.stringify({
            type: 'session.thinking.append',
            delegation_id: this.activeDelegationId,
            thinking: `【影子大脑认知指导】：${trimmed}`,
          }),
        );
      }
    } else {
      upstreamWs.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: `【影子大脑认知指导】：${trimmed}。请以同校同级死党语气，自然转化为高中生日常口语交流，并在后续对话中自然贯彻此认知引导。`,
          },
        }),
      );
    }
  }

  private triggerTurnResponse(seq: number, signal: AbortSignal): void {
    const { upstreamWs, coordinator } = this.config;
    if (!coordinator.isValid(seq) || signal.aborted) return;
    if (upstreamWs.readyState !== WebSocket.OPEN) return;
    upstreamWs.send(JSON.stringify({ type: 'response.create' }));
  }

  private extractTranscriptText(payload: any): string {
    if (
      (payload.type === 'conversation.item.input_audio_transcription.completed' ||
        payload.type === 'input_audio_transcription.completed' ||
        payload.type === 'session.input_transcript.completed') &&
      (payload.transcript || payload.text)
    ) {
      return String(payload.transcript || payload.text || '').trim();
    }

    if (
      (payload.type === 'conversation.item.created' ||
        payload.type === 'conversation.item.added' ||
        payload.type === 'conversation.item.done') &&
      payload.item?.role === 'user'
    ) {
      const contents = Array.isArray(payload.item?.content) ? payload.item.content : [];
      for (const c of contents) {
        if (c.transcript) return String(c.transcript).trim();
        if (c.text) return String(c.text).trim();
      }
    }
    return '';
  }

  private recordAssistantTranscript(payload: any): void {
    if (
      (payload.type === 'response.audio_transcript.done' ||
        payload.type === 'session.output_transcript.completed') &&
      (payload.transcript || payload.text)
    ) {
      this.dialogueHistory.push({ role: 'assistant', content: payload.transcript || payload.text });
      this.cbtFsm.recordTurn('assistant');
    }
  }

  private dispatchL2SafetyCheck(userText: string, seq: number): void {
    const { serverWs, coordinator, crisisHandler, openRouterConfig } = this.config;
    const startTime = Date.now();

    checkL2FlashSafety(userText, {
      apiKey: openRouterConfig.openRouterKey,
      baseUrl: openRouterConfig.openRouterBaseUrl,
      signal: AbortSignal.timeout(5000),
    })
      .then((isCrisis) => {
        if (serverWs.readyState === WebSocket.OPEN) {
          serverWs.send(
            JSON.stringify({
              type: 'rethink.telemetry.safety_check',
              turnSequence: seq,
              isCrisis,
              durationMs: Date.now() - startTime,
              timestamp: Date.now(),
            }),
          );
        }
        if (isCrisis && !crisisHandler.isTriggered) {
          coordinator.interrupt();
          crisisHandler.triggerIntervention('L2', 'L2 DeepSeek V4 Flash语义熔断命中危机', [
            '自伤自杀危机',
            '语义旁路熔断',
          ]);
        }
      })
      .catch(() => {});
  }

  private async dispatchShadowReasoning(
    userText: string,
    seq: number,
    signal: AbortSignal,
  ): Promise<void> {
    const { shadowPipeline, serverWs, coordinator, situationalMemory } = this.config;
    const startTime = Date.now();

    try {
      const hint = await shadowPipeline.execute({
        userText,
        dialogueHistory: this.dialogueHistory,
        studentName: this.studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(seq) && !signal.aborted,
        onExtractedName: (name) => {
          if (!this.studentName) this.studentName = name;
        },
      });

      if (signal.aborted || !coordinator.isValid(seq)) return;

      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.send(
          JSON.stringify({
            type: 'rethink.telemetry.shadow_directive',
            turnSequence: seq,
            userText,
            cognitiveHint: hint,
            durationMs: Date.now() - startTime,
            fallback: !hint,
            timestamp: Date.now(),
          }),
        );
      }

      if (hint) {
        this.injectCognitiveGuidance(hint);
      }
    } catch {}
  }
}
