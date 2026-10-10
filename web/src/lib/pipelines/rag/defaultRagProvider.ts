import type { IRagProvider, RagChunk, RagQueryOptions } from './types';
import { apiFetch } from '../../api';
import { FALLBACK_KNOWLEDGE } from './fallbackKnowledge';

export class DefaultRagProvider implements IRagProvider {
  public readonly name = 'DefaultRagProvider';

  private readonly endpoint: string;
  public readonly fallbackKnowledge: RagChunk[] = FALLBACK_KNOWLEDGE;

  constructor(endpoint: string = '/api/voice/knowledge') {
    this.endpoint = endpoint;
  }

  public async retrieve(query: string, options?: RagQueryOptions): Promise<RagChunk[]> {
    const topK = options?.topK ?? 1;
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    try {
      const res = await apiFetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery, topK }),
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data.chunks) && data.chunks.length > 0) {
          return data.chunks;
        }
      }
    } catch (_err) {
      // 离线或服务端不可用时降级至本地知识库
    }

    const qLower = cleanQuery.toLowerCase();
    return this.fallbackKnowledge
      .map((item) => {
        let score = 0;
        if (
          qLower.includes(item.title.toLowerCase()) ||
          item.title.toLowerCase().includes(qLower)
        ) {
          score += 0.5;
        }
        const keywords = item.keywords || item.tags || [];
        for (const kw of keywords) {
          if (qLower.includes(kw.toLowerCase())) {
            score += 0.35;
          }
        }
        if (item.content.toLowerCase().includes(qLower)) {
          score += 0.15;
        }
        return { ...item, score: Math.min(1.0, score) };
      })
      .filter((item) => item.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  public formatContext(chunks: RagChunk[]): string {
    if (!chunks || chunks.length === 0) {
      return '未匹配到特定干预方案。请保持同龄好友平视视角，以积极倾听和情绪共鸣为主，避免讲大道理或随意评价。每次回复必须在1-2句话以内。';
    }
    const primary = chunks[0];
    const parts: string[] = [`[CBT微干预引导: ${primary.title}]`];
    if (primary.empathyLead) {
      parts.push(`1. 共情切入: ${primary.empathyLead}`);
    }
    if (primary.socraticPivot) {
      parts.push(`2. 启发提问: ${primary.socraticPivot}`);
    }
    if (primary.tabooPhrases && primary.tabooPhrases.length > 0) {
      parts.push(
        `3. 禁忌雷区: 严禁说“${primary.tabooPhrases.slice(0, 3).join('、')}”。请用同龄好友口吻在1-2句话内温和回应，严禁超过两句话。`,
      );
    }
    return parts.join('\n');
  }
}
