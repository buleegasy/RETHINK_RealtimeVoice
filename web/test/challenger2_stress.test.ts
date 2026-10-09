import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { useAdminStore } from '../src/store/adminStore';
import { AudioGraphService } from '../src/lib/audio/audioGraph';
import { DefaultRagProvider } from '../src/lib/pipelines/rag/defaultRagProvider';

describe('Challenger 2 Empirical Stress Test: Component Limits, Audio Lifecycle & RAG Accuracy', () => {
  // =========================================================================
  // 1. React Component Line Count Hard Invariant Stress Test
  // =========================================================================
  describe('1. React Component Line Counts (Hard Invariant <= 300 Lines)', () => {
    function getAllTsxFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...getAllTsxFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    it('所有 components/**/*.tsx 与 App.tsx 代码行数严格小于等于 300 行', () => {
      const componentsDir = path.resolve(__dirname, '../src/components');
      const appFile = path.resolve(__dirname, '../src/App.tsx');

      const tsxFiles = [...getAllTsxFiles(componentsDir), appFile];
      expect(tsxFiles.length).toBeGreaterThanOrEqual(25);

      const violations: { file: string; lineCount: number }[] = [];
      const counts: { file: string; lineCount: number }[] = [];

      for (const file of tsxFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        // 按照物理换行计数 (等同于 wc -l)
        const lineCount = (content.match(/\n/g) || []).length;
        counts.push({ file: path.relative(path.resolve(__dirname, '../..'), file), lineCount });
        if (lineCount > 300) {
          violations.push({ file, lineCount });
        }
      }

      counts.sort((a, b) => b.lineCount - a.lineCount);
      const top5 = counts.slice(0, 5);

      // 验证无任何组件超过 300 行
      expect(violations, `发现超过 300 行的组件: ${JSON.stringify(violations)}`).toEqual([]);

      // 最高行数组件必须 <= 300 (Clean Code 规范组件行数严格控制在 300 行以内)
      expect(top5[0].lineCount).toBeLessThanOrEqual(300);
    });
  });

  // =========================================================================
  // 2. Web Audio Lifecycle & AudioContext Resource Exhaustion Stress Test
  // =========================================================================
  describe('2. Web Audio Lifecycle & Memory Leak Resistance', () => {
    let mockContexts: any[] = [];
    let originalAudioContext: any;

    beforeEach(() => {
      vi.useFakeTimers();
      mockContexts = [];
      originalAudioContext = (window as any).AudioContext;

      (window as any).AudioContext = vi.fn().mockImplementation(() => {
        const ctx: any = {
          state: 'running',
          currentTime: 0,
          sampleRate: 24000,
          destination: {},
          createOscillator: vi.fn().mockReturnValue({
            type: 'sine',
            frequency: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
          }),
          createGain: vi.fn().mockReturnValue({
            gain: {
              setValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
          }),
          createDynamicsCompressor: vi.fn().mockReturnValue({
            threshold: { setValueAtTime: vi.fn() },
            knee: { setValueAtTime: vi.fn() },
            ratio: { setValueAtTime: vi.fn() },
            attack: { setValueAtTime: vi.fn() },
            release: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
          }),
          createAnalyser: vi.fn().mockReturnValue({
            fftSize: 256,
            smoothingTimeConstant: 0.3,
            connect: vi.fn(),
            disconnect: vi.fn(),
            getByteTimeDomainData: vi.fn(),
          }),
          createBiquadFilter: vi.fn().mockReturnValue({
            type: 'highpass',
            frequency: { setValueAtTime: vi.fn() },
            Q: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
          }),
          close: vi.fn().mockImplementation(async () => {
            ctx.state = 'closed';
          }),
        };
        mockContexts.push(ctx);
        return ctx;
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      (window as any).AudioContext = originalAudioContext;
    });

    it('playBuzzer 高频并发调用 50 次，所有 AudioContext 均在 500ms 内安全关闭且无挂死泄露', async () => {
      const store = useAdminStore.getState();

      // 连续并发触发 50 次蜂鸣警报
      for (let i = 0; i < 50; i++) {
        expect(() => store.playBuzzer()).not.toThrow();
      }

      expect(mockContexts.length).toBe(50);

      // 推进时间 500ms 触发 timeout 保底清理
      vi.advanceTimersByTime(550);

      // 验证 100% 的 AudioContext 都执行了 close()，且状态转为 closed
      for (let i = 0; i < mockContexts.length; i++) {
        const ctx = mockContexts[i];
        expect(ctx.close).toHaveBeenCalledTimes(1);
        expect(ctx.state).toBe('closed');
      }
    });

    it('playBuzzer 在 oscillator onended 正常触发时能先行解绑并在超时前安全清理', () => {
      const store = useAdminStore.getState();
      store.playBuzzer();

      expect(mockContexts.length).toBe(1);
      const ctx = mockContexts[0];
      const osc = ctx.createOscillator.mock.results[0].value;
      const gain = ctx.createGain.mock.results[0].value;

      expect(typeof osc.onended).toBe('function');

      // 触发 onended
      osc.onended();
      expect(osc.disconnect).toHaveBeenCalledTimes(1);
      expect(gain.disconnect).toHaveBeenCalledTimes(1);
      expect(ctx.close).toHaveBeenCalledTimes(1);

      // 后续 500ms 超时到达时，由于 cleaned 标记，不应重复执行 close
      vi.advanceTimersByTime(500);
      expect(ctx.close).toHaveBeenCalledTimes(1);
    });

    it('AudioGraphService.stopRecording 应彻底解绑事件回调 (onmessage, onaudioprocess) 并释放全部节点', async () => {
      const service = new AudioGraphService();
      await service.initAudioContext();

      const mockWorklet = {
        port: { onmessage: vi.fn() },
        disconnect: vi.fn(),
      };
      const mockProcessor = {
        onaudioprocess: vi.fn(),
        disconnect: vi.fn(),
      };
      const mockSource = { disconnect: vi.fn() };
      const mockFilter = { disconnect: vi.fn() };
      const mockGain = { disconnect: vi.fn() };
      const mockAnalyser = { disconnect: vi.fn() };

      (service as any).workletNode = mockWorklet;
      (service as any).processorNode = mockProcessor;
      (service as any).sourceNode = mockSource;
      (service as any).highpassFilterNode = mockFilter;
      (service as any).inputGainNode = mockGain;
      (service as any).analyserNode = mockAnalyser;

      // 执行 stopRecording
      service.stopRecording();

      // 回调与引用必须彻底置 null
      expect(mockWorklet.port.onmessage).toBeNull();
      expect(mockWorklet.disconnect).toHaveBeenCalled();
      expect((service as any).workletNode).toBeNull();

      expect(mockProcessor.onaudioprocess).toBeNull();
      expect(mockProcessor.disconnect).toHaveBeenCalled();
      expect((service as any).processorNode).toBeNull();

      expect(mockSource.disconnect).toHaveBeenCalled();
      expect((service as any).sourceNode).toBeNull();

      expect(mockFilter.disconnect).toHaveBeenCalled();
      expect((service as any).highpassFilterNode).toBeNull();

      expect(mockGain.disconnect).toHaveBeenCalled();
      expect((service as any).inputGainNode).toBeNull();

      expect(mockAnalyser.disconnect).toHaveBeenCalled();
      expect((service as any).analyserNode).toBeNull();

      // 连续多次调用 stopRecording 应安全幂等，不抛出异常
      expect(() => service.stopRecording()).not.toThrow();
      expect(() => service.stopRecording()).not.toThrow();
    });
  });

  // =========================================================================
  // 3. RAG Provider Baseline & Search Accuracy Adversarial Test
  // =========================================================================
  describe('3. RAG Provider Baseline & Search Accuracy (0 Baseline & Precision)', () => {
    let ragProvider: DefaultRagProvider;

    beforeEach(() => {
      // 模拟离线降级以精准测试本地回退打分逻辑
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline-fallback-testing'));
      ragProvider = new DefaultRagProvider('/api/voice/knowledge');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('无关生活查询在本地知识库中得分严格为 0，返回空匹配（无误触）', async () => {
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
        const results = await ragProvider.retrieve(query);
        expect(
          results,
          `非相关查询 "${query}" 应当返回空结果，但实际返回了: ${JSON.stringify(results)}`,
        ).toEqual([]);
      }
    });

    it('真实心理困扰查询得分 >= 0.50 且精准归类到对应干预类别', async () => {
      // 学业焦虑类别
      const acadResults = await ragProvider.retrieve(
        '这次月考又考砸了，排名退步好多，模考也考不上大学了',
      );
      expect(acadResults.length).toBeGreaterThan(0);
      expect(acadResults[0].id).toBe('acad_exam_catastrophizing');
      expect(acadResults[0].score).toBeGreaterThanOrEqual(0.5);

      // 同伴人际冷暴力类别
      const peerResults = await ragProvider.retrieve(
        '回到宿舍大家都孤立我不理我，在寝室没有朋友被排挤',
      );
      expect(peerResults.length).toBeGreaterThan(0);
      expect(peerResults[0].id).toBe('peer_group_exclusion');
      expect(peerResults[0].score).toBeGreaterThanOrEqual(0.5);

      // 家庭控制越界类别
      const famResults = await ragProvider.retrieve(
        '我妈天天翻我日记管太多，我爸也是看我手机一点没有自由',
      );
      expect(famResults.length).toBeGreaterThan(0);
      expect(famResults[0].id).toBe('fam_overcontrol_privacy');
      expect(famResults[0].score).toBeGreaterThanOrEqual(0.5);

      // 容貌身材焦虑类别
      const bodyResults = await ragProvider.retrieve('总觉得自己丑脸大很自卑，身材太胖容貌焦虑');
      expect(bodyResults.length).toBeGreaterThan(0);
      expect(bodyResults[0].id).toBe('self_appearance_anxiety');
      expect(bodyResults[0].score).toBeGreaterThanOrEqual(0.5);
    });

    it('formatContext 能针对匹配结果产出结构化引导，空结果产生友好兜底', async () => {
      const acadResults = await ragProvider.retrieve('月考模考排名考砸了');
      const formatted = ragProvider.formatContext(acadResults);
      expect(formatted).toContain('[CBT微干预引导: 学业焦虑');
      expect(formatted).toContain('1. 共情切入');
      expect(formatted).toContain('2. 启发提问');
      expect(formatted).toContain('3. 禁忌雷区');

      const fallbackContext = ragProvider.formatContext([]);
      expect(fallbackContext).toContain('未匹配到特定干预方案');
      expect(fallbackContext).toContain('积极倾听和情绪共鸣');
    });

    it('本地回退知识库中 100% 胶囊切块长度严格满足 <= 50 汉字规范', () => {
      expect(ragProvider.fallbackKnowledge.length).toBeGreaterThanOrEqual(8);
      for (const item of ragProvider.fallbackKnowledge) {
        expect(item.content.length).toBeGreaterThan(0);
        expect(item.content.length).toBeLessThanOrEqual(50);
        expect(item.empathyLead?.length).toBeGreaterThan(10);
        expect(item.socraticPivot?.length).toBeGreaterThan(15);
        expect(item.tabooPhrases?.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('急性躯体化症状与高唤醒查询能够精准召回对应干预胶囊且得分 >= 0.50', async () => {
      // 躯体化过度通气类别
      const somaticResp = await ragProvider.retrieve('喘不上气');
      expect(somaticResp.length).toBeGreaterThan(0);
      expect(somaticResp[0].id).toBe('somatic_hyperventilation');
      expect(somaticResp[0].score).toBeGreaterThanOrEqual(0.5);

      // 躯体化心跳发抖类别
      const tremorResp = await ragProvider.retrieve('心跳好快好慌');
      expect(tremorResp.length).toBeGreaterThan(0);
      expect(tremorResp[0].id).toBe('somatic_tachycardia_tremor');
      expect(tremorResp[0].score).toBeGreaterThanOrEqual(0.5);

      // 学业考砸去灾难化
      const examResp = await ragProvider.retrieve('考试考砸了完蛋了');
      expect(examResp.length).toBeGreaterThan(0);
      expect(examResp[0].id).toBe('acad_exam_catastrophizing');
      expect(examResp[0].score).toBeGreaterThanOrEqual(0.5);
    });
  });
});
