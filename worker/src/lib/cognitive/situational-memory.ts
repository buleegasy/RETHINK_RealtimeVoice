import type { SituationalMemory, SituationRAGItem } from '../../types';
import type { FlashOptions } from './types';
import { MINIMAX_API_URL, resolveReportingModel, parseJsonSafe } from './constants';

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
  if (memory.situations && memory.situations.length > 0) {
    lines.push('【重点情境RAG摘要条目】');
    for (const sit of memory.situations.slice(-3)) {
      lines.push(
        `* [${sit.topic}] ${sit.summary50}${sit.effectiveApproaches ? ` (应对: ${sit.effectiveApproaches})` : ''}`,
      );
    }
  }
  lines.push(
    '【记忆交互指导】\n' +
      '1. 开场问候（老朋友非首次登录）：开场时请根据上述过往档案自然接话，可以说“Hi，上次我们聊到……这类”，随性询问近况或后续进展，保持自然真诚的同伴口吻，不要太死板，严禁机械套用死板模板，控制在1句话内，说完立即保持倾听。\n' +
      '2. 对话交流：系统已动态追加上述学生核心关注点与过往经历，请自然融入对话共情与探讨，避免让学生重复介绍背景。',
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
      situations: existingMemory?.situations,
      lastUpdated: now,
    };
  }

  const baseUrl = (options?.baseUrl || MINIMAX_API_URL).replace(/\/+$/, '');
  const model = resolveReportingModel(options?.model);
  const endpoint =
    baseUrl.endsWith('/chat/completions') || baseUrl.includes('chatcompletion_v2')
      ? baseUrl
      : `${baseUrl}/chat/completions`;

  const prompt = `你是校园心理支持长程个人情景记忆中枢。请根据来访学生【过往情景记忆档案】，以及本次新增的【真实对话记录】，使用严谨的认知提炼能力更新该学生的个人情景记忆，并提炼50字情境摘要与事件始末RAG知识条目。
【提炼规则】
1. 识别并提取学生的身份背景情境（例如：高三理科冲刺生、艺术类考生、住宿生等）。
2. 提取具体的个人困扰情境（例如：模拟考严重下滑、与母亲爆发激烈争吵、被同宿舍排挤、经常失眠等具体生活事实，避免空洞抽象词）。
3. 提取提及的重要他人及互动模式（例如：要求极其严格的妈妈、冷战中的同桌、给予关心的班主任等）。
4. 提取近期发生的关键生活情境与事件。
5. 提炼对该学生最有效的交流切入点（例如：平视肯定、避免直接谈分数、多倾听其委屈）。
6. 生成一段凝练、富有温度的【个人情景记忆摘要】（80-120字），以便智能体在下次开始聊天时立即唤起对该学生过往经历的清晰记忆，自然接续上次话题。
7. 【情境RAG结构化封装（防长文本膨胀核心）】：提炼本次对话识别出的核心独立生活情境，为每个情境输出：
   - topic: 主题关键词（如“月考失利与亲子冲突”）
   - summary50: 约50字的高密度事件与情绪摘要（描述发生了什么事、学生感受、焦点何在）
   - effectiveApproaches: 证明有效的沟通或安抚切入方式

严格返回JSON格式：
{
  "userName": "称呼或姓名",
  "identityContext": "身份背景情境",
  "coreConcerns": ["情境1", "情境2"],
  "significantOthers": ["重要他人1", "重要他人2"],
  "recentSituations": ["近期关键事件1"],
  "effectiveStrategies": ["有效应对策略1"],
  "summaryParagraph": "凝练的一段式个人情景记忆摘要",
  "situations": [
    {
      "topic": "情境主题",
      "summary50": "约50字高密度情境摘要",
      "effectiveApproaches": "有效应对切入点"
    }
  ]
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
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2500,
      }),
    });

    if (!res.ok) {
      return existingMemory;
    }

    const data: any = await res.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    const parsed = parseJsonSafe(raw);

    const newSituations: SituationRAGItem[] = [];
    if (Array.isArray(parsed.situations)) {
      for (const s of parsed.situations) {
        if (s && typeof s.topic === 'string' && typeof s.summary50 === 'string') {
          newSituations.push({
            situationId: `sit_${now}_${Math.random().toString(36).slice(2, 6)}`,
            topic: s.topic.trim(),
            summary50: s.summary50.trim(),
            fullContext: dialogueText.slice(0, 500),
            effectiveApproaches:
              typeof s.effectiveApproaches === 'string' ? s.effectiveApproaches.trim() : undefined,
            timestamp: now,
          });
        }
      }
    }

    const merged = [...(existingMemory?.situations || []), ...newSituations];
    const deduplicated: SituationRAGItem[] = [];
    const seen = new Set<string>();
    for (let i = merged.length - 1; i >= 0; i--) {
      const sit = merged[i];
      if (!seen.has(sit.topic)) {
        seen.add(sit.topic);
        deduplicated.unshift(sit);
      }
    }
    const finalSituations = deduplicated.slice(-10);

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
      situations: finalSituations.length > 0 ? finalSituations : existingMemory?.situations,
      lastUpdated: now,
    };
  } catch {
    return existingMemory;
  }
}
