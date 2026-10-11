import type { FlashOptions, ShadowReasoningContext, ShadowReasoningResult } from './types';
import { resolveFlashModel } from './constants';

function cleanCognitiveHint(raw: string): string {
  if (!raw) return '';
  let hint = raw
    .trim()
    .replace(/^["“'‘`]+|["”'’`]+$/g, '')
    .trim();

  if (hint.startsWith('{') && hint.endsWith('}')) {
    try {
      const parsed = JSON.parse(hint);
      if (typeof parsed.cognitiveHint === 'string') {
        hint = parsed.cognitiveHint.trim();
      } else if (typeof parsed.instruction === 'string') {
        hint = parsed.instruction.trim();
      }
    } catch {}
  }

  return hint.replace(/^你应该[:：\s]*/, '').trim();
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
      return { cognitiveHint: cleanCognitiveHint(context.cbtHints[0]) };
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

  const systemPrompt = `你是高中校园心理支持后台影子认知大脑，服务受众纯为高中生（严禁提及工作/职场等成人话题）。
结合高中学生最新发言与过往校园情境，在后台异步完成深度思考，直接输出极简纯文本策略指令供语音模型参考。

【输出要求】
1. 绝对严禁以“你应该……”开头！绝对不要返回 JSON 格式！直接输出一段纯文本指令。
2. 保持极致简洁，字数严格控制在40字以内。
3. 语言为幕后督导策略风格，指出分析重点与应对动作，口语化表达完全交由语音模型渲染。

【6大核心场景应对准则】
1. 现实困境/学业生活矛盾：分析现实处境与事实边界，拆解核心矛盾，给出现实可行建议与微动作。
2. 急性崩溃/躯体化发作：暂停分析，联动RAG与感官着陆技术，给出4-7-8慢呼吸或54321着陆缓解法。
3. 人际冲突/宿舍排挤：分离他人评价与自我价值，建立心理防御边界与非对抗沟通。
4. 极端认知扭曲/灾难化：运用苏格拉底追问松动全或无信念，寻找反例与灰色地带。
5. 存在主义虚无/意义丧失：拒绝宏大说教，引导连接当下可感知的微小生活细节。
6. 日常闲聊/好奇试探：轻松自然接梗，严禁生造病态焦虑，保持轻快同伴在场感。`;

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
        max_tokens: 120,
      }),
    });

    if (!res.ok) {
      if (context.cbtHints && context.cbtHints.length > 0) {
        return { cognitiveHint: cleanCognitiveHint(context.cbtHints[0]) };
      }
      return null;
    }

    const data: any = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content || '';
    let cognitiveHint = cleanCognitiveHint(rawContent);

    if (!cognitiveHint && context.cbtHints?.[0]) {
      cognitiveHint = cleanCognitiveHint(context.cbtHints[0]);
    }

    return {
      cognitiveHint,
      extractedName: context.userName || context.situationalMemory?.userName || undefined,
      coreConcern: context.situationalMemory?.coreConcerns?.[0] || undefined,
    };
  } catch {
    if (context.cbtHints && context.cbtHints.length > 0) {
      return { cognitiveHint: cleanCognitiveHint(context.cbtHints[0]) };
    }
    return null;
  }
}
