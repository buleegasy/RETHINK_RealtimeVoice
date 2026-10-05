import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isL1Crisis, checkL2FlashSafety, checkDoubleSpeedSafety } from '../src/lib/safety-filter';
import {
  performShadowReasoning,
  generateStructuredReportWithFlash,
  consolidateSituationalMemoryWithLLM,
  formatSituationalMemoryPrompt,
} from '../src/lib/deepseek-flash';
import { saveSituationalMemory, clearMemoryCache } from '../src/lib/memory-store';
import app from '../src/index';

describe('思考与语音解耦架构验证 (OpenRouter DeepSeek V4 Flash 认知旁路管线)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('模块一：双速分层风险拦截链路 (L1 + L2)', () => {
    it('L1 本地即时硬过滤应在 0ms 级别精确匹配自杀自残等极端词汇', () => {
      expect(isL1Crisis('我觉得生活没有希望，想跳楼自杀')).toBe(true);
      expect(isL1Crisis('我已经买了大量安眠药准备吞药结束生命')).toBe(true);
      expect(isL1Crisis('真的不想在这个世界上活下去了，准备彻底解脱')).toBe(true);
      expect(isL1Crisis('我现在一个人站在天台窗台上')).toBe(true);
      expect(isL1Crisis('我拿小刀划手放血，割大动脉')).toBe(true);
      expect(isL1Crisis('房间门窗已封死，准备烧炭自杀')).toBe(true);
      expect(isL1Crisis('谁也别救我，这是我的绝笔遗书')).toBe(true);
      expect(isL1Crisis('今天数学考试好难，心情有点烦躁')).toBe(false);
      expect(isL1Crisis('')).toBe(false);
    });

    it('L1 本地过滤在识别到否定词与劝阻语境时应精准放行避免误杀', () => {
      expect(isL1Crisis('我不想死，我还想好好活着呢')).toBe(false);
      expect(isL1Crisis('我绝对不会去自杀的')).toBe(false);
      expect(isL1Crisis('我没有要自杀，只是有点心烦')).toBe(false);
      expect(isL1Crisis('我已经彻底打消了轻生的念头')).toBe(false);
      expect(isL1Crisis('班长及时拉住并劝阻了要跳楼的同学')).toBe(false);
      expect(isL1Crisis('我不会去自残的，放心吧')).toBe(false);
      expect(isL1Crisis('我虽然不想死，但我买了百草枯准备喝')).toBe(true);
    });

    it('L2 DeepSeek V4 Flash 语义旁路熔断应基于单字符枚举精准断言', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '1',
              },
            },
          ],
        }),
      } as any);

      const isCrisis = await checkL2FlashSafety('我觉得如果我消失了，对所有人都是一种解脱', {
        apiKey: 'test-openrouter-key',
        model: 'deepseek/deepseek-v4-flash',
      });

      expect(isCrisis).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('checkDoubleSpeedSafety 命中 L1 时应免除网络请求直接瞬时熔断', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const result = await checkDoubleSpeedSafety('我不想活了，准备割腕', {
        apiKey: 'test-key',
      });

      expect(result.isCrisis).toBe(true);
      expect(result.tier).toBe('L1');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('checkDoubleSpeedSafety 在 L1 未命中时应平滑流转至 L2 并返回合规状态', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '0',
              },
            },
          ],
        }),
      } as any);

      const result = await checkDoubleSpeedSafety('明天要开家长会了，我感觉非常焦虑', {
        apiKey: 'test-key',
        model: 'deepseek/deepseek-v4-flash',
      });

      expect(result.isCrisis).toBe(false);
      expect(result.tier).toBe('none');
    });
  });

  describe('模块二：异步影子推导与记忆抽取链路', () => {
    it('performShadowReasoning 能够结合上下文、知识库与学生意图解析结构化认知引导', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cognitiveHint: '你应该引导其列举最坏情况发生的客观概率。',
                  extractedName: '小宇',
                  coreConcern: '高考模考失利与亲子冲突',
                }),
              },
            },
          ],
        }),
      } as any);

      const result = await performShadowReasoning(
        '我是高三的小宇，这次模拟考考砸了，我爸肯定会对我彻底失望，我整个人生都完了',
        {
          history: [],
          cbtHints: ['运用去灾难化技术，检验最坏结果的发生概率与应对资源'],
          userName: '',
        },
        {
          apiKey: 'test-openrouter-key',
          model: 'deepseek/deepseek-v4-flash',
        },
      );

      expect(result).not.toBeNull();
      expect(result?.cognitiveHint).toMatch(/^你应该/);
      expect(result?.extractedName).toBe('小宇');
      expect(result?.coreConcern).toContain('模考失利');
    });

    it('performShadowReasoning 在无 API Key 或网络异常时平滑回退至知识库策略', async () => {
      const result = await performShadowReasoning(
        '我总觉得自己什么事都做不好',
        {
          history: [],
          cbtHints: ['苏格拉底提问：寻找相反的反例事实打破绝对化判断'],
        },
        {
          apiKey: '',
        },
      );

      expect(result).not.toBeNull();
      expect(result?.cognitiveHint).toMatch(/^你应该/);
      expect(result?.cognitiveHint).toContain('苏格拉底提问');
    });
  });

  describe('模块三：结构化会话沉淀与持久化链路', () => {
    it('generateStructuredReportWithFlash 能正确解析 Strict JSON 报告与跟进建议', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  crisisLevel: 1,
                  isCrisis: false,
                  crisisSummary: '轻度人际适应压力，无自杀自残倾向',
                  coreConcerns: ['宿舍人际关系', '情绪困扰'],
                  emotionalValence: -0.3,
                  cognitiveDistortions: ['个人化归因'],
                  deidentifiedTranscript: '学生来访者表达了与室友作息不一致的困扰...',
                  actionItems: ['建议参加心理中心人际交往团体辅导', '关注下周宿舍调解进展'],
                }),
              },
            },
          ],
        }),
      } as any);

      const report = await generateStructuredReportWithFlash('学生: 我觉得宿舍室友都在针对我...', {
        apiKey: 'test-key',
        model: 'deepseek/deepseek-v4-flash',
      });

      expect(report.crisisLevel).toBe(1);
      expect(report.isCrisis).toBe(false);
      expect(report.coreConcerns).toContain('宿舍人际关系');
      expect(report.actionItems).toBeDefined();
      expect(report.actionItems?.length).toBeGreaterThan(0);
    });

    it('POST /api/voice/session/persist 在端点层正常调度 DeepSeek Flash 评估结果并完成归档', async () => {
      const res = await app.request('/api/voice/session/persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sess_test_decoupled_001',
          duration: 120,
          stage: 'Socratic_Questioning',
          username: '小明',
          transcript_text:
            '学生: 老师，我觉得最近压力很大。 智能体: 我听到了，愿不愿意跟我具体聊聊？',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.ok).toBe(true);
      expect(data.report).toBeDefined();
      expect(data.report.sessionId).toBe('sess_test_decoupled_001');
    });
  });

  describe('模块四：LLM 驱动的长程个人情景记忆链路', () => {
    beforeEach(() => {
      clearMemoryCache();
    });

    it('consolidateSituationalMemoryWithLLM 应准确提炼学生个人情境与生活记忆档案', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  userName: '小华',
                  identityContext: '高三住校理科生，备战高考冲刺',
                  coreConcerns: [
                    '近期数学模考断崖式下滑',
                    '母亲期望过高引发亲子激烈争吵',
                    '入睡困难',
                  ],
                  significantOthers: ['严格的母亲', '经常交流的班主任张老师'],
                  recentSituations: ['上周模拟考数学只有85分被妈妈斥责', '在宿舍整夜辗转反侧'],
                  effectiveStrategies: ['认可其刻苦努力', '避免直接催促成绩', '运用去灾难化引导'],
                  summaryParagraph:
                    '小华是高三住校生，近期因数学模考失利与母亲爆发冲突，存在较大焦虑与失眠，需要温和同龄陪伴。',
                }),
              },
            },
          ],
        }),
      } as any);

      const memory = await consolidateSituationalMemoryWithLLM(
        'student_xiaohua_001',
        null,
        [
          {
            role: 'user',
            content:
              '我叫小华，高三住校。上周数学模考只有85分，我妈把我狠狠骂了一顿，我现在晚上根本睡不着。',
          },
          {
            role: 'assistant',
            content: '小华，模考受挫还要面对妈妈的指责，换作谁都会喘不过气来。我在这儿听你说。',
          },
        ],
        {
          apiKey: 'test-key',
          model: 'deepseek/deepseek-v4-flash',
        },
      );

      expect(memory).not.toBeNull();
      expect(memory?.userId).toBe('student_xiaohua_001');
      expect(memory?.userName).toBe('小华');
      expect(memory?.identityContext).toContain('高三住校理科生');
      expect(memory?.coreConcerns).toContain('近期数学模考断崖式下滑');
      expect(memory?.significantOthers).toContain('严格的母亲');
      expect(memory?.summaryParagraph).toContain('小华是高三住校生');
    });

    it('formatSituationalMemoryPrompt 能够精准格式化提示词以供智能体唤醒记忆', () => {
      const prompt = formatSituationalMemoryPrompt({
        userId: 'u123',
        userName: '小李',
        identityContext: '大四应届生',
        coreConcerns: ['秋招多次被拒', '与室友作息不合'],
        significantOthers: ['合租室友'],
        recentSituations: ['昨天面试被淘汰'],
        effectiveStrategies: ['共情求职焦虑'],
        summaryParagraph: '小李处于毕业求职压力期，近期面试受挫，需要理解与赋能。',
        lastUpdated: Date.now(),
      });

      expect(prompt).toContain('【来访学生历史个人情景记忆档案】');
      expect(prompt).toContain('小李');
      expect(prompt).toContain('秋招多次被拒');
      expect(prompt).toContain('记忆交互指导');
    });

    it('GET /api/voice/memory/:userId 端点支持随时查询与复用学生情景记忆', async () => {
      await saveSituationalMemory({} as any, {
        userId: 'student_stored_999',
        userName: '阿杰',
        identityContext: '高二美术生',
        coreConcerns: ['专业集训集训压力大'],
        significantOthers: ['画室专业老师'],
        recentSituations: ['色彩画作业被批评'],
        effectiveStrategies: ['多倾听情绪'],
        summaryParagraph: '阿杰是高二美术生，近期画室集训压力大，需要心理赋能。',
        lastUpdated: Date.now(),
      });

      // 1. 无凭证匿名请求严格返回 401 (Fail-Closed)
      const unauthRes = await app.request('/api/voice/memory/student_stored_999');
      expect(unauthRes.status).toBe(401);

      // 2. 携带本人合法 Token 正常读取 200
      const { signAuthToken, resolveJwtSecret } = await import('../src/lib/auth-crypto');
      const secret = resolveJwtSecret({});
      const now = Math.floor(Date.now() / 1000);
      const studentToken = await signAuthToken(
        { uid: 'student_stored_999', username: '阿杰', role: 'user', iat: now, exp: now + 3600 },
        secret,
      );

      const res = await app.request('/api/voice/memory/student_stored_999', {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
      expect(body.memory).toBeDefined();
      expect(body.memory.userName).toBe('阿杰');
      expect(body.memory.identityContext).toBe('高二美术生');
    });

    it('GET /api/voice/memory/:userId 普通学生跨用户越权读取返回 403 阻断，本人或教师可读取', async () => {
      const { signAuthToken, resolveJwtSecret } = await import('../src/lib/auth-crypto');
      const secret = resolveJwtSecret({});
      const now = Math.floor(Date.now() / 1000);
      const studentAToken = await signAuthToken(
        { uid: 'student_A', username: 'student_A', role: 'user', iat: now, exp: now + 3600 },
        secret,
      );
      const studentBToken = await signAuthToken(
        { uid: 'student_B', username: 'student_B', role: 'user', iat: now, exp: now + 3600 },
        secret,
      );
      const teacherToken = await signAuthToken(
        { uid: 'teacher_01', username: 'teacher_01', role: 'teacher', iat: now, exp: now + 3600 },
        secret,
      );

      // 1. student_A 尝试越权读取 student_stored_999 的记忆，被 403 拦截
      const forbiddenRes = await app.request('/api/voice/memory/student_stored_999', {
        headers: { Authorization: `Bearer ${studentAToken}` },
      });
      expect(forbiddenRes.status).toBe(403);
      const forbiddenData = (await forbiddenRes.json()) as any;
      expect(forbiddenData.error).toContain('Forbidden');

      // 2. 教师账号可合法穿透查看
      const teacherRes = await app.request('/api/voice/memory/student_stored_999', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(teacherRes.status).toBe(200);

      // 3. student_B 读取本人记忆返回 200
      await saveSituationalMemory({} as any, {
        userId: 'student_B',
        userName: '小B',
        coreConcerns: ['考研压力'],
        summaryParagraph: '小B同学近期备战考研。',
        lastUpdated: Date.now(),
      });
      const ownerRes = await app.request('/api/voice/memory/student_B', {
        headers: { Authorization: `Bearer ${studentBToken}` },
      });
      expect(ownerRes.status).toBe(200);
      const ownerData = (await ownerRes.json()) as any;
      expect(ownerData.memory.userName).toBe('小B');
    });
  });
});
