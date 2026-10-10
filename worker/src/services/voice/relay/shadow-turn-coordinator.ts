import type { BargeInCoordinator } from '../barge-in-coordinator';
import { isWsOpen } from '../../../lib/ws-constants';

export class ShadowTurnCoordinator {
  public static triggerTurnResponse(
    upstreamWs: WebSocket,
    coordinator: BargeInCoordinator,
    currentSeq: number,
    signal: AbortSignal,
    cognitiveHint?: string | null,
  ): void {
    if (!coordinator.isValid(currentSeq) || signal.aborted) return;
    if (!isWsOpen(upstreamWs)) return;

    if (cognitiveHint && cognitiveHint.trim()) {
      upstreamWs.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            instructions: `【影子大脑认知指导】：${cognitiveHint.trim()}。请以同校同级死党语气，自然转化为高中生日常口语回应，语速稍快轻快利落，严格控制在 1-2 句话内（40字以内），严禁任何英文。`,
          },
        }),
      );
    } else {
      upstreamWs.send(JSON.stringify({ type: 'response.create' }));
    }
  }

  public static coordinateShadowTurn(params: any): void {
    if (params.dualTrack) {
      this.coordinateDualTrackTurn(params);
    } else {
      this.coordinateSingleTrackTurn(params);
    }
  }

  public static coordinateDualTrackTurn(params: any): void {
    const {
      shadowPipeline,
      serverWs,
      upstreamWs,
      coordinator,
      currentSeq,
      signal,
      userText,
      dialogueHistory,
      studentName,
      situationalMemory,
      getStudentName,
      setStudentName,
      isDirectLive,
      getActiveDelegationId,
    } = params;

    if (!isDirectLive) {
      this.triggerTurnResponse(upstreamWs, coordinator, currentSeq, signal, null);
    }

    shadowPipeline
      ?.execute({
        userText,
        dialogueHistory,
        studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(currentSeq) && !signal.aborted,
        onExtractedName: (name: string) => {
          if (!getStudentName?.()) setStudentName?.(name);
        },
      })
      ?.then((hint: string) => {
        if (signal.aborted || !coordinator.isValid(currentSeq)) return;
        if (isWsOpen(serverWs)) {
          serverWs.send(
            JSON.stringify({
              type: 'rethink.telemetry.shadow_directive',
              turnSequence: currentSeq,
              userText,
              cognitiveHint: hint,
              fallback: !hint,
              timestamp: Date.now(),
            }),
          );
        }
        if (hint && isWsOpen(upstreamWs)) {
          const delegationId = getActiveDelegationId?.();
          if (isDirectLive && delegationId) {
            upstreamWs.send(
              JSON.stringify({
                type: 'session.thinking.append',
                delegation_id: delegationId,
                thinking: `【影子大脑认知指导】：${hint.trim()}`,
              }),
            );
          } else if (!isDirectLive) {
            upstreamWs.send(
              JSON.stringify({
                type: 'session.update',
                session: {
                  type: 'realtime',
                  instructions: `【影子大脑认知指导】：${hint.trim()}`,
                },
              }),
            );
          }
        }
      })
      ?.catch(() => null);
  }

  public static coordinateSingleTrackTurn(params: any): void {
    const {
      shadowPipeline,
      serverWs,
      upstreamWs,
      coordinator,
      currentSeq,
      signal,
      userText,
      dialogueHistory,
      studentName,
      situationalMemory,
      getStudentName,
      setStudentName,
      timeoutMs = 2500,
    } = params;

    let hasResponded = false;
    let timer: any = null;
    const shadowStartTime = Date.now();

    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        resolve(null);
      }, timeoutMs);
    });

    signal?.addEventListener?.(
      'abort',
      () => {
        if (timer) clearTimeout(timer);
      },
      { once: true },
    );

    const shadowPromise = shadowPipeline
      ?.execute({
        userText,
        dialogueHistory,
        studentName,
        situationalMemory,
        signal,
        isTurnValid: () => coordinator.isValid(currentSeq) && !hasResponded,
        onExtractedName: (name: string) => {
          if (!getStudentName?.()) setStudentName?.(name);
        },
      })
      ?.catch(() => null);

    void Promise.race([shadowPromise, timeoutPromise]).then((hint) => {
      if (timer) clearTimeout(timer);
      if (hasResponded) return;
      hasResponded = true;
      const durationMs = Date.now() - shadowStartTime;

      if (isWsOpen(serverWs)) {
        serverWs.send(
          JSON.stringify({
            type: 'rethink.telemetry.shadow_directive',
            turnSequence: currentSeq,
            userText,
            cognitiveHint: hint,
            durationMs,
            fallback: !hint,
            timestamp: Date.now(),
          }),
        );
      }

      this.triggerTurnResponse(upstreamWs, coordinator, currentSeq, signal, hint);
    });
  }
}
