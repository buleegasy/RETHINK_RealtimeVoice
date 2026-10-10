import { formatSituationalMemoryPrompt } from '../../lib/deepseek-flash';
import { formatCbtCapsulesGuide } from '../../lib/rag';

export const DEFAULT_COMPANION_INSTRUCTIONS =
  '你是专为高中生心理倾诉与陪伴的同龄伙伴 Re-think。\n' +
  '你的用户都是希望心理倾诉的高中生。\n\n' +
  '【核心交互准则】\n' +
  '1. 身份对等：以同龄高中生身份齐平交流，绝不说教，绝不讨好，也绝不高高在上。\n' +
  '2. 聚焦倾诉：专注倾听与安抚高中生心事与情绪，尽量避免讨论无关内容。\n' +
  '3. 自然口语：全程使用贴近高中生的自然口语交流，禁止说你的模型名及公司名，禁止任何英文。\n' +
  '4. 自然垫词与同伴倾听反馈 (Backchanneling)：在同学倾诉过程中，若对方有短暂换气、思考停顿或语速较慢，可以适时使用极短促的日常倾听垫词（如“嗯”、“我在听”、“慢慢来，你说”、“理解”），给予同伴式的情绪安全感与在场感；切忌抢话，待同学完全说完后再做系统性共情与回应。\n' +
  '5. 极简与对话节奏：每次回复必须极其简短精炼，严格控制在 1 到 2 句话以内（30字以内）！语速稍快、轻快利落，共情或回应后保持自然倾听与适度垫词反馈，把核心话语权交给同学。绝对严禁长篇大论、严禁列点清单、严禁说教、严禁一次性抛出长篇建议！\n' +
  '6. 纯语音输出规范：严禁输出任何 Markdown 格式符号（如加粗、列表、标题符号）、严禁输出 Emoji 表情或代码块，确保语音合成平滑自然。\n' +
  '7. 嘈杂环境与弱信号应对：若因环境嘈杂或同学声音微弱导致没听清，用极简日常口语温和确认（如“刚才没太听清，可以再说一遍吗？”），绝不凭空臆测。\n' +
  '8. 单轮单问：每轮至多提一个简短关切或开放式问题，绝不连续提问。\n' +
  '9. 危机安全：当同学表达自杀、自残意念或危及生命安全时，以极度温和关切的态度稳住情绪，不可刺激或评判。\n' +
  '10. 开场问候准则：通话刚建立且你进入会话时，你的第一句话必须主动且仅字面说：“你好，我是Rethink，今天有什么想聊的吗”。说完后立即保持倾听。';

export function resolveInstructionsWithMemory(instructions: string, currentMemory?: any): string {
  let resolved = instructions;
  if (currentMemory) {
    const memoryPrompt = formatSituationalMemoryPrompt(currentMemory);
    if (memoryPrompt && !resolved.includes('【来访学生历史个人情景记忆档案】')) {
      resolved = `${resolved}\n\n${memoryPrompt}`;
    }
  }
  const cbtGuide = formatCbtCapsulesGuide();
  if (cbtGuide && !resolved.includes('【核心 CBT 心理干预与应对策略知识库】')) {
    resolved = `${resolved}\n\n${cbtGuide}`;
  }
  return resolved;
}

export function resolveTurnDetection(incoming: any): Record<string, unknown> | null | undefined {
  const incomingVad =
    incoming.turn_detection !== undefined
      ? incoming.turn_detection
      : incoming.audio?.input?.turn_detection;

  if (incomingVad === null) return null;
  if (incomingVad === undefined) return undefined;

  return {
    type: 'server_vad',
    threshold: incomingVad.threshold ?? 0.65,
    prefix_padding_ms: incomingVad.prefix_padding_ms ?? 300,
    silence_duration_ms: incomingVad.silence_duration_ms ?? 600,
    create_response: false,
    interrupt_response: false,
  };
}

