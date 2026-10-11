import type { MutableRefObject } from 'react';
import type { AudioGraphController } from '../../lib/audio/audioGraph';
import { useTelemetryStore } from '../../store/telemetryStore';

export function startSessionTimers(
  timerRef: MutableRefObject<ReturnType<typeof setInterval> | null>,
  telemetryTimerRef: MutableRefObject<ReturnType<typeof setInterval> | null>,
  audioGraphRef: MutableRefObject<AudioGraphController | null>,
  setCallDuration: (fn: (prev: number) => number) => void,
): void {
  stopSessionTimers(timerRef, telemetryTimerRef);

  timerRef.current = setInterval(() => {
    setCallDuration((prev) => prev + 1);
  }, 1000);

  telemetryTimerRef.current = setInterval(() => {
    if (audioGraphRef.current) {
      const activeTransport = useTelemetryStore.getState().activeTransport;
      if (activeTransport === 'websocket') {
        const metrics = audioGraphRef.current.getJitterMetrics();
        useTelemetryStore.getState().updateJitterMetrics(metrics);
      }
      const inLvl = audioGraphRef.current.getInputLevel();
      const outLvl = audioGraphRef.current.getOutputLevel();
      useTelemetryStore.getState().updateAudioLevels(inLvl, outLvl);
    }
  }, 100);
}

export function stopSessionTimers(
  timerRef: MutableRefObject<ReturnType<typeof setInterval> | null>,
  telemetryTimerRef: MutableRefObject<ReturnType<typeof setInterval> | null>,
): void {
  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
  if (telemetryTimerRef.current) {
    clearInterval(telemetryTimerRef.current);
    telemetryTimerRef.current = null;
  }
}
