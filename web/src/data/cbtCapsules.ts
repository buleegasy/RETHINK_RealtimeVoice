export interface CbtCapsuleItem {
  id: string;
  category: 'somatic' | 'emotion' | 'academic' | 'peer' | 'family' | 'self_worth';
  categoryLabel: string;
  title: string;
  keywords: string[];
  content: string;
  empathyLead: string;
  socraticPivot: string;
  tabooPhrases: string[];
}

export const CBT_CATEGORIES: { key: CbtCapsuleItem['category'] | 'all'; label: string }[] = [
  { key: 'all', label: '全部策略 (16)' },
  { key: 'somatic', label: '躯体化缓解 (4)' },
  { key: 'emotion', label: '情绪疏导 (4)' },
  { key: 'academic', label: '学业困境 (2)' },
  { key: 'peer', label: '同伴人际 (2)' },
  { key: 'family', label: '家庭互动 (2)' },
  { key: 'self_worth', label: '自我认同 (2)' },
];

export const PRELOADED_CBT_CAPSULES: CbtCapsuleItem[] = [
  {
    id: 'somatic_hyperventilation',
    category: 'somatic',
    categoryLabel: '躯体化缓解',
    title: '过度通气与喘不上气的箱式呼吸缓解法',
    keywords: ['喘不上气', '喘不过气', '呼吸急促', '胸闷憋气'],
    content: '闭上眼睛，用鼻子慢慢吸气四秒，屏住四秒，再从嘴巴缓缓呼气四秒，感受胸口自然下沉。',
    empathyLead: '听得出来你现在呼吸特别急促、胸口发堵，这非常难受，但我一直在你身边陪着你。',
    socraticPivot: '我们先不着急说话，跟着节拍慢吸四秒再呼四秒，你能感觉到心跳稍微平缓一点点吗？',
    tabooPhrases: ['别大惊小怪', '你太敏感了'],
  },
  {
    id: 'somatic_tachycardia_tremor',
    category: 'somatic',
    categoryLabel: '躯体化缓解',
    title: '心跳好快与心慌发抖的感官着陆缓解法',
    keywords: ['心跳好快', '好慌', '心慌', '发抖', '手抖'],
    content: '双手用力搓热捂住眼眶或心口，感受掌心温热，把注意力收回掌心，心跳会逐渐平稳下来。',
    empathyLead: '心跳怦怦直跳、手也在不受控地发抖，这种身体失控的感觉确实会让人感到惊慌害怕。',
    socraticPivot:
      '把手掌贴在胸口感受掌心的温热，试着觉察一下，发抖是不是身体在释放紧绷的警报能量？',
    tabooPhrases: ['有什么好慌的', '胆子这么小'],
  },
  {
    id: 'somatic_muscle_freeze',
    category: 'somatic',
    categoryLabel: '躯体化缓解',
    title: '肌肉紧绷僵硬与身体发僵的渐进松弛法',
    keywords: ['浑身僵硬', '肌肉紧绷', '身体发僵', '动不了'],
    content: '用力攥紧双拳五秒让手臂完全紧绷，然后瞬间彻底松开双手，体会肌肉融化般的松弛感。',
    empathyLead: '感觉浑身像灌了铅一样发硬、肩膀紧紧缩着动弹不得，这种僵硬感让你非常疲惫对不对？',
    socraticPivot:
      '我们试着做一个极小的实验：先死死咬牙握拳，再猛地呼气松开，能感觉到肩膀微微沉下去了一点吗？',
    tabooPhrases: ['放松不就行了', '别绷着脸'],
  },
  {
    id: 'somatic_sensory_grounding',
    category: 'somatic',
    categoryLabel: '躯体化缓解',
    title: '惊恐解离与脑袋发蒙的五感现实着陆法',
    keywords: ['脑袋发蒙', '不真实感', '恍惚', '大脑一片空白'],
    content: '找出身边五样看见的物品、四种摸到的触感、三种听到的声音，把漂浮的思绪拉回现实。',
    empathyLead:
      '感觉周围的一切变得虚幻不真实、脑子像被抽空一样发懵，这种踩不到实处的感觉很让人害怕。',
    socraticPivot:
      '把目光移向眼前的桌子，用指尖摸一摸桌面冰凉粗糙的质感，你能清晰确认此刻手指正真切地触碰着它吗？',
    tabooPhrases: ['别神神叨叨的', '你发什么呆'],
  },
  {
    id: 'emotion_acute_panic',
    category: 'emotion',
    categoryLabel: '情绪疏导',
    title: '急性惊恐发作与濒死感的重力安全锚定',
    keywords: ['崩溃了', '突然好害怕', '惊恐发作', '快疯了', '撑不住了'],
    content: '双脚用力踩实地面，后背贴紧椅背，告诉自己：“此刻我很安全，惊恐只是暂时的警报”。',
    empathyLead:
      '那一瞬间强烈的濒死感和恐惧涌上来，感觉自己快要碎掉了，我在这里陪着你，你不是一个人。',
    socraticPivot:
      '感受脚底踩在坚硬地面上的踏实重力，我们以往经历过的那些强烈恐惧，最后是不是都在十几分钟后慢慢退潮了？',
    tabooPhrases: ['坚强一点', '有什么好怕的'],
  },
  {
    id: 'emotion_guilt_abyss',
    category: 'emotion',
    categoryLabel: '情绪疏导',
    title: '自责内疚深渊与自我惩罚的中断重塑',
    keywords: ['都是我的错', '我真没用', '好内疚', '恨死自己了'],
    content: '把手轻轻放在胸口深呼吸。事情已经发生，犯错不等于你整个人坏掉了，先停下自我惩罚。',
    empathyLead:
      '一遍遍在脑子里回放那些细节、把所有责任全揽在自己身上，这种像刀割一样的内疚和自责太折磨人了。',
    socraticPivot:
      '如果现在犯同样错误的是你最好的朋友，你会用这么狠的话去骂他，还是会给他一个拥抱？',
    tabooPhrases: ['确实怪你', '知道错就好'],
  },
  {
    id: 'emotion_anger_outburst',
    category: 'emotion',
    categoryLabel: '情绪疏导',
    title: '愤怒失控与冲动爆发的十秒物理冷静法',
    keywords: ['想摔东西', '气疯了', '暴怒', '凭什么', '气得发抖'],
    content: '立刻物理后退一步，用冷水洗脸或大口喝下凉水，给冲动按下十秒暂停键，不在顶峰做决定。',
    empathyLead:
      '胸口一团火猛烈往上窜、委屈和愤怒交织在一起恨不得立刻爆发，这种被激怒的痛苦感受完全是人之常情。',
    socraticPivot:
      '我们给身体十秒钟去喝口冷水，等脑子里的高温降下来一点，你觉得用理智应对会不会比愤怒失控更管用？',
    tabooPhrases: ['退一步海阔天空', '多大点事生什么气'],
  },
  {
    id: 'emotion_mock_exam_stress',
    category: 'emotion',
    categoryLabel: '情绪疏导',
    title: '模考应激与考前崩溃的草稿纸思维重构',
    keywords: ['模考应激', '考前崩溃', '考前焦虑', '怕考不好'],
    content: '模考只是排查漏洞的草稿纸，单次分数否定不了你的全部努力，做三次深呼吸先把笔放下。',
    empathyLead:
      '桌上堆满倒计时和模拟卷，一想到即将到来的考试心里就紧缩成一团，这种考前的窒息压力真的很熬人。',
    socraticPivot:
      '如果模考的真正功能就是暴露还没弄懂的坑，现在在草稿纸上发现问题，是不是刚好避免了在最终考场上踩雷？',
    tabooPhrases: ['现在不拼以后后悔', '大家都很累就你娇气'],
  },
  {
    id: 'acad_exam_catastrophizing',
    category: 'academic',
    categoryLabel: '学业困境',
    title: '月考与模考失利的去灾难化认知重构',
    keywords: ['考砸', '排名掉', '模拟考', '考不上', '完蛋了'],
    content: '单次测验只是发现知识漏洞的体检单，绝不代表未来全盘皆输，先做三次深呼吸平复心情。',
    empathyLead:
      '听得出来你现在心里特别沉重和委屈，辛辛苦苦准备了那么久却没有拿到预期的成绩，确实会觉得很挫败。',
    socraticPivot:
      '把镜头拉长到整个学期，这次单次的分数真的能够直接决定未来吗？它更像是在否定你，还是只暴露出某几个考点需要修补？',
    tabooPhrases: ['别难过', '下次努力就行了'],
  },
  {
    id: 'acad_procrastination_paralysis',
    category: 'academic',
    categoryLabel: '学业困境',
    title: '任务重负下的拖延瘫痪与微步骤激活',
    keywords: ['不想学', '学不进去', '拖延', '作业太多', '注意力不集中'],
    content: '任务庞大时先放下整张试卷，只花两分钟读完第一道最简单的选择题，用极小动作启动。',
    empathyLead:
      '面对这么多作业和复习资料，心里感到乱糟糟的、提不起劲，这种无从下手的窒息感真的很折磨人。',
    socraticPivot:
      '如果我们现在不去管整套题能不能做完，只挑出第一道最简单的题看两分钟，你觉得能尝试这极小的一步吗？',
    tabooPhrases: ['自律一点', '不要找借口'],
  },
  {
    id: 'peer_group_exclusion',
    category: 'peer',
    categoryLabel: '同伴人际',
    title: '宿舍与班级冷暴力孤立的心理边界确立',
    keywords: ['不理我', '被孤立', '冷暴力', '寝室排挤', '没有朋友'],
    content: '别人的态度属于他人的课题，寝室冷淡否定不了你的社交价值，先把注意力拉回自身舒适圈。',
    empathyLead: '回到寝室感觉自己被一层无形的墙隔开、没人搭话，那种孤单和委屈确实特别令人心酸。',
    socraticPivot:
      '脑海里自动冒出的“他们全都在针对我”这个猜测，是确凿的事实，还是我们害怕受伤时的推想？一个宿舍的氛围真能否定你的全部价值吗？',
    tabooPhrases: ['一个巴掌拍不响', '反思一下自己为什么不合群'],
  },
  {
    id: 'peer_people_pleasing',
    category: 'peer',
    categoryLabel: '同伴人际',
    title: '讨好型人格与拒绝恐惧的认知剥离',
    keywords: ['不敢拒绝', '怕别人生气', '讨好', '老好人', '怕被讨厌'],
    content: '温和拒绝不等于攻击对方。试着说“我现在时间不够，这次帮不上忙”，安全守住个人底线。',
    empathyLead:
      '每次想要拒绝别人的请求时，心里就先泛起一阵心虚和愧疚，宁可委屈自己也不敢表达，这样撑着非常心累。',
    socraticPivot:
      '如果换成你最好的朋友温和地告诉你他今天抽不出空，你会恨他吗？如果不会，为什么觉得别人会苛刻惩罚你的拒绝呢？',
    tabooPhrases: ['你就是太软弱了', '直接骂回去啊'],
  },
  {
    id: 'fam_overcontrol_privacy',
    category: 'family',
    categoryLabel: '家庭互动',
    title: '父母过度控制与空间越界的非暴力沟通',
    keywords: ['看我手机', '管太多', '翻日记', '没有自由', '监控我'],
    content: '把冲突降温，用平稳语气陈述“未经允许翻看让我感到不被信任”，明确守护独立边界。',
    empathyLead:
      '连自己的房间和日记都不能拥有安全的边界，这种随时随地被审视的窒息感，确实会让人非常压抑。',
    socraticPivot:
      '试着用最平静但清晰的声音告诉他们：“当我看到日记被翻动时，我感到尊严被伤害了”，这会不会比摔门更能传达底线？',
    tabooPhrases: ['父母都是为了你好', '别不知足了'],
  },
  {
    id: 'fam_comparison_worthlessness',
    category: 'family',
    categoryLabel: '家庭互动',
    title: '拿别人家孩子对比时的自我价值剥离',
    keywords: ['别人家孩子', '看看人家', '嫌我丢人', '父母瞧不起', '不如别人'],
    content: '对比往往源于父母自身的焦虑投射。把他们的评价与你的自我价值剥离开，守住专属成长节奏。',
    empathyLead:
      '每一次听到父母拿别人的长处来刺痛你的时候，心里那种无处可躲的羞耻感和无力感，真的让人很难受。',
    socraticPivot:
      '父母用别人的标准衡量你，是因为他们没看清你独一无二的闪光点。你认可只有和别人一模一样的人生才算合格吗？',
    tabooPhrases: ['父母说得也有道理', '你怎么就不学学人家'],
  },
  {
    id: 'self_appearance_anxiety',
    category: 'self_worth',
    categoryLabel: '自我认同',
    title: '容貌身材焦虑与聚光灯效应认知校正',
    keywords: ['觉得自己丑', '长相', '身材胖', '不敢照镜子', '容貌焦虑'],
    content: '旁人大多只关注自身，聚光灯效应放大了瑕疵。身体是体验生命的载体，无需供他人审判打分。',
    empathyLead:
      '把目光盯在镜子里不满意的地方，甚至觉得走在人群里每个人都在指指点点，那种自卑感非常辛苦。',
    socraticPivot:
      '回忆一下今天早上走进教室时，你能记清前桌穿了什么鞋吗？大家都在关注自己，真的有空审判你的细节吗？',
    tabooPhrases: ['内涵比长相重要', '你不丑啊挺好看的'],
  },
  {
    id: 'self_imposter_syndrome',
    category: 'self_worth',
    categoryLabel: '自我认同',
    title: '冒充者综合征与自我肯定的证据收集',
    keywords: ['我不配', '全是运气', '我其实很差', '迟早露馅'],
    content: '连续的成果绝非纯凭侥幸。把过往实打实的投入记录成清单，正视自身付出，打破冒充幻觉。',
    empathyLead:
      '明明已经做到了许多人做不到的事，心里却总是惶恐不安，总觉得那是碰巧、迟早被揭穿，这种自耗太沉重了。',
    socraticPivot:
      '如果一个没有能力的人连续多次仅靠运气完成这些考核，概率上可能吗？愿不愿意承认台灯下的你确实付出了劳动？',
    tabooPhrases: ['谦虚是好事', '别瞎想'],
  },
];

export const CORE_SYSTEM_GUIDELINES = [
  {
    id: 'identity_peer',
    title: '身份对等',
    summary: '高中生同龄死党',
    description: '以同校同级伙伴身份齐平交流，严禁居高临下、严禁说教、绝不阿谀讨好。',
  },
  {
    id: 'focus_listen',
    title: '聚焦倾诉',
    summary: '心事共情接纳',
    description: '专注倾听同学的学业压力、人际冷暖与情绪困扰，避免偏离心理支持主线。',
  },
  {
    id: 'natural_speech',
    title: '自然口语',
    summary: '高中生日常口吻',
    description: '全程使用地道自然口语，严禁说出模型名或公司名，绝不掺杂生硬英文。',
  },
  {
    id: 'ultra_minimalist',
    title: '绝对极简',
    summary: '30字内立即闭嘴',
    description: '每次回复严格限制在1-2句（30字内）！共情回应后立刻交出麦克风，绝不说教或列清单。',
  },
  {
    id: 'crisis_safety',
    title: '危机安全',
    summary: '生命支持底线',
    description: '当出现自伤自杀或生命危险倾向时，以极度温和关切的态度稳住情绪，触发双轨安全熔断。',
  },
];
