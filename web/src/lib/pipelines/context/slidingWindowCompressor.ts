import type { DialogueTurn } from '../../../types';
import type { IContextManager, ContextCompressionOptions, CompressionResult } from './types';

export class SlidingWindowCompressor implements IContextManager {
  public readonly name = 'SlidingWindowCompressor';

  private readonly defaultBudget: number;
  private readonly defaultKeepLastTurns: number;

  constructor(defaultBudget: number = 2048, defaultKeepLastTurns: number = 6) {
    this.defaultBudget = defaultBudget;
    this.defaultKeepLastTurns = defaultKeepLastTurns;
  }

  public estimateTokens(input: string | DialogueTurn[]): number {
    if (typeof input === 'string') {
      return Math.ceil(input.length * 0.7);
    }
    const combined = input.map((t) => `${t.role}: ${t.content}`).join('\n');
    return Math.ceil(combined.length * 0.7);
  }

  public async compress(
    turns: DialogueTurn[],
    options?: ContextCompressionOptions,
  ): Promise<CompressionResult> {
    const budget = options?.tokenBudget ?? this.defaultBudget;
    const keepLast = options?.keepLastTurns ?? this.defaultKeepLastTurns;
    const preserveFirst = options?.preserveFirstTurn ?? true;

    const initialTokens = this.estimateTokens(turns);

    if (initialTokens <= budget || turns.length <= keepLast + (preserveFirst ? 1 : 0)) {
      return {
        compressedTurns: [...turns],
        hasCompressed: false,
        originalCount: turns.length,
        compressedCount: turns.length,
        estimatedTokens: initialTokens,
      };
    }

    const firstTurn = preserveFirst && turns.length > 0 ? turns[0] : null;
    const startIndex = firstTurn ? 1 : 0;
    const endIndex = Math.max(startIndex, turns.length - keepLast);

    const turnsToCompress = turns.slice(startIndex, endIndex);
    const recentTurns = turns.slice(endIndex);

    const summaryBlock = this.generateDeterministicSummary(turnsToCompress);

    const summaryTurn: DialogueTurn = {
      id: `compressed_summary_${Date.now()}`,
      role: 'system',
      content: `[前期倾诉要点摘要]\n${summaryBlock}`,
      timestamp: turnsToCompress.at(-1)?.timestamp || Date.now(),
    };

    const finalTurns: DialogueTurn[] = [];
    if (firstTurn) finalTurns.push(firstTurn);
    finalTurns.push(summaryTurn);
    finalTurns.push(...recentTurns);

    return {
      compressedTurns: finalTurns,
      hasCompressed: true,
      originalCount: turns.length,
      compressedCount: finalTurns.length,
      estimatedTokens: this.estimateTokens(finalTurns),
      summaryBlock,
    };
  }

  private generateDeterministicSummary(turns: DialogueTurn[]): string {
    const userUtterances = turns
      .filter((t) => t.role === 'user')
      .map((t) => t.content.trim())
      .filter(Boolean);

    const assistantUtterances = turns
      .filter((t) => t.role === 'assistant')
      .map((t) => t.content.trim())
      .filter(Boolean);

    const keyUserThemes = userUtterances
      .slice(0, 3)
      .map((u, i) => `· 核心困扰${i + 1}: ${u.slice(0, 35)}...`);
    const keyCounselingPoints = assistantUtterances
      .slice(0, 2)
      .map((a, i) => `· 干预切入${i + 1}: ${a.slice(0, 30)}...`);

    return [
      `包含前序 ${turns.length} 回合的倾诉沉淀：`,
      ...keyUserThemes,
      ...keyCounselingPoints,
      `（状态：已完成情绪共鸣，当前正就上述议题深入探讨）`,
    ].join('\n');
  }
}
