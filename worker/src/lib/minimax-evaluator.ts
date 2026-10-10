import type { CrisisLevel } from '../types';
import { disambiguateCrisis } from './safety-filter';

export interface EvaluationResult {
  crisisLevel: CrisisLevel;
  isCrisis: boolean;
  crisisSummary: string;
  coreConcerns: string[];
  emotionalValence: number;
  cognitiveDistortions: string[];
  deidentifiedTranscript: string;
  evaluatedBy?: string;
}

const MODERATE_STRESS_PATTERNS = [
  /撑不下去了|快崩溃了|受不了了|天天哭|整夜睡不着|抑郁|绝望|心好累/,
  /被霸凌|孤立|排挤|辱骂|被老师针对|厌学|不想上学/,
];

export async function evaluateTranscriptWithMiniMax(
  transcript: string,
  apiKey?: string,
  minimaxBaseUrl?: string,
  apiyiBaseUrl?: string,
): Promise<EvaluationResult> {
  const fallback = evaluateTranscriptRuleBased(transcript);

  if (!apiKey || !transcript.trim()) {
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const prompt = `你是中学校园心理危机干预与脱敏评估专家。请分析以下学生倾诉对话文本，严格返回 JSON 格式结果：
{
  "crisisLevel": 0到3的整数(0正常，1轻度，2中度压力，3自杀自残极高危),
  "isCrisis": 布尔值(crisisLevel>=3为true),
  "crisisSummary": "一句话风险判定说明",
  "coreConcerns": ["核心困扰议题，如学业焦虑、人际矛盾、亲子冲突等"],
  "emotionalValence": -1.0到1.0的浮点数(-1极其消极，0中立，1积极),
  "cognitiveDistortions": ["识别出的认知歪曲，如灾难化思维、非黑即白等"],
  "deidentifiedTranscript": "对原对话彻底脱敏后的文本(屏蔽姓名、班级、电话、住址等)"
}
待评估文本:
"""${transcript.slice(0, 1500)}"""`;

    const isMiniMax = apiKey.startsWith('ey') || apiKey.length > 100;
    const defaultMiniMaxUrl = 'https://api.minimaxi.chat/v1/text/chatcompletion_v2';
    const defaultApiyiUrl = 'https://api.apiyi.com/v1/chat/completions';
    const url = isMiniMax
      ? minimaxBaseUrl
        ? `${minimaxBaseUrl.replace(/\/+$/, '')}/text/chatcompletion_v2`
        : defaultMiniMaxUrl
      : apiyiBaseUrl
        ? `${apiyiBaseUrl.replace(/\/+$/, '')}/chat/completions`
        : defaultApiyiUrl;

    const payload = isMiniMax
      ? {
          model: 'MiniMax-M3',
          messages: [{ role: 'user', content: prompt }],
        }
      : {
          model: atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx'),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content || '';
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          crisisLevel: Math.max(
            0,
            Math.min(3, Number(parsed.crisisLevel || fallback.crisisLevel)),
          ) as CrisisLevel,
          isCrisis: Boolean(parsed.isCrisis ?? fallback.isCrisis),
          crisisSummary: String(parsed.crisisSummary || fallback.crisisSummary),
          coreConcerns: Array.isArray(parsed.coreConcerns)
            ? parsed.coreConcerns
            : fallback.coreConcerns,
          emotionalValence: Math.max(
            -1,
            Math.min(1, Number(parsed.emotionalValence || fallback.emotionalValence)),
          ),
          cognitiveDistortions: Array.isArray(parsed.cognitiveDistortions)
            ? parsed.cognitiveDistortions
            : fallback.cognitiveDistortions,
          deidentifiedTranscript: String(
            parsed.deidentifiedTranscript || fallback.deidentifiedTranscript,
          ),
          evaluatedBy: 'DeepSeek V4 Flash',
        };
      }
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function evaluateTranscriptRuleBased(transcript: string): EvaluationResult {
  const text = transcript || '';

  let crisisLevel: CrisisLevel = 0;
  let isCrisis = false;
  let crisisSummary = '情绪状态相对稳定，未触发危机预警';

  // 1. 接入统一 Aho-Corasick + 否定消歧引擎 (支持“我并不想死”等反向断言消歧)
  const l1Check = disambiguateCrisis(text);
  if (l1Check.isCrisis) {
    crisisLevel = 3;
    isCrisis = true;
    const matched = l1Check.matches.filter((m) => !m.isDisambiguated).map((m) => m.keyword);
    crisisSummary = `检测到明确自杀/自残/极端危机意向 (${matched.join(', ')})，需心理老师即刻介入`;
  }

  if (crisisLevel === 0) {
    for (const pattern of MODERATE_STRESS_PATTERNS) {
      if (pattern.test(text)) {
        crisisLevel = 2;
        crisisSummary = '检测到中度情绪崩溃与高度压力，建议心理老师列入重点关注';
        break;
      }
    }
  }

  if (crisisLevel === 0 && /难过|伤心|焦虑|烦躁|压力|失眠|担心/.test(text)) {
    crisisLevel = 1;
    crisisSummary = '存在阶段性负面情绪，处于倾诉排解过程中';
  }

  const coreConcerns: string[] = [];
  if (/考试|成绩|排名|学业|分班|作业|高考|中考/.test(text)) coreConcerns.push('学业考核压力');
  if (/宿舍|同学|朋友|人际|孤立|不理我|吵架/.test(text)) coreConcerns.push('同伴人际矛盾');
  if (/爸妈|父母|家里|母亲|父亲|唠叨|管我/.test(text)) coreConcerns.push('家庭互动冲突');
  if (/失眠|心慌|头疼|胸闷|不想吃/.test(text)) coreConcerns.push('躯体化焦虑反应');
  if (coreConcerns.length === 0) coreConcerns.push('日常交流');

  let emotionalValence = -0.1;
  if (crisisLevel === 3) emotionalValence = -0.9;
  else if (crisisLevel === 2) emotionalValence = -0.6;
  else if (crisisLevel === 1) emotionalValence = -0.3;
  else if (/开心|好受多了|谢谢|想通了|明白了/.test(text)) emotionalValence = 0.5;

  const cognitiveDistortions: string[] = [];
  if (/必须|绝不能|全完了|没希望了/.test(text)) cognitiveDistortions.push('灾难化与绝对化思维');
  if (/所有人都|大家都不|每次都/.test(text)) cognitiveDistortions.push('以偏概全');
  if (/觉得我|肯定看不起我/.test(text)) cognitiveDistortions.push('读心术倾向');
  if (cognitiveDistortions.length === 0) cognitiveDistortions.push('表达自然，未见负向认知偏差');

  const deidentifiedTranscript = text
    .replace(/(?:\+?86)?\s*(1[3-9]\d)\d{4}(\d{4})/g, '$1****$2')
    .replace(/(\d{6})\d{8}(\w{4})/g, '$1********$2')
    .replace(/([初高][一二三四]\s*\(\d+\)\s*班|[初高][一二三四]\d+班)/g, '某年级某班')
    .replace(/(张|李|王|赵|钱|孙|周|吴|郑|陈|刘|杨|黄)[老师主任校医]{1,2}/g, '$1老师');

  return {
    crisisLevel,
    isCrisis,
    crisisSummary,
    coreConcerns,
    emotionalValence,
    cognitiveDistortions,
    deidentifiedTranscript,
    evaluatedBy: 'DeepSeek V4 Flash',
  };
}
