import type {
  ITranscriptionPipeline,
  TranscriptSegment,
} from '../../lib/pipelines/transcription/types';
import { useTelemetryStore } from '../../store/telemetryStore';

export function bindStreamingTranscriptSubscription(
  transcription: ITranscriptionPipeline,
): () => void {
  return transcription.subscribe((seg: TranscriptSegment) => {
    if (!seg.isFinal) {
      if (seg.speaker === 'user') {
        useTelemetryStore.getState().setStreamingUserText(seg.text);
      } else {
        useTelemetryStore.getState().setStreamingAssistantText(seg.text);
      }
    }
  });
}

export function bindCrisisEndCallListener(onEndCall: () => void): () => void {
  const handler = () => {
    void onEndCall();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('rethink:crisis:end_call', handler);
  }
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('rethink:crisis:end_call', handler);
    }
  };
}
