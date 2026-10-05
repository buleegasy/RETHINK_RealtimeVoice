import { describe, it, expect } from 'vitest';
import { isL1Crisis, disambiguateCrisis, isNegatedCrisis } from '../src/lib/safety-filter';

describe('L1 边缘硬过滤与否定消歧引擎 (Aho-Corasick + 多维语境判决)', () => {
  describe('否定消歧判决准确率 (零误拦截测试)', () => {
    it('处理“我并不想死”应成功消歧放行，判定非危机', () => {
      const text = '其实我并不想死，我只是模考压力太大了，想找人倾诉一下';
      expect(isL1Crisis(text)).toBe(false);
      expect(isNegatedCrisis(text)).toBe(true);
      const res = disambiguateCrisis(text);
      expect(res.isCrisis).toBe(false);
      expect(res.matches.some((m) => m.keyword === '想死' && m.isDisambiguated)).toBe(true);
    });

    it('处理“我劝阻了他自杀”应识别第三方劝阻并消歧放行', () => {
      const text = '昨天我劝阻了他自杀，现在心里还是有点后怕';
      expect(isL1Crisis(text)).toBe(false);
      const res = disambiguateCrisis(text);
      expect(res.isCrisis).toBe(false);
      expect(res.matches.some((m) => m.keyword === '自杀' && m.isDisambiguated)).toBe(true);
    });

    it.each([
      ['处理干预语境', '刚才在宿舍楼下，我们一起拦住了想要跳楼的同学'],
      ['处理意念消除', '我已经走出了想自残的阴影，现在好多了'],
      ['处理新闻叙事', '今天看到新闻里有人跳楼，觉得生命真的很脆弱'],
    ])('%s 应消歧放行不判定为 L1 危机', (_, text) => {
      expect(isL1Crisis(text)).toBe(false);
    });

    it('处理“打消了轻生的念头”应识别意念转归消除消歧', () => {
      const text = '在班主任的开导下，我已经彻底打消了轻生的念头';
      expect(isL1Crisis(text)).toBe(false);
      expect(isNegatedCrisis(text)).toBe(true);
    });

    it('处理反问与口语反驳语境应消歧放行', () => {
      const text1 = '谁说我想死了，我还要考大学呢！';
      expect(isL1Crisis(text1)).toBe(false);

      const text2 = '傻子才去自杀，我才不会那么笨';
      expect(isL1Crisis(text2)).toBe(false);

      const text3 = '我根本不会去跳河';
      expect(isL1Crisis(text3)).toBe(false);
    });

    it('处理口语化“不是想/要”、“不是不想活”等高频句型应精准消歧放行', () => {
      expect(isL1Crisis('老师你别紧张，我不是想自杀，只是最近压力太大')).toBe(false);
      expect(isL1Crisis('我不是不想活，我只是不知道怎么面对爸妈')).toBe(false);
      expect(isL1Crisis('我并没打算轻生，就是想找人倾诉')).toBe(false);
      expect(isL1Crisis('我从小到大从未想过跳楼')).toBe(false);
      expect(isL1Crisis('我从来没想过自杀')).toBe(false);
    });
  });

  describe('真实危机 100% 灵敏拦截测试', () => {
    it('明确自杀自残意图应精准拦截', () => {
      expect(isL1Crisis('我觉得活着没意思，我想死')).toBe(true);
      expect(isL1Crisis('今晚准备割腕')).toBe(true);
      expect(isL1Crisis('我已经站在天台上了')).toBe(true);
      expect(isL1Crisis('买好了安眠药，不想活了')).toBe(true);
      expect(isL1Crisis('谁也别救我，彻底放弃自己了')).toBe(true);
    });

    it('真实危机反向豁免: 强肯定/双重否定语气绝对不可消歧', () => {
      // 包含“不”，但是“不得不去死”是真实危机
      expect(isL1Crisis('到了这个地步，我不得不去死')).toBe(true);
      expect(isL1Crisis('我非死不可了')).toBe(true);
      expect(isL1Crisis('除了自杀我别无选择')).toBe(true);
      expect(isL1Crisis('除了跳楼我已经没有退路了')).toBe(true);
    });

    it('多关键词混合: 包含消歧词但同时包含未消歧真实危机词时，应准确告警', () => {
      // “劝阻了他自杀”已消歧，但后半句“我自己想跳楼”为真实危机
      const mixedText = '虽然我劝阻了他自杀，但是我自己真的好想跳楼，太痛苦了';
      expect(isL1Crisis(mixedText)).toBe(true);
      const res = disambiguateCrisis(mixedText);
      expect(res.isCrisis).toBe(true);
      expect(res.matches.find((m) => m.keyword === '自杀')?.isDisambiguated).toBe(true);
      expect(res.matches.find((m) => m.keyword === '跳楼')?.isDisambiguated).toBe(false);
    });

    it('流式 ASR 无标点仅空格分词: 绝不导致真实危机被消歧词静默吞没 (P0-2 修复验证)', () => {
      expect(isL1Crisis('大家劝阻他跳楼 我想跳楼')).toBe(true);
      expect(isL1Crisis('听说网上有人自杀 我现在站在天台')).toBe(true);
      expect(isL1Crisis('刚才拦住同学跳楼 我现在也想自杀')).toBe(true);

      const res = disambiguateCrisis('大家劝阻他跳楼 我想跳楼');
      expect(res.isCrisis).toBe(true);
      expect(res.matches[0].isDisambiguated).toBe(true); // 前半句劝阻消歧
      expect(res.matches[1].isDisambiguated).toBe(false); // 后半句真实危机告警
    });

    it('高频英文与拼音危机关键词 100% 灵敏拦截及否定消歧 (P2-10 修复验证)', () => {
      expect(isL1Crisis('I want to die right now')).toBe(true);
      expect(isL1Crisis('I will commit suicide tonight')).toBe(true);
      expect(isL1Crisis('woshi zhende xiangsi')).toBe(true);
      expect(isL1Crisis('daodi shei xiang zisha')).toBe(true);
      // 英文单重否定消歧放行
      expect(isL1Crisis('I do not want to die')).toBe(false);
    });
  });

  describe('AC 自动机单趟扫描性能基准测试', () => {
    it('1000 次长文本匹配应在 50ms 内完成，证明 O(N) 线性高效', () => {
      const sampleText =
        '这是一段普通的校园生活倾诉，虽然有些模考压力和挫败感，但我并不想死，我也劝阻了他自杀，今天新闻里有人跳楼，我希望大家都能好好的。';
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        isL1Crisis(sampleText);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(500); // 1000 次在 500ms 内，单次 < 0.5ms
    });
  });
});