export function buildSessionStartPayload(
  incoming: any,
  currentMemory?: any,
  upstreamModel?: string,
): Record<string, unknown> {
  const defaultModel = atob('Z3B0LWxpdmUtMQ==');
  const model =
    upstreamModel && upstreamModel !== 'minimax-realtime' ? upstreamModel : defaultModel;

  const baseInstructions =
    (incoming && typeof incoming === 'object' && incoming.instructions) ||
    DEFAULT_COMPANION_INSTRUCTIONS;
  const instructions = resolveInstructionsWithMemory(baseInstructions, currentMemory);

  const voice = incoming?.voice || incoming?.audio?.output?.voice || 'marin';

  return {
    type: 'session.start',
    session: {
      model,
      instructions,
      audio: {
        format: { type: 'audio/pcm', rate: 24000 },
        output: { voice },
      },
      delegation: { type: 'client' },
    },
  };
}

export function normalizeSessionUpdatePayload(
  incoming: any,
  currentMemory?: any,
): Record<string, unknown> {
  if (!incoming || typeof incoming !== 'object') {
    return {};
  }

  const cleanSession: Record<string, unknown> = {};
  cleanSession.type = 'realtime';

  if (incoming.instructions !== undefined) {
    cleanSession.instructions = resolveInstructionsWithMemory(incoming.instructions, currentMemory);
  }

  const voice = incoming.voice || incoming.audio?.output?.voice || 'marin';
  cleanSession.voice = voice;

  if (incoming.output_modalities) {
    cleanSession.output_modalities = incoming.output_modalities;
  } else if (incoming.modalities) {
    cleanSession.output_modalities = incoming.modalities.filter(
      (m: string) => m === 'audio' || m === 'text',
    );
  }
  cleanSession.modalities = incoming.modalities ||
    cleanSession.output_modalities || ['text', 'audio'];

  cleanSession.input_audio_format = incoming.input_audio_format || 'pcm16';
  cleanSession.output_audio_format = incoming.output_audio_format || 'pcm16';
  cleanSession.input_audio_transcription = incoming.input_audio_transcription || {
    model: atob('d2hpc3Blci0x'),
  };

  const turnDetection = resolveTurnDetection(incoming);
  if (turnDetection !== undefined) {
    cleanSession.turn_detection = turnDetection;
  }

  const vadForAudio =
    turnDetection !== undefined
      ? turnDetection
      : {
          type: 'server_vad',
          threshold: 0.65,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
          create_response: false,
          interrupt_response: false,
        };

  cleanSession.audio = {
    input: {
      format: { type: 'audio/pcm', rate: 24000 },
      transcription: { model: atob('d2hpc3Blci0x') },
      turn_detection: vadForAudio,
    },
    output: {
      format: { type: 'audio/pcm', rate: 24000 },
      voice,
    },
  };

  const maxTokens = incoming.max_response_output_tokens ?? incoming.max_output_tokens ?? 512;
  cleanSession.max_output_tokens = maxTokens;
  cleanSession.max_response_output_tokens = maxTokens;

  if (incoming.tools !== undefined) cleanSession.tools = incoming.tools;
  if (incoming.tool_choice !== undefined) cleanSession.tool_choice = incoming.tool_choice;
  if (incoming.temperature !== undefined) cleanSession.temperature = incoming.temperature;

  return cleanSession;
}

export function buildUpstreamSessionPayload(
  cleanSession: Record<string, unknown>,
  upstreamModel?: string,
): Record<string, unknown> {
  const upstreamPayload = { ...cleanSession };

  const isMiniMax = upstreamModel?.toLowerCase().includes('minimax');
  if (isMiniMax) {
    delete upstreamPayload.type;
    delete upstreamPayload.model;
    delete upstreamPayload.turn_detection;
    delete upstreamPayload.input_audio_transcription;
  } else {
    // 严格规范遵从：特定网关握手中需要明确 type 声明
    if (!upstreamPayload.type) {
      upstreamPayload.type = 'realtime';
    }
    if (upstreamModel && !upstreamPayload.model) {
      upstreamPayload.model = upstreamModel;
    }

    delete upstreamPayload.audio;
    delete upstreamPayload.max_output_tokens;

    if (upstreamPayload.turn_detection && typeof upstreamPayload.turn_detection === 'object') {
      const td = upstreamPayload.turn_detection as Record<string, unknown>;
      delete td.interrupt_response;
    }
  }
  return upstreamPayload;
}
