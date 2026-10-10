import { ACADEMIC_RELATIONAL_CAPSULES } from '@rethink/shared';
import type { RagChunk } from '../types';

export const ACADEMIC_RELATIONAL_KNOWLEDGE: RagChunk[] = ACADEMIC_RELATIONAL_CAPSULES.map(
  (capsule) => ({
    ...capsule,
    tags: [...capsule.keywords],
    score: 1.0,
  }),
);
