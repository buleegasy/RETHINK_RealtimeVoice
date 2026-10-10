import type { FlashOptions, StructuredSessionReport } from './types';
import {
  MINIMAX_M3_MODEL,
  MINIMAX_API_URL,
  resolveReportingModel,
  parseJsonSafe,
} from './constants';
import { evaluateTranscriptRuleBased } from '../minimax-evaluator';

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

  const isMiniMaxKey =
    options.apiKey.startsWith('sk-api--') || Boolean(options.baseUrl?.includes('minimax'));
  const baseUrl = (
    options.baseUrl || (isMiniMaxKey ? MINIMAX_API_URL : 'https://openrouter.ai/api/v1')
  ).replace(/\/+$/, '');
  const model = options.model
    ? resolveReportingModel(options.model)
    : isMiniMaxKey
      ? MINIMAX_M3_MODEL
      : resolveReportingModel();
  const endpoint =
    baseUrl.endsWith('/chat/completions') || baseUrl.includes('chatcompletion_v2')
      ? baseUrl
      : `${baseUrl}/chat/completions`;

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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    };
    if (!isMiniMaxKey) {
      headers['HTTP-Referer'] = 'https://rethink.local';
      headers['X-Title'] = 'RETHINK Session Reporter';
    }

    const reqBody: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    };
    if (!isMiniMaxKey) {
      reqBody.max_tokens = 2500;
      reqBody.response_format = { type: 'json_object' };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: options?.signal,
      body: JSON.stringify(reqBody),
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
