import { SOMATIC_EMOTION_CAPSULES } from '@rethink/shared';
import type { RagChunk } from '../types';

export const SOMATIC_EMOTION_KNOWLEDGE: RagChunk[] = SOMATIC_EMOTION_CAPSULES.map((capsule) => ({
  ...capsule,
  tags: [...capsule.keywords],
  score: 1.0,
}));
