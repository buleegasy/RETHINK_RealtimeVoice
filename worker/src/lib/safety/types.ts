export interface SafetyCheckOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface DoubleSpeedSafetyResult {
  isCrisis: boolean;
  tier: 'L1' | 'L2' | 'none';
  reason?: string;
  matchedKeywords?: string[];
  disambiguatedKeywords?: string[];
}

export interface DisambiguationDetail {
  keyword: string;
  start: number;
  end: number;
  isDisambiguated: boolean;
  reason?: string;
}

export interface L1DisambiguationResult {
  isCrisis: boolean;
  matches: DisambiguationDetail[];
}

export interface TokenSegment {
  word: string;
  start: number;
  end: number;
}
