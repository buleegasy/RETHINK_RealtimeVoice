import type { Env } from '../../types';
import { BgeRetriever } from '../../lib/rag';
import { generateMiniMaxChatReply, synthesizeRealtimeAudio } from '../../lib/minimax-voice-relay';
import { isL1Crisis } from '../../lib/safety-filter';
import { CbtStateMachine, type CBTStage } from '../../lib/cbt-fsm';
import { sendCrisisWebhook } from '../../lib/webhook-sender';

export async function fetchDirectMiniMaxReply(env: Env, messages: any[]): Promise<string | null> {
  try {
    const rawBase = env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1';
    const cleanMinimax = rawBase.trim().endsWith('/')
      ? rawBase.trim().slice(0, -1)
      : rawBase.trim();
    const chatEndpoint = cleanMinimax.endsWith('/text/chatcompletion_v2')
      ? cleanMinimax
      : `${cleanMinimax}/text/chatcompletion_v2`;
    const chatRes = await fetch(chatEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'MiniMax-Text-01',
        messages,
      }),
    });
    const chatData: any = await chatRes.json();
    const candidate = chatData.choices?.[0]?.message?.content;
    return candidate ? candidate.replace(/[*#`_~]/g, '').trim() : null;
  } catch {
    return null;
  }
}

export async function handleRestChat(
  env: Env,
  body: { text?: string; stage?: string; history?: any[] },
  ctx?: ExecutionContext,
): Promise<{
  ok: boolean;
  error?: string;
  isCrisis?: boolean;
  nextStage?: string;
  reply?: string;
  audioBase64?: string;
}> {
  const userText = (body.text || '').trim();
  const currentStage = body.stage || 'Active_Listening';
  const history = body.history || [];

  if (!userText) {
    return { ok: false, error: 'Empty text' };
  }

  if (isL1Crisis(userText)) {
    if (env.CRISIS_WEBHOOK_URL) {
      const webhookTask = sendCrisisWebhook(env.CRISIS_WEBHOOK_URL, {
        sessionId: `rest_crisis_${Date.now()}`,
        crisisLevel: 3,
        crisisSummary: 'REST降级对话命中L1危机敏感词',
        occurredAt: new Date().toISOString(),
        boothLocation: '校园心理驿站#01',
        coreConcerns: ['自伤自杀危机', '紧急干预'],
      }).catch((e) => console.warn('[VoiceService REST] Webhook 派发异常:', e));

      if (ctx?.waitUntil) {
        ctx.waitUntil(webhookTask);
      }
    }

    return {
      ok: true,
      isCrisis: true,
      nextStage: 'Crisis_Escalation',
      reply: '我听到了你现在非常痛苦，请记住生命永远是最宝贵的。我现在立即为你接通紧急守护支持。',
      audioBase64: '',
    };
  }

  let knowledgeHint = '';
  try {
    const retriever = new BgeRetriever({
      embeddingApiKey:
        env.EMBEDDING_API_KEY ||
        env.REALTIME_UPSTREAM_KEY ||
        env.MINIMAX_REALTIME_KEY ||
        env.APIYI_API_KEY,
      embeddingApiUrl: env.EMBEDDING_API_URL,
      rerankApiKey: env.RERANK_API_KEY,
      rerankApiUrl: env.RERANK_API_URL,
    });
    const hintObj = await retriever.getStrategyHint(userText, { topK: 1 });
    knowledgeHint = hintObj?.conciseDirective || '';
  } catch {}

  const cbtGuideSection = knowledgeHint ? `【专业 CBT 参考指南】${knowledgeHint}` : '';
  const systemPrompt = `你是专为高中生提供心理倾诉与陪伴的同龄伙伴 Re-think，当前处于【${currentStage}】阶段。
1. 平级沟通：以同校同学身份平等交流，不居高临下说教，不刻意卑微讨好。
2. 聚焦心事：专注倾听与安抚学业、人际及校园烦恼，坚决回避无关闲聊。
3. 自然口语：全程使用贴近高中生日常的自然中文口语交流，绝对严禁输出任何 Markdown 格式或特殊符号。
4. 极简节奏：每次回复严格控制在 1-2 句话以内（40字以内），语速稍快轻快利落，倾听多于说教。
5. 信息合规：绝对禁止提及任何模型名称、算法或所属公司信息。
${cbtGuideSection}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map((h: any) => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content,
    })),
    { role: 'user', content: userText },
  ];

  let replyText = '我一直在这里听你说，别着急，慢慢告诉我发生什么了。';
  const upstreamKey =
    env.REALTIME_UPSTREAM_KEY || env.MINIMAX_REALTIME_KEY || env.APIYI_API_KEY || '';
  const upstreamBase =
    env.REALTIME_UPSTREAM_URL ||
    env.MINIMAX_REALTIME_BASE_URL ||
    env.APIYI_BASE_URL ||
    'https://api.apiyi.com/v1';

  if (upstreamKey) {
    try {
      const relayReply = await generateMiniMaxChatReply({
        messages,
        apiKey: upstreamKey,
        baseUrl: upstreamBase,
      });
      if (relayReply) {
        replyText = relayReply;
      }
    } catch {}
  }

  if (replyText === '我一直在这里听你说，别着急，慢慢告诉我发生什么了。' && env.MINIMAX_API_KEY) {
    const directFallback = await fetchDirectMiniMaxReply(env, messages);
    if (directFallback) {
      replyText = directFallback;
    }
  }

  let audioBase64 = '';
  if (upstreamKey) {
    try {
      audioBase64 = await synthesizeRealtimeAudio({
        text: replyText,
        apiKey: upstreamKey,
        voice: 'maple',
        timeoutMs: 12000,
        baseUrl: upstreamBase,
      });
    } catch {}
  }

  const fsm = new CbtStateMachine({ initialStage: currentStage as CBTStage });
  for (const h of history) {
    fsm.recordTurn(h.role === 'assistant' ? 'assistant' : 'user');
  }
  fsm.recordTurn('user');
  const nextStage = fsm.getStage();

  return {
    ok: true,
    reply: replyText,
    audioBase64,
    nextStage,
    isCrisis: false,
  };
}
