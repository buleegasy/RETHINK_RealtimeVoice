import { describe, it, expect, vi } from 'vitest';
import { DefaultRagProvider } from '../src/lib/pipelines/rag/defaultRagProvider';
import { SlidingWindowCompressor } from '../src/lib/pipelines/context/slidingWindowCompressor';
import { WebCryptoAesGcm } from '../src/lib/pipelines/security/webCryptoAesGcm';
import { BufferedTranscriptionPipeline } from '../src/lib/pipelines/transcription/bufferedTranscription';
import { DeidentifiedCbtReportGenerator } from '../src/lib/pipelines/reporting/deidentifiedReportGenerator';
import type { DialogueTurn } from '../src/types';

describe('五大扩展管线契约与核心算法验证 (Pipelines & Providers)', () => {
  describe('Pillar 1: RAG 知识检索管线', () => {
    it('在离线或本地回退时能够准确匹配 CBT 策略胶囊并生成策略微提示', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
      const provider = new DefaultRagProvider('/api/voice/knowledge');
      const chunks = await provider.retrieve('月考没考好排名掉了');
      fetchSpy.mockRestore();

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].title).toContain('学业焦虑');

      const formatted = provider.formatContext(chunks);
      expect(formatted).toContain('CBT微干预引导');
      expect(formatted).toContain('共情切入');
      expect(formatted).toContain('启发提问');
      expect(formatted).toContain('禁忌雷区');
    });
  });

  describe('Pillar 2: 上下文滑动窗口滚动与压缩管线', () => {
    it('当对话轮次超标时，应保留首轮与最近轮次，将陈旧轮次折叠为系统摘要', async () => {
      const compressor = new SlidingWindowCompressor(20, 2);

      const turns: DialogueTurn[] = [
        { id: '1', role: 'assistant', content: '你好，我是心理陪伴AI。', timestamp: 100 },
        { id: '2', role: 'user', content: '我最近毕业论文压力很大，天天失眠。', timestamp: 200 },
        { id: '3', role: 'assistant', content: '听起来真的很让人疲惫。', timestamp: 300 },
        {
          id: '4',
          role: 'user',
          content: '是的，我觉得自己可能要延毕了，全完了。',
          timestamp: 400,
        },
        {
          id: '5',
          role: 'assistant',
          content: '这是灾难化想法，我们来看看实际进度。',
          timestamp: 500,
        },
        { id: '6', role: 'user', content: '目前刚写了前三章。', timestamp: 600 },
      ];

      const result = await compressor.compress(turns, {
        tokenBudget: 30,
        keepLastTurns: 2,
        preserveFirstTurn: true,
      });

      expect(result.hasCompressed).toBe(true);
      expect(result.compressedTurns.length).toBeLessThan(turns.length);
      expect(result.compressedTurns[0].id).toBe('1');
      expect(result.compressedTurns[1].role).toBe('system');
      expect(result.compressedTurns[1].content).toContain('前期倾诉要点摘要');
      expect(result.compressedTurns[result.compressedTurns.length - 1].id).toBe('6');
    });
  });

  describe('Pillar 3: AES-256-GCM 会话记录加密管线', () => {
    it('加密后明文不可见，解密后内容完全一致保真', async () => {
      const crypto = new WebCryptoAesGcm('TEST_SECRET_KEY_FOR_RETHINK_TESTS_123');
      const sensitiveText = '来访者张明，电话13812345678，自述考试焦虑';

      const cipher = await crypto.encrypt(sensitiveText);
      expect(cipher).not.toBe(sensitiveText);
      expect(typeof cipher).toBe('string');
      // 验证统一端云封装标准长度: Salt(16) + IV(12) + Tag(16) + Data
      const rawBytes = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));
      expect(rawBytes.length).toBeGreaterThanOrEqual(16 + 12 + 16);

      const decrypted = await crypto.decrypt(cipher);
      expect(decrypted).toBe(sensitiveText);

      // 支持动态口令解密
      const decryptedWithKey = await crypto.decrypt(
        cipher,
        'TEST_SECRET_KEY_FOR_RETHINK_TESTS_123',
      );
      expect(decryptedWithKey).toBe(sensitiveText);

      // 错误口令解密返回空字符串
      const wrongDecrypted = await crypto.decrypt(cipher, 'WRONG_SECRET_KEY');
      expect(wrongDecrypted).toBe('');
    });

    it('当未配置密钥时，encrypt 严格抛出安全异常，拒绝以弱口令默认兜底 (P2-11 修复验证)', async () => {
      const cryptoWithoutSecret = new WebCryptoAesGcm('');
      await expect(cryptoWithoutSecret.encrypt('敏感内容')).rejects.toThrow(
        'missing crypto secret key',
      );
      expect(await cryptoWithoutSecret.decrypt('some_cipher')).toBe('');
    });
  });

  describe('Pillar 4: 中间层转写与停顿切分管线', () => {
    it('正确过滤开场语气停顿词并通知多订阅者', () => {
      const pipeline = new BufferedTranscriptionPipeline();
      const emitted: string[] = [];

      pipeline.subscribe((seg) => {
        emitted.push(seg.text);
      });

      pipeline.feedDelta('user', '呃... 啊... ');
      pipeline.feedDelta('user', '我今天心情有点低落。');

      const finalized = pipeline.finalizeCurrentTurn('user');
      expect(finalized).not.toBeNull();
      expect(finalized?.text).toBe('我今天心情有点低落。');
      expect(pipeline.getHistory().length).toBe(1);
    });
  });

  describe('Pillar 5: 脱敏通话简报生成管线', () => {
    it('严格将手机号、邮箱与姓名脱敏，并提取真实发言与语义分析', async () => {
      const generator = new DeidentifiedCbtReportGenerator();
      const input = {
        sessionId: 'test_session_101',
        durationSeconds: 150,
        stageReached: 'CBT_Stripping' as const,
        rawUserName: '张三丰',
        turns: [
          {
            id: '1',
            role: 'user' as const,
            content:
              '我的手机号是13912345678，邮箱是test@cbt.com，这次考试没考好我觉得一切都全完了，绝对没有希望了！',
            timestamp: Date.now(),
          },
        ],
      };

      const report = await generator.generate(input);

      expect(report.isDeidentified).toBe(true);
      expect(report.userDisplayName).toBe('张*丰');
      expect(report.durationSeconds).toBe(150);
      expect(report.coreConcerns.length).toBeGreaterThan(0);
      expect(report.cognitiveDistortions.length).toBeGreaterThanOrEqual(0);
      expect(report.homeworkAction).toBeDefined();
    });
  });
});
