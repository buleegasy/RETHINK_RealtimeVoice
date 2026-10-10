import type { TokenSegment } from './types';

export const zhSegmenter = new Intl.Segmenter('zh-Hans', { granularity: 'word' });

export function segmentText(text: string): TokenSegment[] {
  const segments: TokenSegment[] = [];
  for (const seg of zhSegmenter.segment(text)) {
    segments.push({
      word: seg.segment,
      start: seg.index,
      end: seg.index + seg.segment.length,
    });
  }
  return segments;
}

export function isClauseBoundary(text: string, index: number): boolean {
  const char = text[index];
  if (/[,，.。!！?？;；\n~～]/.test(char)) return true;
  if (/[\s\u3000]/.test(char)) {
    // 若空白符两侧存在中文字符，则为流式 ASR 中文短语停顿或子句分界
    const prev = index > 0 ? text[index - 1] : '';
    const next = index < text.length - 1 ? text[index + 1] : '';
    if (/[\u4e00-\u9fa5]/.test(prev) || /[\u4e00-\u9fa5]/.test(next)) {
      return true;
    }
  }
  return false;
}

export function extractSurroundingClause(
  text: string,
  start: number,
  end: number,
): { clause: string; start: number; end: number } {
  let clauseStart = start;
  while (clauseStart > 0 && !isClauseBoundary(text, clauseStart - 1)) {
    clauseStart--;
  }
  let clauseEnd = end;
  while (clauseEnd < text.length && !isClauseBoundary(text, clauseEnd)) {
    clauseEnd++;
  }
  return {
    clause: text.slice(clauseStart, clauseEnd),
    start: clauseStart,
    end: clauseEnd,
  };
}
