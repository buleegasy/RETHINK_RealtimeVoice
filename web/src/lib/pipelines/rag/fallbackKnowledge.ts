import type { RagChunk } from './types';
import { SOMATIC_EMOTION_KNOWLEDGE } from './knowledge/somaticEmotion';
import { ACADEMIC_RELATIONAL_KNOWLEDGE } from './knowledge/academicRelational';

export const FALLBACK_KNOWLEDGE: RagChunk[] = [
  ...SOMATIC_EMOTION_KNOWLEDGE,
  ...ACADEMIC_RELATIONAL_KNOWLEDGE,
];
