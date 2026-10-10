import type { EvaluationResult } from '../minimax-evaluator';
import type { SituationalMemory } from '../../types';

export interface FlashOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ShadowReasoningContext {
  history: Array<{ role: string; content: string }>;
  cbtHints?: string[];
  userName?: string;
  currentStage?: string;
  situationalMemory?: SituationalMemory | null;
}

export interface ShadowReasoningResult {
  cognitiveHint: string;
  extractedName?: string;
  coreConcern?: string;
}

export interface StructuredSessionReport extends EvaluationResult {
  actionItems?: string[];
  initialEmotion?: string;
  finalEmotion?: string;
  deltaNotes?: string;
  homeworkAction?: string;
  keyTakeaways?: string[];
}
