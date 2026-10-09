export type CapsuleCategory = 'somatic' | 'emotion' | 'academic' | 'peer' | 'family' | 'self_worth';

export interface CbtCapsule {
  id: string;
  category: CapsuleCategory;
  title: string;
  keywords: string[];
  content: string;
  empathyLead: string;
  socraticPivot: string;
  tabooPhrases: string[];
  embedding?: number[];
}

export interface RagSearchResult {
  capsule: CbtCapsule;
  score: number;
  matchedBy: 'vector' | 'keyword_bm25';
}

export interface RagSearchOptions {
  topK?: number;
  minThreshold?: number;
  categoryFilter?: CapsuleCategory;
}

export interface StrategyHint {
  status: 'matched' | 'no_relevant_context';
  category?: CapsuleCategory;
  topic?: string;
  empathyGuideline?: string;
  socraticPivot?: string;
  tabooReminder?: string;
  conciseDirective: string;
}
