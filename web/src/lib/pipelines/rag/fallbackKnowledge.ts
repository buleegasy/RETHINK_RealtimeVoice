import type { RagChunk } from './types';
import { SOMATIC_EMOTION_KNOWLEDGE } from './knowledge/somaticEmotion';
import { ACADEMIC_RELATIONAL_KNOWLEDGE } from './knowledge/academicRelational';
import { SLEEP_DIGITAL_KNOWLEDGE } from './knowledge/sleepDigital';
import { SOCIAL_GROWTH_KNOWLEDGE } from './knowledge/socialGrowth';

export const FALLBACK_KNOWLEDGE: RagChunk[] = [
  ...SOMATIC_EMOTION_KNOWLEDGE,
  ...ACADEMIC_RELATIONAL_KNOWLEDGE,
  ...SLEEP_DIGITAL_KNOWLEDGE,
  ...SOCIAL_GROWTH_KNOWLEDGE,
];
