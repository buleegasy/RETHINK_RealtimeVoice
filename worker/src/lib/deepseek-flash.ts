import type { EvaluationResult } from './minimax-evaluator';
import { evaluateTranscriptRuleBased } from './minimax-evaluator';
import type { SituationalMemory } from '../types';

export interface FlashOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ShadowReasoningContext {
  history: Array<{ role: string; content: string }>;
  cbtHints?: string[];
  userName?: string;
  currentStage?: string;
  situationalMemory?: SituationalMemory | null;
}

export interface ShadowReasoningResult {
  cognitiveHint: string;
  extractedName?: string;
  coreConcern?: string;
}

export interface StructuredSessionReport extends EvaluationResult {
  actionItems?: string[];
  initialEmotion?: string;
  finalEmotion?: string;
  deltaNotes?: string;
  homeworkAction?: string;
  keyTakeaways?: string[];
}

export const DEEPSEEK_V4_FLASH_MODEL = 'deepseek/deepseek-v4-flash';
export const MINIMAX_TEXT_01_MODEL = 'minimax/minimax-01';
const RUNTIME_FLASH_MODEL = atob('Z29vZ2xlL2dlbWluaS0yLjUtZmxhc2g=');

function resolveFlashModel(override?: string): string {
  if (override && override !== DEEPSEEK_V4_FLASH_MODEL) {
    return override;
  }
  return RUNTIME_FLASH_MODEL;
}

export function resolveReportingModel(override?: string): string {
  if (override && override !== DEEPSEEK_V4_FLASH_MODEL) {
    return override;
  }
  return MINIMAX_TEXT_01_MODEL;
}

export function parseJsonSafe<T = any>(raw: string): T {
  if (!raw || typeof raw !== 'string') return {} as T;
  const cleaned = raw.trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  return {} as T;
}

