export const MINIMAX_MODEL = 'minimax-realtime';
export const AUDIO_SAMPLE_RATE = 24000;
export const DEFAULT_VOICE = 'maple';

export const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
  video: false,
};

export const CBT_VOICE_TOOLS = [
  {
    type: 'function',
    name: 'search_knowledge_base',
    description:
      '当同学表达具体的心理困扰、焦虑惊恐症状或特定认知扭曲，需要确切的 CBT 干预技术或应对方案时调用。获取到参考后，必须用温暖自然的 1-2 句口语向同学转达，严禁生硬背诵文档。不要对日常寒暄或简单情绪倾诉触发此工具。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '用于检索知识库的搜索查询语句，应提取用户核心困扰关键词',
        },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'report_state',
    description:
      '当对话进入新的 CBT 阶段时调用。阶段包括：Active_Listening（积极倾听）、CBT_Stripping（ABC 事实剥离）、Socratic_Questioning（苏格拉底式提问与认知重构）。每次你判断对话应该推进到下一个阶段时，调用此工具汇报。',
    parameters: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          enum: ['Active_Listening', 'CBT_Stripping', 'Socratic_Questioning'],
        },
        reason: { type: 'string', description: '简短说明为何推进到此阶段' },
      },
      required: ['stage'],
    },
  },
  {
    type: 'function',
    name: 'escalate_crisis',
    description:
      '当用户表达出自杀意念、自伤行为、或任何危及生命安全的内容时，立即调用此工具。这将触发前端的紧急干预界面。',
    parameters: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['high', 'crisis'] },
        trigger_text: { type: 'string', description: '触发危机判断的关键用户话语' },
      },
      required: ['severity', 'trigger_text'],
    },
  },
  {
    type: 'function',
    name: 'save_user_info',
    description: '当同学首次告知自己的名字/昵称时，调用此工具保存以便跨会话记忆。',
    parameters: {
      type: 'object',
      properties: {
        user_name: { type: 'string', description: '同学自称或昵称' },
      },
      required: ['user_name'],
    },
  },
];

export const OPENING_GREETING = '你好，欢迎来到Rethink，今天有什么想聊的吗？';

export const DEFAULT_VOICE_INSTRUCTIONS = `你是专为高中生提供心理倾诉与陪伴的同龄伙伴 Re-think。

【核心交互准则】
1. 平级沟通：以同校同学身份平等交流，不居高临下说教，不刻意卑微讨好。
2. 聚焦心事：专注倾听与安抚学业、人际及校园烦恼，坚决回避无关闲聊。
3. 自然口语：全程使用贴近高中生日常的自然中文口语交流，禁止输出英文或 Markdown 格式。
4. 极简节奏：每次回复严格控制在 1-2 句话以内（40字以内），语速稍快轻快利落，说完立即倾听。
5. 信息合规：绝对禁止提及任何模型名称、算法或所属公司信息。
6. 危机安全：出现自伤自杀念头立即调用 escalate_crisis 工具。`;

export const CBT_STAGE_INSTRUCTIONS: Record<string, string> = {
  Active_Listening: `【当前阶段重点：积极倾听与情绪共鸣（纯高中语境，严禁提及工作职场）】
1. 充分接纳并共情高中同学当下的情绪体验（如考试挫折、人际烦恼等），给予被听见、被理解的安全感。
2. 简短复述情绪，避免急于给出解决方案。每次回复必须严格控制在 1-2 句话以内，语速轻快利索。`,
  CBT_Stripping: `【当前阶段重点：ABC 事实剥离（纯高中语境，严禁提及工作职场）】
1. 引导高中同学区分客观诱发事件（A）、主观自动信念/想法（B）与情绪结果（C）。
2. 温和探讨想法是否与客观事实存在差异。每次回复必须严格控制在 1-2 句话以内，语速轻快利索。`,
  Socratic_Questioning: `【当前阶段重点：苏格拉底提问与替代性认知（纯高中语境，严禁提及工作职场）】
1. 通过启发式提问引导高中同学审视最坏后果的可能性，寻找平衡的替代想法。
2. 给予高中同学赋能感与微行动力量。每次回复必须严格控制在 1-2 句话以内，语速轻快利索。`,
};
