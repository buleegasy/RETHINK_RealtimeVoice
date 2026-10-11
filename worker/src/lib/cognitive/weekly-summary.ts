import type { FlashOptions } from './types';
import {
  MINIMAX_API_URL,
  resolveReportingModel,
  trimTrailingSlashes,
  stripWrappingQuotes,
} from './constants';

function buildFallbackObservation(
  crisisCount: number,
  concernNames: string[],
  concernStr: string,
): string {
  if (crisisCount > 0) {
    return `近期校园监测到个别情绪高压个案，主要涉及${concernStr.slice(0, 12)}等生活事件，建议专职老师重点跟进，常规学生心境整体受控。`;
  }
  if (concernNames.length === 0 || concernStr.includes('闲聊') || concernStr.includes('日常')) {
    return '本周学生多以轻量交流与日常寒暄为主，整体心境平和自然，未见群体性学业或情绪焦虑集聚。';
  }
  return `本周来访焦点主要聚焦于${concernStr.slice(0, 12)}，学生在倾诉后情绪多能得到自然舒缓与理清，校园心境总体平稳。`;
}

function buildEmotionalTone(crisisCount: number, avgValence: number): string {
  if (crisisCount > 0) return '存在个别需线下重点关怀的突发高压事件';
  if (avgValence >= 0.2) return '整体积极轻松';
  if (avgValence <= -0.3) return '普遍承载一定现实压力与负重感';
  return '整体处于常态平稳交流状态';
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
  const fallback = buildFallbackObservation(crisisCount, concernNames, concernStr);

  if (!options?.apiKey) {
    return fallback;
  }

  const baseUrl = trimTrailingSlashes(options.baseUrl || MINIMAX_API_URL);
  const model = resolveReportingModel(options.model);
  const endpoint =
    baseUrl.endsWith('/chat/completions') || baseUrl.includes('chatcompletion_v2')
      ? baseUrl
      : `${baseUrl}/chat/completions`;

  const emotionalTone = buildEmotionalTone(crisisCount, avgValence);
  const activityDescription = totalSessions <= 3 ? '少量探索性进线' : '常态多频进线';

  const prompt = `你是经验丰富的校园心理专职督导老师。请结合本周校园倾诉的整体情况，撰写一段20-50字的大屏“本周心境与趋势观察”。

【核心要求（坚决去格式化、去八股文）】：
1. 绝对严禁写成机械汇报或数据填空！（大屏上方已有数字卡片，绝对不要出现“本周记录X次倾诉”、“监测到Y起危机”、“平均情绪效价为Z”等机械复读数字的套话）。
2. 请用富有教育温度与专业敏锐度的连贯叙述，提炼本周学生群体的真实心境氛围与情绪动态（例如：若以体验闲聊为主，说明氛围轻松自然、未现压力聚积；若涉及学业或同伴，说明具体心理关切与调节状态）。
3. 语言绝对客观求实，不夸大、不臆测、不打官腔，一气呵成，字数严格在20至50字之间。直接输出纯文本，不要任何标题、引号或分点。

【本周倾诉背景参考】：
- 主要涉及主题：${concernStr}
- 情绪总体基调：${emotionalTone}
- 倾诉样本活跃度：${activityDescription}
`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    };

    const reqBody: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 120,
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: options?.signal,
      body: JSON.stringify(reqBody),
    });

    if (res.ok) {
      const data: any = await res.json();
      const reply = stripWrappingQuotes(data?.choices?.[0]?.message?.content || '');
      if (reply.length >= 18 && reply.length <= 55) {
        return reply;
      }
    }
  } catch {}

  return fallback;
}
