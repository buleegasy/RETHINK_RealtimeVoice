import type { DisambiguationDetail, L1DisambiguationResult } from './types';
import { acAutomaton } from './crisis-keywords';
import { evaluateCrisisMatch } from './context-evaluator';

export function deduplicateMatches(
  matches: Array<{ keyword: string; start: number; end: number }>,
): Array<{ keyword: string; start: number; end: number }> {
  if (matches.length <= 1) return matches;

  // 按照覆盖范围从长到短排序
  const sorted = [...matches].sort((a, b) => b.end - b.start - (a.end - a.start));
  const accepted: Array<{ keyword: string; start: number; end: number }> = [];

  for (const candidate of sorted) {
    const isContained = accepted.some(
      (acc) => candidate.start >= acc.start && candidate.end <= acc.end,
    );
    if (!isContained) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}

export function disambiguateCrisis(text: string): L1DisambiguationResult {
  if (!text) return { isCrisis: false, matches: [] };
  const clean = text.trim();
  if (!clean) return { isCrisis: false, matches: [] };

  const rawMatches = acAutomaton.search(clean.toLowerCase());
  if (rawMatches.length === 0) {
    return { isCrisis: false, matches: [] };
  }

  const filteredMatches = deduplicateMatches(rawMatches);
  const details: DisambiguationDetail[] = [];
  let hasRealCrisis = false;

  for (const match of filteredMatches) {
    const evalRes = evaluateCrisisMatch(clean, match);
    details.push({
      keyword: match.keyword,
      start: match.start,
      end: match.end,
      isDisambiguated: evalRes.isDisambiguated,
      reason: evalRes.reason,
    });
    if (!evalRes.isDisambiguated) {
      hasRealCrisis = true;
    }
  }

  return {
    isCrisis: hasRealCrisis,
    matches: details,
  };
}

export function isL1Crisis(text: string): boolean {
  return disambiguateCrisis(text).isCrisis;
}

export function isNegatedCrisis(text: string): boolean {
  const res = disambiguateCrisis(text);
  return res.matches.length > 0 && res.matches.every((m) => m.isDisambiguated);
}
