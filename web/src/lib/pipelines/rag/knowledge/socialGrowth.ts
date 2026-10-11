import { SOCIAL_GROWTH_CAPSULES } from '@rethink/shared';
import type { RagChunk } from '../types';

export const SOCIAL_GROWTH_KNOWLEDGE: RagChunk[] = SOCIAL_GROWTH_CAPSULES.map((capsule) => ({
  ...capsule,
  tags: [...capsule.keywords],
  score: 1.0,
}));