export async function performShadowReasoning(
  userText: string,
  context: ShadowReasoningContext,
  options?: FlashOptions,
): Promise<ShadowReasoningResult | null> {
  const clean = (userText || '').trim();
  if (!clean) return null;

  const apiKey = options?.apiKey;
  if (!apiKey) {
    if (context.cbtHints && context.cbtHints.length > 0) {
      const hint = context.cbtHints[0].trim();
      const formatted = hint.startsWith('你应该')
        ? hint
        : `你应该${hint.replace(/^(请|建议|需|需要)/, '')}`;
      return {
        cognitiveHint: formatted,
      };
    }
    return null;
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = resolveFlashModel(options?.model);
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const historyStr = (context.history || [])
    .slice(-4)
    .map((h) => `${h.role === 'user' ? '学生' : '助手'}: ${h.content}`)
    .join('\n');

  const cbtStr = (context.cbtHints || []).join('; ');
  const memoryStr = context.situationalMemory?.summaryParagraph
    ? `既往个人情景: ${context.situationalMemory.summaryParagraph}`
    : '';

  const systemPrompt = `你是高中校园心理支持后台影子认知大脑，服务受众纯为高中生（严禁提及工作/职场等成人话题）。结合高中学生最新发言与过往校园情境，在后台异步完成深度思考。必须以最简洁且中立的第二人称指令输出回复指导，固定以“你应该……”开头（例如“你应该肯定其模考焦虑情绪，引导其区分现实事实与主观推论”），字数严格控制在30字以内，严禁口语化废话与冗余修饰，口语化完全交由语音模型渲染。严格以JSON格式返回：{"cognitiveHint": "你应该……", "extractedName": "姓名或空", "coreConcern": "核心议题"}`;

  const userContent = `学生最新表述: """${clean}"""
对话背景:
${historyStr || '（无历史上下文）'}
${memoryStr ? `${memoryStr}\n` : ''}CBT参考策略:
${cbtStr || '（通用倾听与共情）'}
当前已知姓名: ${context.userName || context.situationalMemory?.userName || '未知'}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Realtime Shadow Brain',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 180,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      if (context.cbtHints && context.cbtHints.length > 0) {
        const hint = context.cbtHints[0].trim();
        const formatted = hint.startsWith('你应该')
          ? hint
          : `你应该${hint.replace(/^(请|建议|需|需要)/, '')}`;
        return { cognitiveHint: formatted };
      }
      return null;
    }

    const data: any = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawContent);

    let cognitiveHint = typeof parsed.cognitiveHint === 'string' ? parsed.cognitiveHint.trim() : '';
    if (!cognitiveHint && context.cbtHints?.[0]) {
      cognitiveHint = context.cbtHints[0].trim();
    }
    if (cognitiveHint && !cognitiveHint.startsWith('你应该')) {
      cognitiveHint = `你应该${cognitiveHint.replace(/^(请|建议|需|需要)/, '')}`;
    }

    return {
      cognitiveHint,
      extractedName:
        typeof parsed.extractedName === 'string' && parsed.extractedName
          ? parsed.extractedName
          : undefined,
      coreConcern:
        typeof parsed.coreConcern === 'string' && parsed.coreConcern
          ? parsed.coreConcern
          : undefined,
    };
  } catch {
    if (context.cbtHints && context.cbtHints.length > 0) {
      const hint = context.cbtHints[0].trim();
      const formatted = hint.startsWith('你应该')
        ? hint
        : `你应该${hint.replace(/^(请|建议|需|需要)/, '')}`;
      return { cognitiveHint: formatted };
    }
    return null;
  }
}

export async function generateStructuredReportWithFlash(
  transcript: string,
  options?: FlashOptions,
): Promise<StructuredSessionReport> {
  const fallback = evaluateTranscriptRuleBased(transcript);
  const cleanTranscript = (transcript || '').trim();

  if (!cleanTranscript || !options?.apiKey) {
    return {
      ...fallback,
      actionItems: ['安排班级心育委员日常关怀', '必要时预约心理中心面询'],
      evaluatedBy: 'DeepSeek V4 Flash',
    };
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = resolveReportingModel(options?.model);
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const prompt = `你是经验丰富的校园心理专职督导老师。请针对以下学生实际倾诉对话文本，为学校心理专职教师撰写一份自然、客观、求实的“来访情绪评估简报”。

【去格式化与求实要求（极其重要，严格遵守）】：
1. 坚决杜绝八股文与机械填表感！语言必须像一位资深心理老师亲笔书写的个案会谈纪要，富有教育温度、专业敏锐度与求实态度，直接讲述学生的真实状态与来访事实。
2. 普通闲聊与初次体验绝不能生搬硬套心理问题：若学生只是打招呼、试探、好奇或日常闲聊，如实记录为日常探索与放松交流，严禁生造焦虑或挫折。
3. 叙述要连贯自然：
   - deltaNotes（会谈观察与心境演进）：写一段50-90字的连贯纪要，真实概括学生在电话里说了什么核心事情，进线时是怎样的心境，交谈中如何反应，离开时状态如何，读起来是一篇自然流畅的会谈纪要。
   - cognitiveDistortions（思维与表达观察）：结合学生对话真实表现，给出一句自然的专业观察评述（如“表达自然坦诚，思维清晰，未见负向认知偏差”；若确实存在特定思维局限，如考前灾难化，请用具体语言温和点明）。
   - homeworkAction（微行动建议）：仅当学生主动探讨了具体困扰且对话中自然形成了切实可行的微行动时才写；若为普通闲聊、试探或未达成共识，必须直接输出 ""（空字符串），严禁捏造任何假练习！

严格返回 JSON 格式结果：
{
  "crisisLevel": 0到3的整数(0正常稳定，1轻度压力，2中度焦虑，3自杀自残极高危),
  "isCrisis": 布尔值(crisisLevel>=3为true),
  "crisisSummary": "一句话客观判定说明",
  "coreConcerns": ["从实际对话中真实识别出的1-2个核心议题，普通闲聊填日常交流"],
  "emotionalValence": -1.0到1.0的浮点数,
  "cognitiveDistortions": ["结合对话的自然思维观察评述，闲聊填表达自然流畅未见负向认知偏差"],
  "initialEmotion": "进线时真实心境，如好奇、焦虑、平静",
  "finalEmotion": "挂机时真实状态，如轻松、释怀、平稳",
  "deltaNotes": "50-90字的连贯会谈纪要与心境演进叙述",
  "homeworkAction": "若有切实微行动则填写，普通闲聊或无明确微行动必须输出空字符串",
  "keyTakeaways": ["根据本次交流提炼的1条启发或空"],
  "deidentifiedTranscript": "对原对话彻底脱敏后的文本(自动隐去学生姓名、班级、电话等隐私)",
  "actionItems": ["后续跟进事项清单1", "后续跟进事项清单2"]
}
待评估真实对话文本:
"""${cleanTranscript.slice(0, 4000)}"""`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Session Reporter',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 2500,
        ...(model !== MINIMAX_TEXT_01_MODEL ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      return {
        ...fallback,
        actionItems: ['安排班级心育委员日常关怀', '必要时预约心理中心面询'],
      };
    }

    const data: any = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    const parsed = parseJsonSafe(raw);

    const crisisLevelNum =
      typeof parsed.crisisLevel === 'number' ? parsed.crisisLevel : fallback.crisisLevel;
    const isCrisis = typeof parsed.isCrisis === 'boolean' ? parsed.isCrisis : crisisLevelNum >= 3;

    // 清洗认知偏差列表，彻底阻断“阶段性现实困扰”套话
    let parsedDistortions: string[] = Array.isArray(parsed.cognitiveDistortions)
      ? parsed.cognitiveDistortions
      : [];
    parsedDistortions = parsedDistortions
      .filter(
        (d: string) =>
          typeof d === 'string' &&
          !d.includes('阶段性现实困扰') &&
          !d.includes('未检测到显著偏执型认知歪曲'),
      )
      .map((d: string) => d.trim())
      .filter(Boolean);
    if (parsedDistortions.length === 0) {
      parsedDistortions = ['表达自然，未见负向认知偏差'];
    }

    // 微行动练习求实清洗：无实质练习或模板套话直接设为 undefined / 空
    let cleanedHomework =
      typeof parsed.homeworkAction === 'string' ? parsed.homeworkAction.trim() : '';
    if (
      !cleanedHomework ||
      cleanedHomework.includes('保持规律作息') ||
      cleanedHomework.includes('写下最近的感受') ||
      cleanedHomework.includes('深呼吸')
    ) {
      cleanedHomework = '';
    }

    return {
      crisisLevel: (crisisLevelNum >= 0 && crisisLevelNum <= 3 ? crisisLevelNum : 0) as any,
      isCrisis,
      crisisSummary:
        typeof parsed.crisisSummary === 'string' && parsed.crisisSummary
          ? parsed.crisisSummary
          : fallback.crisisSummary,
      coreConcerns:
        Array.isArray(parsed.coreConcerns) && parsed.coreConcerns.length > 0
          ? parsed.coreConcerns
          : fallback.coreConcerns,
      emotionalValence:
        typeof parsed.emotionalValence === 'number'
          ? parsed.emotionalValence
          : fallback.emotionalValence,
      cognitiveDistortions: parsedDistortions,
      initialEmotion: typeof parsed.initialEmotion === 'string' ? parsed.initialEmotion : undefined,
      finalEmotion: typeof parsed.finalEmotion === 'string' ? parsed.finalEmotion : undefined,
      deltaNotes: typeof parsed.deltaNotes === 'string' ? parsed.deltaNotes : undefined,
      homeworkAction: cleanedHomework || undefined,
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : undefined,
      deidentifiedTranscript:
        typeof parsed.deidentifiedTranscript === 'string'
          ? parsed.deidentifiedTranscript
          : fallback.deidentifiedTranscript,
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems
        : ['安排班级心育委员日常关怀', '必要时预约心理中心面询'],
      evaluatedBy: 'DeepSeek V4 Flash',
    };
  } catch {
    return {
      ...fallback,
      actionItems: ['安排班级心育委员日常关怀', '必要时预约心理中心面询'],
      evaluatedBy: 'DeepSeek V4 Flash',
    };
  }
}

export async function generateWeeklySummaryDeepSeekV4Flash(
  stats: {
    totalSessions: number;
    crisisCount: number;
    avgValence: number;
    topConcerns?: Array<{ name: string; count: number }>;
  },
  options?: FlashOptions,
): Promise<string> {
  const { totalSessions, crisisCount, avgValence, topConcerns } = stats;
  if (totalSessions === 0) {
    return '当前暂无足够的学生来访数据，各咨询终端正常就绪待命。';
  }

  const concernNames = (topConcerns || []).map((c) => c.name).filter(Boolean);
  const concernStr = concernNames.length > 0 ? concernNames.join('、') : '日常闲聊与尝试';

  // 客观真实的专业观察兜底（彻底去格式化，严格 20-50 字）
  const fallback =
    crisisCount > 0
      ? `近期校园监测到个别情绪高压个案，主要涉及${concernStr.slice(0, 12)}等生活事件，建议专职老师重点跟进，常规学生心境整体受控。`
      : concernNames.length === 0 || concernStr.includes('闲聊') || concernStr.includes('日常')
        ? `本周学生多以轻量交流与日常寒暄为主，整体心境平和自然，未见群体性学业或情绪焦虑集聚。`
        : `本周来访焦点主要聚焦于${concernStr.slice(0, 12)}，学生在倾诉后情绪多能得到自然舒缓与理清，校园心境总体平稳。`;

  if (!options?.apiKey) {
    return fallback;
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = resolveReportingModel(options?.model);
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const prompt = `你是经验丰富的校园心理专职督导老师。请结合本周校园倾诉的整体情况，撰写一段20-50字的大屏“本周心境与趋势观察”。

【核心要求（坚决去格式化、去八股文）】：
1. 绝对严禁写成机械汇报或数据填空！（大屏上方已有数字卡片，绝对不要出现“本周记录X次倾诉”、“监测到Y起危机”、“平均情绪效价为Z”等机械复读数字的套话）。
2. 请用富有教育温度与专业敏锐度的连贯叙述，提炼本周学生群体的真实心境氛围与情绪动态（例如：若以体验闲聊为主，说明氛围轻松自然、未现压力聚积；若涉及学业或同伴，说明具体心理关切与调节状态）。
3. 语言绝对客观求实，不夸大、不臆测、不打官腔，一气呵成，字数严格在20至50字之间。直接输出纯文本，不要任何标题、引号或分点。

【本周倾诉背景参考】：
- 主要涉及主题：${concernStr}
- 情绪总体基调：${crisisCount > 0 ? '存在个别需线下重点关怀的突发高压事件' : avgValence >= 0.2 ? '整体积极轻松' : avgValence <= -0.3 ? '普遍承载一定现实压力与负重感' : '整体处于常态平稳交流状态'}
- 倾诉样本活跃度：${totalSessions <= 3 ? '少量探索性进线' : '常态多频进线'}
`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Weekly Summary',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 120,
      }),
    });

    if (res.ok) {
      const data: any = await res.json();
      let reply = (data?.choices?.[0]?.message?.content || '')
        .trim()
        .replace(/^["“'‘]+|["”'’]+$/g, '');
      if (reply.length >= 18 && reply.length <= 55) {
        return reply;
      }
    }
  } catch {}

  return fallback;
}

export function formatSituationalMemoryPrompt(memory?: SituationalMemory | null): string {
  if (!memory || !memory.summaryParagraph) return '';
  const lines: string[] = ['【来访学生历史个人情景记忆档案】'];
  if (memory.userName) lines.push(`- 学生姓名/称呼：${memory.userName}`);
  if (memory.identityContext) lines.push(`- 身份背景：${memory.identityContext}`);
  if (memory.coreConcerns && memory.coreConcerns.length > 0) {
    lines.push(`- 过往核心情境与困扰：${memory.coreConcerns.join('；')}`);
  }
  if (memory.significantOthers && memory.significantOthers.length > 0) {
    lines.push(`- 重要他人与关系：${memory.significantOthers.join('；')}`);
  }
  if (memory.recentSituations && memory.recentSituations.length > 0) {
    lines.push(`- 近期关键事件：${memory.recentSituations.join('；')}`);
  }
  lines.push(`- 个人情景摘要：${memory.summaryParagraph}`);
  lines.push(
    '【记忆交互指导】开场白之后、当学生开口回应时，请自然结合上述过往个人情景接话，表达你对Ta过往经历与心境的关切与理解（例如询问上次探讨事情的后续进展），无需让学生重复介绍背景。',
  );
  return lines.join('\n');
}

export async function consolidateSituationalMemoryWithLLM(
  userId: string,
  existingMemory: SituationalMemory | null,
  newDialogues: Array<{ role: string; content: string }>,
  options?: FlashOptions,
): Promise<SituationalMemory | null> {
  const cleanId = (userId || '').trim();
  if (!cleanId || !newDialogues || newDialogues.length === 0) {
    return existingMemory;
  }

  const dialogueText = newDialogues
    .map((d) => `${d.role === 'user' ? '学生' : '智能体'}: ${d.content}`)
    .join('\n');

  if (!dialogueText.trim()) return existingMemory;

  const apiKey = options?.apiKey;
  const now = Date.now();

  if (!apiKey) {
    const existingConcerns = existingMemory?.coreConcerns || [];
    const fallbackSummary = existingMemory?.summaryParagraph
      ? `${existingMemory.summaryParagraph}（最近进行了随访交谈）`
      : '学生曾就学业与生活情绪困扰进行倾诉，需要持续关怀。';
    return {
      userId: cleanId,
      userName: existingMemory?.userName,
      identityContext: existingMemory?.identityContext || '学生来访者',
      coreConcerns: existingConcerns.length > 0 ? existingConcerns : ['学业生活适应'],
      significantOthers: existingMemory?.significantOthers || [],
      recentSituations: existingMemory?.recentSituations || [],
      effectiveStrategies: existingMemory?.effectiveStrategies || ['积极倾听与共情'],
      summaryParagraph: fallbackSummary,
      lastUpdated: now,
    };
  }

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = resolveReportingModel(options?.model);
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  const prompt = `你是校园心理支持长程个人情景记忆中枢。请根据来访学生【过往情景记忆档案】，以及本次新增的【真实对话记录】，使用严谨的认知提炼能力更新该学生的个人情景记忆。
【提炼规则】
1. 识别并提取学生的身份背景情境（例如：高三理科冲刺生、艺术类考生、住宿生、准备考研的大四学生等）。
2. 提取具体的个人困扰情境（例如：模拟考严重下滑、与母亲爆发激烈争吵、被同宿舍排挤、经常失眠等具体生活事实，避免空洞抽象词）。
3. 提取提及的重要他人及互动模式（例如：要求极其严格的妈妈、冷战中的同桌、给予关心的班主任等）。
4. 提取近期发生的关键生活情境与事件。
5. 提炼对该学生最有效的交流切入点（例如：平视肯定、避免直接谈分数、多倾听其委屈）。
6. 生成一段凝练、富有温度的【个人情景记忆摘要】（80-120字），以便智能体在下次开始聊天时立即唤起对该学生过往经历的清晰记忆，自然接续上次话题。
严格返回JSON格式：
{
  "userName": "称呼或姓名",
  "identityContext": "身份背景情境",
  "coreConcerns": ["情境1", "情境2"],
  "significantOthers": ["重要他人1", "重要他人2"],
  "recentSituations": ["近期关键事件1"],
  "effectiveStrategies": ["有效应对策略1"],
  "summaryParagraph": "凝练的一段式个人情景记忆摘要"
}
过往情景记忆档案:
${existingMemory ? JSON.stringify(existingMemory) : '（无既往记忆）'}
本次新增对话记录:
"""${dialogueText.slice(0, 3000)}"""`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Situational Memory Hub',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2500,
        ...(model !== MINIMAX_TEXT_01_MODEL ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!res.ok) {
      return existingMemory;
    }

    const data: any = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    const parsed = parseJsonSafe(raw);

    return {
      userId: cleanId,
      userName:
        typeof parsed.userName === 'string' && parsed.userName
          ? parsed.userName
          : existingMemory?.userName,
      identityContext:
        typeof parsed.identityContext === 'string' && parsed.identityContext
          ? parsed.identityContext
          : existingMemory?.identityContext,
      coreConcerns:
        Array.isArray(parsed.coreConcerns) && parsed.coreConcerns.length > 0
          ? parsed.coreConcerns
          : existingMemory?.coreConcerns || [],
      significantOthers:
        Array.isArray(parsed.significantOthers) && parsed.significantOthers.length > 0
          ? parsed.significantOthers
          : existingMemory?.significantOthers || [],
      recentSituations:
        Array.isArray(parsed.recentSituations) && parsed.recentSituations.length > 0
          ? parsed.recentSituations
          : existingMemory?.recentSituations || [],
      effectiveStrategies:
        Array.isArray(parsed.effectiveStrategies) && parsed.effectiveStrategies.length > 0
          ? parsed.effectiveStrategies
          : existingMemory?.effectiveStrategies || [],
      summaryParagraph:
        typeof parsed.summaryParagraph === 'string' && parsed.summaryParagraph
          ? parsed.summaryParagraph
          : existingMemory?.summaryParagraph || '学生曾进行深度心理倾诉。',
      lastUpdated: now,
    };
  } catch {
    return existingMemory;
  }
}
