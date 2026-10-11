import { isWsOpen } from '../../../lib/ws-constants';
import type { SidebandAgentConfig } from '../sideband-agent';

export class SidebandDispatcher {
  constructor(private readonly config: SidebandAgentConfig) {}

  public async dispatchShadow(
    userText: string,
    seq: number,
    signal: AbortSignal,
    dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    studentName: string,
    onExtractedName: (name: string) => void,
    onInject: (hint: string) => void,
  ): Promise<void> {
    const { shadowPipeline, serverWs, coordinator, situationalMemory } = this.config;
    const startTime = Date.now();

    let currentRagRecall: any = null;

    try {
      const hint = await shadowPipeline.execute({
        userText,
        dialogueHistory,
        studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(seq) && !signal.aborted,
        onExtractedName,
        onRagRecall: (recall: any) => {
          currentRagRecall = recall;
        },
      });

      if (signal.aborted || !coordinator.isValid(seq)) return;

      if (isWsOpen(serverWs)) {
        serverWs.send(
          JSON.stringify({
            type: 'rethink.telemetry.shadow_directive',
            turnSequence: seq,
            userText,
            cognitiveHint: hint,
            ragRecall: currentRagRecall,
            durationMs: Date.now() - startTime,
            fallback: !hint,
            timestamp: Date.now(),
          }),
        );
      }

      if (hint) {
        onInject(hint);
      }
    } catch {}
  }

  public injectGuidance(
    hint: string,
    activeDelegationId: string | null,
    attachWs: WebSocket | null,
  ): void {
    const { upstreamWs, isDirectLive } = this.config;
    const trimmed = hint.trim();

    if (isWsOpen(attachWs)) {
      try {
        attachWs.send(
          JSON.stringify({
            type: 'rethink.sideband.directive',
            cognitiveHint: trimmed,
            timestamp: Date.now(),
          }),
        );
      } catch {}
    }

    if (!isWsOpen(upstreamWs)) return;

    if (isDirectLive) {
      if (activeDelegationId) {
        upstreamWs.send(
          JSON.stringify({
            type: 'session.thinking.append',
            delegation_id: activeDelegationId,
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
}
