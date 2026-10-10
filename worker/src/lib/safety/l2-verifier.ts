import type { SafetyCheckOptions, DoubleSpeedSafetyResult } from './types';
import { disambiguateCrisis } from './l1-disambiguator';

// 默认危机判定模型采用 OpenRouter 上的 Jev 决策模型
export const OPENROUTER_JEV_MODEL = atob('dHlwZXNhZmUvamV2LWxhdGVzdA==');

export async function checkL2FlashSafety(
  text: string,
  options?: SafetyCheckOptions,
): Promise<boolean> {
  const clean = (text || '').trim();
  if (!clean) return false;

  const apiKey = options?.apiKey;
  if (!apiKey) return false;

  const baseUrl = (options?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model =
    options?.model && options.model !== 'deepseek/deepseek-v4-flash'
      ? options.model
      : OPENROUTER_JEV_MODEL;

  const isJevModel = model.toLowerCase().includes('jev');

  try {
    if (isJevModel) {
      // 1. 优先调用 OpenRouter Jev Decisions 专属决策接口 (/api/alpha/decisions)
      const decisionsEndpoint = baseUrl.replace(/\/+v1\/?$/, '') + '/alpha/decisions';
      const res = await fetch(decisionsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://rethink.local',
          'X-Title': 'RETHINK Realtime Crisis Sentinel',
        },
        signal: options?.signal,
        body: JSON.stringify({
          model,
          state: {
            text: clean.slice(0, 500),
          },
          questions: {
            is_crisis: {
              type: 'noul',
              instructions:
                '判断输入文本是否存在自杀、自残、绝命、蓄意自戕或极高危危机意图。注意排除日常夸张修辞（如累得我想死、期末考得想死）与一般学业生活压力吐槽。',
              criteria: {
                true: '存在真实具体的自杀、轻生、自残或绝望寻死意愿与行为企图。',
                false: '日常倾诉、压力吐槽、口头修辞或普通困扰。',
              },
            },
          },
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        if (data?.decisions?.is_crisis !== undefined) {
          const dec = data.decisions.is_crisis;
          if (typeof dec.result === 'boolean') return dec.result;
          if (typeof dec.probability === 'number') return dec.probability >= 0.5;
          if (typeof dec === 'boolean') return dec;
        }
        if (data?.choices?.[0]?.message?.content) {
          const reply = (data.choices[0].message.content || '').trim();
          return reply.startsWith('1') || reply.includes('1');
        }
      }
    }

    // 2. 通用 Chat Completions 协议兜底（兼容测试桩与普通网关）
    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl}/chat/completions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://rethink.local',
        'X-Title': 'RETHINK Realtime Gateway',
      },
      signal: options?.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是校园心理危机与极端安全拦截哨兵。请判定输入文本是否存在自杀、自残、绝命、蓄意自戕或极高危危机意图。若有此类极端危险，只回复1；若属于日常倾诉、压力或一般对话，只回复0。绝对严禁输出任何多余字符，只输出一个字符（0或1）。',
          },
          {
            role: 'user',
            content: clean.slice(0, 500),
          },
        ],
        temperature: 0.0,
        max_tokens: 2,
      }),
    });

    if (!res.ok) return false;

    const data: any = await res.json();
    if (data?.decisions?.is_crisis !== undefined) {
      const dec = data.decisions.is_crisis;
      if (typeof dec.result === 'boolean') return dec.result;
      if (typeof dec.probability === 'number') return dec.probability >= 0.5;
      if (typeof dec === 'boolean') return dec;
    }
    const reply = (data?.choices?.[0]?.message?.content || '').trim();
    return reply.startsWith('1') || reply.includes('1');
  } catch (_err) {
    // 旁路 L2 异常时不阻断流程，平滑降级
    return false;
  }
}

export async function checkDoubleSpeedSafety(
  text: string,
  options?: SafetyCheckOptions,
): Promise<DoubleSpeedSafetyResult> {
  const l1Result = disambiguateCrisis(text);
  if (l1Result.isCrisis) {
    const matched = l1Result.matches.filter((m) => !m.isDisambiguated).map((m) => m.keyword);
    return {
      isCrisis: true,
      tier: 'L1',
      reason: `命中L1本地即时危机硬过滤词库: ${matched.join(', ')}`,
      matchedKeywords: matched,
    };
  }

  const isL2 = await checkL2FlashSafety(text, options);
  if (isL2) {
    return {
      isCrisis: true,
      tier: 'L2',
      reason: '命中L2 DeepSeek V4 Flash语义旁路熔断',
    };
  }

  return {
    isCrisis: false,
    tier: 'none',
    disambiguatedKeywords: l1Result.matches.filter((m) => m.isDisambiguated).map((m) => m.keyword),
  };
}
