import { useBoothStore } from '../../store/boothStore';
import { useTelemetryStore } from '../../store/telemetryStore';
import type { BufferedTranscriptionPipeline } from '../../lib/pipelines/transcription/bufferedTranscription';
import type { RealtimeToolDispatcher } from '../../lib/tools/toolDispatcher';

export function finalizeUserTurn(
  transcription: BufferedTranscriptionPipeline,
  userStartTime: number | null,
  toolDispatcher?: RealtimeToolDispatcher | null,
): { userTurnId: string | null; userTurnTimestamp: number | null } {
  const userSeg = transcription.finalizeCurrentTurn('user', userStartTime || undefined);
  if (!userSeg?.text) {
    return { userTurnId: null, userTurnTimestamp: null };
  }

  const currentStage = useBoothStore.getState().cbtStage;
  useBoothStore.getState().addDialogueTurn({
    id: userSeg.id,
    role: 'user',
    content: userSeg.text,
    timestamp: userSeg.timestamp,
    stage: currentStage,
  });
  useTelemetryStore.getState().appendFinalTranscript({
    id: userSeg.id,
    role: 'user',
    text: userSeg.text,
    timestamp: userSeg.timestamp,
  });

  if (toolDispatcher) {
    const pacing = toolDispatcher.getFsm().recordTurn('user');
    if (pacing.autoPromotedStage) {
      useBoothStore.getState().setCBTStage(pacing.autoPromotedStage);
      useTelemetryStore.getState().setCbtStage(pacing.autoPromotedStage);
    }
  }

  return { userTurnId: userSeg.id, userTurnTimestamp: userSeg.timestamp };
}

export function finalizeAssistantTurn(
  transcription: BufferedTranscriptionPipeline,
  asstStartTime: number | null,
  minTimestamp?: number | null,
): void {
  const asstSeg = transcription.finalizeCurrentTurn('assistant', asstStartTime || undefined);
  if (!asstSeg?.text) return;

  if (minTimestamp && asstSeg.timestamp <= minTimestamp) {
    asstSeg.timestamp = minTimestamp + 1;
  }

  useBoothStore.getState().addDialogueTurn({
    id: asstSeg.id,
    role: 'assistant',
    content: asstSeg.text,
    timestamp: asstSeg.timestamp,
    stage: useBoothStore.getState().cbtStage,
  });
  useTelemetryStore.getState().appendFinalTranscript({
    id: asstSeg.id,
    role: 'assistant',
    text: asstSeg.text,
    timestamp: asstSeg.timestamp,
  });
}

export function finalizeDialogueTurns(
  transcription: BufferedTranscriptionPipeline,
  userSpeechStartTime: number | null,
  asstSpeechStartTime: number | null,
  toolDispatcher?: RealtimeToolDispatcher | null,
): { lastUserTurnId: string | null; lastUserTurnTimestamp: number | null } {
  let userStartTime = userSpeechStartTime;
  let asstStartTime = asstSpeechStartTime;

  if (asstStartTime) {
    if (!userStartTime || userStartTime >= asstStartTime) {
      userStartTime = asstStartTime - 1;
    }
  } else if (userStartTime) {
    asstStartTime = Date.now();
    if (userStartTime >= asstStartTime) {
      userStartTime = asstStartTime - 1;
    }
  }

  const { userTurnId, userTurnTimestamp } = finalizeUserTurn(
    transcription,
    userStartTime,
    toolDispatcher,
  );
  finalizeAssistantTurn(transcription, asstStartTime, userTurnTimestamp);

  return { lastUserTurnId: userTurnId, lastUserTurnTimestamp: userTurnTimestamp };
}

export function applyLocalInterrupt(params: {
  audioGraph: any;
  client: any;
  transcription: BufferedTranscriptionPipeline;
  asstStartTime: number | null;
  interruptTime: number;
}): void {
  useTelemetryStore.getState().incrementBargeIns();
  const playedMs = params.audioGraph ? params.audioGraph.getPlaybackDurationMs() : 0;
  if (params.audioGraph) {
    params.audioGraph.stopPlayback(150);
    params.audioGraph.setAiThinking(false);
    params.audioGraph.setAiSpeaking(false);
  }
  if (params.client) {
    params.client.updateTurnDetection('listening');
    const itemId = params.client.getCurrentResponseItemId?.();
    params.client.interrupt({
      itemId: itemId || undefined,
      audioEndMs: playedMs,
    });
  }
  useBoothStore.getState().setDuplexPhase('listening');
  useTelemetryStore.getState().setDuplexPhase('listening');
  const truncatedTime =
    params.asstStartTime && params.asstStartTime < params.interruptTime
      ? params.asstStartTime
      : params.interruptTime - 1;
  finalizeAssistantTurn(params.transcription, truncatedTime);
}
