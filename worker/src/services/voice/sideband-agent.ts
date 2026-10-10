import { CbtStateMachine } from '../../lib/cbt-fsm';
import { isL1Crisis } from '../../lib/safety-filter';
import type { BargeInCoordinator } from './barge-in-coordinator';
import type { CrisisHandler } from './crisis-handler';
import type { ShadowReasoningPipeline } from './shadow-reasoning-pipeline';
import { SpeechTurnManager } from './sideband/speech-turn-manager';
import { SidebandDispatcher } from './sideband/sideband-dispatcher';

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
  enableShadowReasoning?: boolean;
}

/**
 * 原生旁路监护智能体 (SidebandAgent)
 * 职责：作为全双工语音会话的独立控制与认知平面，托管转写监听、L1/L2 双轨安全熔断、CBT 状态机及思维注入
 */
export class SidebandAgent {
  private readonly turnManager = new SpeechTurnManager();
  private readonly dispatcher: SidebandDispatcher;
  private readonly cbtFsm = new CbtStateMachine();
  private readonly processedItemIds = new Set<string>();
  private activeDelegationId: string | null = null;
  private attachWs: WebSocket | null = null;
  private studentName: string;
  private readonly enableShadowReasoning: boolean;

  constructor(private readonly config: SidebandAgentConfig) {
    this.studentName = config.studentName;
    this.enableShadowReasoning = config.enableShadowReasoning ?? true;
    this.dispatcher = new SidebandDispatcher(config);
  }

  public attachControlStream(ws: WebSocket): void {
    this.attachWs = ws;
  }

  public finalizeAssistantTurn(): void {
    if (this.turnManager.userBuffer.trim()) {
      this.finalizeUserTurn();
    }
    if (this.turnManager.assistantBuffer.trim()) {
      const recorded = this.turnManager.recordAssistantTurn(this.turnManager.assistantBuffer);
      if (recorded) {
        this.cbtFsm.recordTurn('assistant');
      }
    }
  }

  public finalizeUserTurn(): void {
    if (this.turnManager.userBuffer.trim()) {
      const text = this.turnManager.userBuffer.trim();
      this.turnManager.userBuffer = '';
      void this.processUserSpeech(text);
    }
  }

  public hasPendingUserSpeech(): boolean {
    return Boolean(this.turnManager.userBuffer.trim());
  }

  public getDialogueHistory(): Array<{ role: 'user' | 'assistant'; content: string }> {
    this.finalizeUserTurn();
    this.finalizeAssistantTurn();
    return this.turnManager.history;
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
      this.finalizeAssistantTurn();
      this.turnManager.userBuffer = '';
      return;
    }

    if (
      payload.type === 'session.input_transcript.delta' ||
      payload.type === 'conversation.item.input_audio_transcription.delta' ||
      payload.type === 'input_audio_transcription.delta'
    ) {
      const delta = payload.delta || payload.transcript || payload.text || '';
      if (this.turnManager.assistantBuffer.trim()) {
        this.finalizeAssistantTurn();
      }
      this.turnManager.appendUserBuffer(delta);
      return;
    }

    if (payload.type === 'session.output_transcript.delta') {
      const delta = payload.delta || payload.transcript || payload.text || '';
      this.turnManager.appendAssistantBuffer(delta);
      return;
    }

    if (
      payload.type === 'session.input_audio.speech_stopped' ||
      payload.type === 'session.output_audio.delta'
    ) {
      if (this.turnManager.userBuffer.trim()) {
        this.finalizeUserTurn();
      }
    }

    const userText = this.extractTranscriptText(payload);
    const itemId = payload.item_id || payload.item?.id || payload.event_id;
    if (userText) {
      this.turnManager.userBuffer = '';
      await this.processUserSpeech(userText, itemId);
      return;
    }

    this.recordAssistantTranscript(payload);
  }

  public async processUserSpeech(userText: string, itemId?: string): Promise<void> {
    const trimmed = (userText || '').trim();
    if (!trimmed) return;

    if (itemId && this.processedItemIds.has(itemId)) return;
    if (itemId) {
      this.processedItemIds.add(itemId);
      if (this.processedItemIds.size > 50) {
        const oldest = this.processedItemIds.values().next().value;
        if (oldest) this.processedItemIds.delete(oldest);
      }
    }

    const isNewTurn = this.turnManager.recordUserTurn(trimmed);
    if (!isNewTurn) return;

    this.cbtFsm.recordTurn('user');
    const { sequenceId, signal } = this.config.coordinator.nextTurn();

    if (isL1Crisis(trimmed)) {
      this.config.crisisHandler.triggerIntervention('L1', 'L1本地即时硬过滤命中危机敏感词', [
        '自伤自杀危机',
        '紧急干预',
      ]);
      return;
    }

    if (!this.config.isDirectLive) {
      this.triggerTurnResponse(sequenceId, signal);
    }

    this.dispatcher.dispatchL2Safety(trimmed, sequenceId);

    if (this.enableShadowReasoning) {
      this.dispatcher
        .dispatchShadow(
          trimmed,
          sequenceId,
          signal,
          this.turnManager.history,
          this.studentName,
          (name) => {
            if (!this.studentName) this.studentName = name;
          },
          (hint) => this.injectCognitiveGuidance(hint),
        )
        .catch(() => {});
    }
  }

  public injectCognitiveGuidance(hint: string): void {
    this.dispatcher.injectGuidance(hint, this.activeDelegationId, this.attachWs);
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
    if (this.turnManager.userBuffer.trim()) {
      this.finalizeUserTurn();
    }
    const explicitText = payload.transcript || payload.text;
    if (
      (payload.type === 'response.audio_transcript.done' ||
        payload.type === 'session.output_transcript.completed') &&
      explicitText
    ) {
      const recorded = this.turnManager.recordAssistantTurn(explicitText);
      if (recorded) {
        this.cbtFsm.recordTurn('assistant');
      }
      return;
    }

    if (
      (payload.type === 'response.done' ||
        payload.type === 'session.output_audio.done' ||
        payload.type === 'session.output_transcript.completed') &&
      this.turnManager.assistantBuffer.trim()
    ) {
      const recorded = this.turnManager.recordAssistantTurn(this.turnManager.assistantBuffer);
      if (recorded) {
        this.cbtFsm.recordTurn('assistant');
      }
    }
  }
}
