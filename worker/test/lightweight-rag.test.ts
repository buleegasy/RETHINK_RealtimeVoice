import { describe, it, expect } from 'vitest';
import { BgeRetriever, CBT_CAPSULES } from '../src/lib/rag';

describe('轻量化 RAG 检索器与 CBT 策略胶囊 (Lightweight BGE RAG)', () => {
  it('所有干预胶囊切块长度应严格满足 <= 50 汉字规范', () => {
    expect(CBT_CAPSULES.length).toBeGreaterThanOrEqual(8);

    for (const capsule of CBT_CAPSULES) {
      const charCount = capsule.content.length;
      expect(charCount).toBeGreaterThan(0);
      expect(charCount).toBeLessThanOrEqual(50);

      expect(capsule.empathyLead.length).toBeGreaterThan(10);
      expect(capsule.socraticPivot.length).toBeGreaterThan(15);
      expect(capsule.tabooPhrases.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('向量点积计算应准确且支持归一化余弦相似度', () => {
    const retriever = new BgeRetriever();
    const vecA = [0.6, 0.8];
    const vecB = [0.6, 0.8];
    const vecC = [-0.8, 0.6];

    const scoreIdentical = retriever.dotProduct(vecA, vecB);
    expect(scoreIdentical).toBeCloseTo(1.0, 4);

    const scoreOrthogonal = retriever.dotProduct(vecA, vecC);
    expect(scoreOrthogonal).toBeCloseTo(0.0, 4);
  });

  it('严格执行 0.50 相似度阈值，过滤完全无关的问题', async () => {
    const retriever = new BgeRetriever();
    const irrelevantQuery = '今天北京天气怎么样吃什么菜好';

    const results = await retriever.search(irrelevantQuery, { minThreshold: 0.5 });
    expect(results.length).toBe(0);

    const hint = await retriever.getStrategyHint(irrelevantQuery, { minThreshold: 0.5 });
    expect(hint.status).toBe('no_relevant_context');
    expect(hint.conciseDirective).toContain('未检索到特定CBT微干预胶囊');
  });

  it('中学生高频学业挫折场景应精准召回学业去灾难化胶囊', async () => {
    const retriever = new BgeRetriever();
    const results = await retriever.search('这次模拟考数学考砸了排名掉了考不上大学了', { topK: 1 });

    expect(results.length).toBe(1);
    expect(results[0].capsule.id).toBe('acad_exam_catastrophizing');
    expect(results[0].score).toBeGreaterThanOrEqual(0.5);

    const hint = await retriever.getStrategyHint('这次模拟考数学考砸了排名掉了考不上大学了');
    expect(hint.status).toBe('matched');
    expect(hint.topic).toContain('学业焦虑');
    expect(hint.conciseDirective).toContain('共情切入');
    expect(hint.conciseDirective).toContain('启发提问');
  });

  it('中学生宿舍孤立与冷暴力场景应精准召回同伴边界胶囊', async () => {
    const retriever = new BgeRetriever();
    const results = await retriever.search('宿舍寝室大家都不理我被排挤孤立了没有朋友', { topK: 1 });

    expect(results.length).toBe(1);
    expect(results[0].capsule.id).toBe('peer_group_exclusion');
    expect(results[0].score).toBeGreaterThanOrEqual(0.5);
  });

  it('父母私查手机与日记场景应精准召回家庭隐私越界沟通胶囊', async () => {
    const retriever = new BgeRetriever();
    const results = await retriever.search('我妈趁我上学翻看我手机和日记管太多完全没有隐私自由', {
      topK: 1,
    });

    expect(results.length).toBe(1);
    expect(results[0].capsule.id).toBe('fam_overcontrol_privacy');
    expect(results[0].score).toBeGreaterThanOrEqual(0.5);
  });

  it('中学生急性过度通气与喘不上气场景应精准召回躯体化箱式呼吸胶囊', async () => {
    const retriever = new BgeRetriever();
    const results = await retriever.search('喘不上气', { topK: 1 });

    expect(results.length).toBe(1);
    expect(results[0].capsule.id).toBe('somatic_hyperventilation');
    expect(results[0].score).toBeGreaterThanOrEqual(0.5);
  });

  it('中学生心跳好快好慌高唤醒场景应精准召回感官着陆缓解胶囊', async () => {
    const retriever = new BgeRetriever();
    const results = await retriever.search('心跳好快好慌', { topK: 1 });

    expect(results.length).toBe(1);
    expect(results[0].capsule.id).toBe('somatic_tachycardia_tremor');
    expect(results[0].score).toBeGreaterThanOrEqual(0.5);
  });

  it('中学生考试考砸了完蛋了应精准召回学业去灾难化胶囊', async () => {
    const retriever = new BgeRetriever();
    const results = await retriever.search('考试考砸了完蛋了', { topK: 1 });

    expect(results.length).toBe(1);
    expect(results[0].capsule.id).toBe('acad_exam_catastrophizing');
    expect(results[0].score).toBeGreaterThanOrEqual(0.5);
  });
});
