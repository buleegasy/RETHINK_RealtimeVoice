import type { FlashOptions, ShadowReasoningContext, ShadowReasoningResult } from './types';
import { resolveFlashModel } from './constants';

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
