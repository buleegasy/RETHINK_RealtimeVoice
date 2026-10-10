import { checkL2FlashSafety } from '../../../lib/safety-filter';
import { isWsOpen } from '../../../lib/ws-constants';
import type { SidebandAgentConfig } from '../sideband-agent';

export class SidebandDispatcher {
  constructor(private readonly config: SidebandAgentConfig) {}

  public dispatchL2Safety(userText: string, seq: number): void {
    const { serverWs, coordinator, crisisHandler, openRouterConfig } = this.config;
    const startTime = Date.now();

    checkL2FlashSafety(userText, {
      apiKey: openRouterConfig.openRouterKey,
      baseUrl: openRouterConfig.openRouterBaseUrl,
      signal: AbortSignal.timeout(5000),
    })
      .then((isCrisis) => {
        if (isWsOpen(serverWs)) {
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

    try {
      const hint = await shadowPipeline.execute({
        userText,
        dialogueHistory,
        studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(seq) && !signal.aborted,
        onExtractedName,
      });

      if (signal.aborted || !coordinator.isValid(seq)) return;

      if (isWsOpen(serverWs)) {
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
