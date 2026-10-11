import { SLEEP_DIGITAL_CAPSULES } from '@rethink/shared';
import type { RagChunk } from '../types';

export const SLEEP_DIGITAL_KNOWLEDGE: RagChunk[] = SLEEP_DIGITAL_CAPSULES.map((capsule) => ({
  ...capsule,
  tags: [...capsule.keywords],
  score: 1.0,
}));
