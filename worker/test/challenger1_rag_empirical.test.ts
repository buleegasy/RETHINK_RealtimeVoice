import { describe, it, expect } from 'vitest';
import { BgeRetriever, CBT_CAPSULES } from '../src/lib/rag';

describe('Challenger 1 Empirical Verification: Worker BM25 Retrieval & Adversarial Stress', () => {
  const retriever = new BgeRetriever();

  // ---------------------------------------------------------------------------
  // 1. Mandatory Target Distress Queries (Prompt Section 1)
  // ---------------------------------------------------------------------------
  describe('1. 核心目标心理困扰查询高精度召回 (Score >= 0.50)', () => {
    it('查询 "喘不上气" 必须精准召回 somatic_hyperventilation (score >= 0.50)', async () => {
      const results = await retriever.search('喘不上气', { topK: 3 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].capsule.id).toBe('somatic_hyperventilation');
      expect(results[0].score).toBeGreaterThanOrEqual(0.5);
      expect(results[0].capsule.title).toContain('过度通气与喘不上气');

      const hint = await retriever.getStrategyHint('喘不上气');
      expect(hint.status).toBe('matched');
      expect(hint.category).toBe('somatic');
    });

    it('查询 "心跳好快好慌" 必须精准召回 somatic_tachycardia_tremor (score >= 0.50)', async () => {
      const results = await retriever.search('心跳好快好慌', { topK: 3 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].capsule.id).toBe('somatic_tachycardia_tremor');
      expect(results[0].score).toBeGreaterThanOrEqual(0.5);
      expect(results[0].capsule.title).toContain('心跳好快与心慌发抖');

      const hint = await retriever.getStrategyHint('心跳好快好慌');
      expect(hint.status).toBe('matched');
      expect(hint.category).toBe('somatic');
    });

    it('查询 "考试考砸了完蛋了" 必须精准召回 acad_exam_catastrophizing (score >= 0.50)', async () => {
      const results = await retriever.search('考试考砸了完蛋了', { topK: 3 });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].capsule.id).toBe('acad_exam_catastrophizing');
      expect(results[0].score).toBeGreaterThanOrEqual(0.5);
      expect(results[0].capsule.title).toContain('去灾难化');

      const hint = await retriever.getStrategyHint('考试考砸了完蛋了');
      expect(hint.status).toBe('matched');
      expect(hint.category).toBe('academic');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. 10 Adversarial Negative Queries (Prompt Section 2)
  // ---------------------------------------------------------------------------
  describe('2. 10 项无关生活查询对抗测试 (Zero False Positives: score < 0.50 & return [])', () => {
    const irrelevantQueries = [
      '今天食堂的红烧鸭子真好吃',
      '去操场打篮球还是去游泳',
      '明天天气预报有小雨，记得带伞',
      '电脑显卡驱动怎么升级最新版',
      '微积分导数与拉格朗日中值定理',
      '推荐一部好看的科幻悬疑电影',
      '中午去买杯珍珠奶茶喝',
      '',
      '   ',
      'abcdefg12345',
    ];

    for (const query of irrelevantQueries) {
      it(`无关查询 "${query || '(empty)'}" 严格返回空结果且 score < 0.50`, async () => {
        const results = await retriever.search(query, { minThreshold: 0.5 });
        expect(
          results,
          `无关查询 "${query}" 应当返回空数组，但实际返回了: ${JSON.stringify(results.map((r) => ({ id: r.capsule.id, score: r.score })))}`,
        ).toEqual([]);

        // Raw scores for all capsules must also be strictly below 0.50 (if query not empty)
        if (query.trim().length > 0) {
          for (const capsule of CBT_CAPSULES) {
            const rawScore = retriever.calculateBm25Score(query, capsule);
            expect(
              rawScore,
              `Capsule ${capsule.id} raw score for "${query}" is ${rawScore}, should be < 0.50`,
            ).toBeLessThan(0.5);
          }
        }

        const hint = await retriever.getStrategyHint(query, { minThreshold: 0.5 });
        expect(hint.status).toBe('no_relevant_context');
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Full 16-Capsule Invariant & Precision Verification
  // ---------------------------------------------------------------------------
  describe('3. 全量 16 条 CBT 胶囊硬性长度约束与召回完整度', () => {
    it('100% 胶囊 content.length 严格 <= 50 汉字且 > 0', () => {
      expect(CBT_CAPSULES.length).toBe(16);
      for (const capsule of CBT_CAPSULES) {
        expect(capsule.content.length).toBeGreaterThan(0);
        expect(
          capsule.content.length,
          `Capsule ${capsule.id} length exceeds 50: ${capsule.content.length}`,
        ).toBeLessThanOrEqual(50);
        expect(capsule.empathyLead.length).toBeGreaterThan(10);
        expect(capsule.socraticPivot.length).toBeGreaterThan(15);
        expect(capsule.tabooPhrases.length).toBeGreaterThanOrEqual(3);
      }
    });

    const capsuleTriggers: Record<string, string> = {
      somatic_hyperventilation: '大口喘气胸闷憋气过度通气',
      somatic_tachycardia_tremor: '手抖身体发抖心跳过速',
      somatic_muscle_freeze: '浑身僵硬身体发僵动不了肩膀僵硬',
      somatic_sensory_grounding: '脑袋发蒙不真实感大脑一片空白解离',
      emotion_acute_panic: '突然好害怕快疯了撑不住了感觉要死了',
      emotion_guilt_abyss: '都是我的错我真没用自责内疚恨死自己了',
      emotion_anger_outburst: '想摔东西气疯了暴怒凭什么忍不住想吵架',
      emotion_mock_exam_stress: '模考应激考前焦虑害怕考试模拟考压力',
      acad_exam_catastrophizing: '月考成绩差模拟考考砸了考不上大学',
      acad_procrastination_paralysis: '不想学学不进去作业太多烦躁做不完',
      peer_group_exclusion: '宿舍寝室大家都不理我被排挤孤立了',
      peer_people_pleasing: '不敢拒绝怕别人生气讨好迎合别人',
      fam_overcontrol_privacy: '翻日记看我手机管太多没有自由监控我',
      fam_comparison_worthlessness: '别人家孩子看看人家嫌我丢人父母瞧不起',
      self_appearance_anxiety: '觉得自己丑长相自卑脸大身材太胖容貌焦虑',
      self_imposter_syndrome: '我不配全是运气假装优秀迟早露馅',
    };

    for (const [id, query] of Object.entries(capsuleTriggers)) {
      it(`Capsule "${id}" 能够被典型场景词 "${query}" 准确召回 (score >= 0.50)`, async () => {
        const results = await retriever.search(query, { topK: 1 });
        expect(results.length).toBe(1);
        expect(results[0].capsule.id).toBe(id);
        expect(results[0].score).toBeGreaterThanOrEqual(0.5);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Adversarial Edge Cases & Boundary Stress Testing
  // ---------------------------------------------------------------------------
  describe('4. 对抗边界与极端输入压力测试 (Edge Cases & Stress)', () => {
    it('超长文本输入 (1000 字符无意义重复) 不引发崩溃或错误召回', async () => {
      const longQuery = '今天天气不错'.repeat(166);
      const results = await retriever.search(longQuery, { minThreshold: 0.5 });
      expect(results).toEqual([]);
    });

    it('纯标点符号与特殊字符输入安全返回空', async () => {
      const specialQuery = '!@#$%^&*()_+~`|}{[]:;?><,./。，、？！…—～';
      const results = await retriever.search(specialQuery, { minThreshold: 0.5 });
      expect(results).toEqual([]);
    });

    it('纯 Emoji 输入安全返回空', async () => {
      const emojiQuery = '😭💔😱😡🤦‍♂️🤷‍♀️🤯💀';
      const results = await retriever.search(emojiQuery, { minThreshold: 0.5 });
      expect(results).toEqual([]);
    });

    it('包含单字助词如 "的"、"了"、"在" 的无关自然语言不会产生误触', async () => {
      const casualQueries = [
        '我在家里的沙发上看电视了',
        '这里的风景真的很好看的',
        '下个礼拜去哪里玩比较好呢',
      ];
      for (const q of casualQueries) {
        const results = await retriever.search(q, { minThreshold: 0.5 });
        expect(results).toEqual([]);
      }
    });
  });
});
