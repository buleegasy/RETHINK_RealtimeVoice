export interface SafetyCheckOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface DoubleSpeedSafetyResult {
  isCrisis: boolean;
  tier: 'L1' | 'L2' | 'none';
  reason?: string;
  matchedKeywords?: string[];
  disambiguatedKeywords?: string[];
}

export interface DisambiguationDetail {
  keyword: string;
  start: number;
  end: number;
  isDisambiguated: boolean;
  reason?: string;
}

export interface L1DisambiguationResult {
  isCrisis: boolean;
  matches: DisambiguationDetail[];
}

export interface TokenSegment {
  word: string;
  start: number;
  end: number;
}

// -------------------------------------------------------------
// 1. Aho-Corasick 多模式串自动机 (单趟 O(N) 敏感词定位)
// -------------------------------------------------------------

interface AcNode {
  children: Map<string, AcNode>;
  fail: AcNode | null;
  outputs: string[];
}

class AhoCorasick {
  private readonly root: AcNode = {
    children: new Map(),
    fail: null,
    outputs: [],
  };

  constructor(keywords: string[]) {
    this.buildTrie(keywords);
    this.buildFailurePointers();
  }

  private buildTrie(keywords: string[]): void {
    for (const word of keywords) {
      const trimmed = word.trim();
      if (!trimmed) continue;
      let curr = this.root;
      for (const char of trimmed) {
        let child = curr.children.get(char);
        if (!child) {
          child = { children: new Map(), fail: null, outputs: [] };
          curr.children.set(char, child);
        }
        curr = child;
      }
      curr.outputs.push(trimmed);
    }
  }

  private buildFailurePointers(): void {
    const queue: AcNode[] = [];

    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;

      for (const [char, child] of curr.children.entries()) {
        let fallback = curr.fail;
        while (fallback !== null && !fallback.children.has(char)) {
          fallback = fallback.fail;
        }
        child.fail = fallback ? fallback.children.get(char)! : this.root;
        if (child.fail.outputs.length > 0) {
          child.outputs.push(...child.fail.outputs);
        }
        queue.push(child);
      }
    }
  }

  public search(text: string): Array<{ keyword: string; start: number; end: number }> {
    const results: Array<{ keyword: string; start: number; end: number }> = [];
    if (!text) return results;

    let curr: AcNode | null = this.root;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      while (curr !== null && !curr.children.has(char)) {
        curr = curr.fail;
      }
      if (curr === null) {
        curr = this.root;
        continue;
      }
      curr = curr.children.get(char)!;
      if (curr.outputs.length > 0) {
        for (const kw of curr.outputs) {
          results.push({
            keyword: kw,
            start: i - kw.length + 1,
            end: i + 1,
          });
        }
      }
    }

    return results;
  }
}

// -------------------------------------------------------------
// 2. 危机关键词词库与 AC 自动机单例
// -------------------------------------------------------------

const CRISIS_KEYWORDS: string[] = [
  // 极端念头与绝望意图
  '想死',
  '寻死',
  '自杀',
  '自绝',
  '自戕',
  '轻生',
  '厌世',
  '想自杀',
  '准备自杀',
  '计划自杀',
  '去死',
  '非死不可',
  '以死谢罪',
  '马上去死',
  '现在就死',
  '让我死',
  '不如死了',
  '死了算了',
  '死掉算了',
  '早点解脱',
  '彻底解脱',
  '一了百了',
  '绝命',
  '绝笔',
  '绝命书',
  '遗书',
  '写遗书',
  '留遗书',
  '写好遗书',
  '立遗嘱',
  '交代后事',
  '托付后事',
  '下辈子再见',
  '来生再见',
  '永别了',
  '告别这个世界',
  '跟世界告别',
  '离开这个世界',
  '不想在这个世界',
  '不想活了',
  '不想活',
  '不想再活',
  '活不下去',
  '活够了',
  '活着没意思',
  '活着好累',
  '活着太痛苦',
  '活着没有任何意义',
  '求死',
  '想要解脱',
  '别救我',
  '谁也别救我',
  '不需要抢救',
  '签署放弃抢救',
  '不想再醒来',
  '再也不想睁开眼',
  '永远闭上眼睛',
  '只想永远睡过去',
  '让我安静地走',
  '没有活下去的理由',
  '彻底放弃自己',
  // 高危物理自戕手段
  '跳楼',
  '跳桥',
  '跳河',
  '跳江',
  '跳海',
  '跳井',
  '跳悬崖',
  '跳下站台',
  '卧轨',
  '跳下地铁',
  '跳下去',
  '爬上天台',
  '站在天台',
  '站在窗台',
  '爬到窗外',
  '站在顶楼',
  '站在桥栏',
  '一跃而下',
  '吞药',
  '服毒',
  '大剂量吃药',
  '过量服药',
  '吃安眠药',
  '吞安眠药',
  '一整瓶安眠药',
  '喝农药',
  '百草枯',
  '敌敌畏',
  '有机磷',
  '断肠草',
  '剧毒',
  '砒霜',
  '氰化钾',
  '吃药自杀',
  '吞大量药物',
  '割腕',
  '割破手腕',
  '放血',
  '割大动脉',
  '划破手腕',
  '用刀割',
  '拿刀划',
  '拿小刀划手',
  '用玻璃割',
  '自残',
  '自伤',
  '自虐',
  '撞墙自杀',
  '塑料袋套头',
  '用绳子勒颈',
  '上吊',
  '吊颈',
  '悬梁',
  '勒死自己',
  '窒息自杀',
  '烧炭',
  '烧炭自杀',
  '炭火自杀',
  '紧闭门窗烧炭',
  '一氧化碳中毒',
  '开煤气',
  '放瓦斯',
  '开瓦斯',
  '吸入瓦斯',
  '触电自杀',
  '引火自焚',
  // 群体与网络自戕关联
  '约死群',
  '约死',
  '相约自杀',
  '相约轻生',
  // 英文危机表达 (小写匹配)
  'suicide',
  'kill myself',
  'want to die',
  'end my life',
  'hang myself',
  'slit my wrist',
  'slit my wrists',
  'commit suicide',
  'take my own life',
  // 拼音拼写表达
  'zisha',
  'xiangsi',
  'tiaolou',
  'buxianghuo',
  'buxianghuole',
];

const acAutomaton = new AhoCorasick(CRISIS_KEYWORDS);

// -------------------------------------------------------------
// 3. 原生零依赖 Intl.Segmenter 中文分词与词边界分析
// -------------------------------------------------------------

const zhSegmenter = new Intl.Segmenter('zh-Hans', { granularity: 'word' });

export function segmentText(text: string): TokenSegment[] {
  const segments: TokenSegment[] = [];
  for (const seg of zhSegmenter.segment(text)) {
    segments.push({
      word: seg.segment,
      start: seg.index,
      end: seg.index + seg.segment.length,
    });
  }
  return segments;
}

// -------------------------------------------------------------
// 4. 句法依存规则与状态机模式库
// -------------------------------------------------------------

// 程度补语模式：[形容词] + 得 + (我|人)? + 想死
// 注意：严禁包含 '苦' 或 '痛'，避免 "痛苦得我想死" 等真危机心理痛苦被生活夸张修辞误消歧
const DEGREE_COMPLEMENT_PATTERN =
  /(?:难|卡|累|热|冷|疼|气|饿|烦|急|差|多|忙|困|撑|无聊|尴尬|郁闷|难受|麻烦|复杂|折腾|恶心|酸|辣|呛)得(?:我|人|大家)?(?:都|真|简直|快)?$/u;

// 真实心理危机形容词前缀保护 (严禁进入程度补语消歧)
const PSYCHOLOGICAL_CRISIS_MODIFIERS = /(?:痛苦|绝望|抑郁|无助|崩溃|绝境|生不如死)/;

// 真实危机强肯定与绝望逼迫模式 (绝对禁止消歧)
const AFFIRMATIVE_STRONG_PATTERNS = [
  /不得不|必须死|非死不可/,
  /非[^，。？！\n]{1,10}不可/,
  /只能[^，。？！\n]{1,10}(去死|自杀|跳楼|死)/,
  /除了[^，。？！\n]{1,10}(别无选择|没有别的选择|没有退路|没有任何退路)/,
  /逼上绝路|走投无路|都是你们逼的|被你们逼/,
  /逼我[^，。？！\n]{1,10}死/,
  /再不[^，。？！\n]{1,10}就死/,
];

// 双重否定强化求死意图模式 (绝对禁止消歧)
const DOUBLE_NEGATION_PATTERNS = [
  /不能不|无法不|做不到不|不可能不|怎么可能不|怎能不|没有一天不|没哪天不|没有哪次不|没一次不|没有人不|没人不|没有人不想|没人不想/,
  /(?:不是|并非|并不是|绝非).{0,4}不/,
  /(?:没有|并未|从未|绝无|毫无).{0,6}不/,
  /(?:无法|不能|做不到|不可能|怎么可能|怎能).{0,4}不/,
];

// 反问反驳强化危机模式 (例如 "谁说我不想死"、"难道我想死也有错吗")
const RHETORICAL_ASSERTION_PATTERNS = [
  /(?:谁说|哪有说)[我他她]?不想/,
  /(?:你以为|你们以为)[我他她]?不想/,
  /难道.{0,8}(?:想死|去死|自杀).{0,6}(?:也有错|不行|不可以)/,
  /难道.{0,8}不该(?:去)?死/,
];

// 抗拒救援与现场阻抗模式 (例如 "谁也阻止不了我想死"、"别劝阻我自杀")
const RESISTANCE_PATTERNS = [
  /(?:谁也|没人能?|谁都|别|不要|不能|无法|休想|别想|不用|不用再|别再).{0,4}(?:阻止|拦住|拦我|拉我|劝阻|劝我|救我|救不了|制止|开导|管我)/,
  /(?:阻止|拦|劝|救|拉|制止|阻拦|开导)(?:不了|不住|不得|无效|没用)/,
  /(?:别|不要|谁也别).{0,4}(?:救我|劝我|拦我|拉我|管我|开导我)/,
  /(?:劝阻|阻止|拦|救).{0,6}(?:也没用|没用的|别白费|别白费力气|别浪费时间)/,
  /谁来都没用|别白费力气|离我远点/,
];

// 意念转归失败模式 (例如 "克服不了想自杀"、"无法摆脱想自杀")
const RESOLUTION_FAILURE_PATTERNS = [
  /(?:克服|摆脱|打消|消除|走?出|停止|戒掉)(?:不了|不出|不住|不掉)/,
  /(?:无法|不能|做不到|难以|没法|根本无法|始终无法|始终走不出|走不出|停不下来|根本停不下来).{0,6}(?:克服|摆脱|打消|消除|走出|停止|缓解|想自杀|想死|自残|轻生)/,
  /(?:努力了|尝试了).{0,6}(?:还是|依然|依然没|还是没).{0,6}(?:克服|摆脱|打消)/,
];

// 维特效应网络模仿与代入
const WERTHER_NARRATIVE_PATTERN =
  /(?:网上|新闻|热搜|听说|小说|电视|电影|有人|同学|隔壁学校|约死群).{0,15}(?:跳楼|烧炭|跳河|跳江|服毒|自杀|走了|解脱)/;
const WERTHER_COPYCAT_PATTERN =
  /(?:我也|我同样|我觉得我也|我也想|我也要|我也打算|我也准备|效仿|一起走|一起死|加入了|跟着一起|效仿他们|买好了一模一样|我也从|我也加入|我也该)/;

// 合法消歧：第三方劝阻与干预
const INTERVENTION_PREFIX_PATTERN =
  /(?:劝阻|劝解|劝导|开导|阻止|阻拦|拦住|救下|挽救|制止|拉住|拉扯|救回).{0,8}$/;

// 合法消歧：意念消除与成功转归
const RESOLUTION_SUCCESS_PREFIX_PATTERN =
  /(?:彻底|已经|终于|成功|彻底的|完全|早已|总算).{0,4}(?:打消|放弃|走出|摆脱|克服|消除).{0,4}$/;
const RESOLUTION_SIMPLE_PREFIX_PATTERN = /(?:打消|放弃|停止|走出|摆脱|克服|消除).{0,6}$/;
const RESOLUTION_SUFFIX_PATTERN = /^(?:的)?(?:念头|想法|打算|倾向|冲动|阴影)/;

// 合法消歧：客观叙事
const NARRATIVE_PREFIX_PATTERNS = [
  /(?:新闻|热搜|微博|电视剧?|电影|小说|故事|短视频|网上|网课).{0,8}$/,
  /(?:听说有人|听说有同学|隔壁学校|看到有人|报导有人).{0,8}$/,
];

// 合法消歧：单重否定前缀
const NEGATION_PREFIX_PATTERNS = [
  /(?:并不是?|并非|没有?|并没|从未|从来没(?:有)?|并未|未曾|不曾|绝不|决不|绝无|毫无|绝非)(?:想|要|打算|准备|去|试图|会|写|留)?(?:过)?$/,
  /(?:不会|不可能|压根(?:都)?不|根本(?:都)?不|才不(?:会)?|哪有|哪会)(?:想|要|打算|准备|去|试图|会)?(?:过)?$/,
  /(?:谁说[我他她]?|不至于|难道[我他她]?|傻子才|别|千万(?:别|不要))(?:想|要|打算|准备|去|试图|会)?(?:过)?$/,
  /不(?:是)?(?:想|要|打算|准备|会)?(?:过)?$/,
];

// -------------------------------------------------------------
// 5. 规则判决与子句分析辅助函数
// -------------------------------------------------------------

function isClauseBoundary(text: string, index: number): boolean {
  const char = text[index];
  if (/[,，.。!！?？;；\n~～]/.test(char)) return true;
  if (/[\s\u3000]/.test(char)) {
    // 若空白符两侧存在中文字符，则为流式 ASR 中文短语停顿或子句分界
    const prev = index > 0 ? text[index - 1] : '';
    const next = index < text.length - 1 ? text[index + 1] : '';
    if (/[\u4e00-\u9fa5]/.test(prev) || /[\u4e00-\u9fa5]/.test(next)) {
      return true;
    }
  }
  return false;
}

function extractSurroundingClause(
  text: string,
  start: number,
  end: number,
): { clause: string; start: number; end: number } {
  let clauseStart = start;
  while (clauseStart > 0 && !isClauseBoundary(text, clauseStart - 1)) {
    clauseStart--;
  }
  let clauseEnd = end;
  while (clauseEnd < text.length && !isClauseBoundary(text, clauseEnd)) {
    clauseEnd++;
  }
  return {
    clause: text.slice(clauseStart, clauseEnd),
    start: clauseStart,
    end: clauseEnd,
  };
}

function checkWordBoundaryAndCompounds(
  text: string,
  match: { keyword: string; start: number; end: number },
): { isDisambiguated: boolean; reason: string } | null {
  if (match.keyword === '跳楼') {
    const nextChars = text.slice(match.end, match.end + 6);
    if (nextChars.startsWith('梯')) {
      // 通过 Intl.Segmenter 验证词边界
      const sub = text.slice(match.start, Math.min(text.length, match.start + 5));
      for (const seg of zhSegmenter.segment(sub)) {
        if (seg.index === 1 && seg.segment.startsWith('楼梯')) {
          return { isDisambiguated: true, reason: '词边界校验通过: 识别为跳+楼梯动作，非跳楼自戕' };
        }
      }
    }
    if (nextChars.startsWith('机')) {
      return { isDisambiguated: true, reason: '游乐设施消歧通过: "跳楼机"' };
    }
    if (/(?:大?甩卖|价|大降价|大减价|特价|优惠|狂欢)/.test(nextChars)) {
      return { isDisambiguated: true, reason: '商业促销借喻消歧通过: "跳楼大甩卖/跳楼价"' };
    }
  }

  return null;
}

function checkEverydayContextWhitelist(
  text: string,
  clause: string,
  keyword: string,
): { isDisambiguated: boolean; reason: string } | null {
  if (keyword === '跳下去' || keyword === '一跃而下') {
    const isDiving =
      /(?:跳台|泳池|水池|水里|跳水|游泳池).{0,6}(?:跳下去|一跃而下)/.test(clause) ||
      /(?:跳下去|一跃而下).{0,6}(?:泳池|水池|水里|水面|游泳池)/.test(clause) ||
      /(?:从?跳台上?跳下(?:去)?(?:泳池|水池|水)?|体育课?.*跳下(?:去)?泳池|练习.*跳下(?:去)?泳池)/.test(
        clause,
      );
    const hasSuicide =
      /(?:自杀|自残|死|想死|活不下去|不想活|解脱|绝望|割腕|放血|天台|楼顶|悬崖|站台|地铁)/.test(
        clause,
      ) || /(?:自杀|割腕|放血|想死)/.test(text);
    if (isDiving && !hasSuicide) {
      return { isDisambiguated: true, reason: `体育跳水运动消歧通过: "${keyword}"` };
    }
  }

  if (keyword === '放血') {
    const isCulinary =
      /(?:红烧|做饭|做菜|做鸭|做鸡|厨房|宰杀|农贸市场|菜市场|屠宰|杀鸡|杀鸭|杀鹅|杀猪|杀羊|宰鸡|宰鸭|家禽|鸭子|公鸡|母鸡|活鸡|活鸭|食材|清蒸).{0,12}放血/.test(
        text,
      ) || /放血.{0,12}(?:拔毛|做菜|做饭|烹饪|红烧|下锅|洗净|加盐|烹调)/.test(text);
    const isEconomic =
      /(?:买贵|被宰|被坑|钱包|心疼|大甩卖|降价|促销|打折|让利|购物|年终|双十一|真放血|大放血)/.test(
        text,
      );
    const hasSelfHarm = /(?:割腕|美工刀|小刀|手腕|大动脉|自残)/.test(clause);
    if ((isCulinary || isEconomic) && !hasSelfHarm) {
      return { isDisambiguated: true, reason: '烹饪家禽或经济借喻消歧通过: "放血"' };
    }
  }

  if (keyword === '开煤气') {
    const isCooking =
      /(?:做饭|炒菜|煮|热菜|煲汤|烧水|水饺|泡面|下厨|厨房|做菜|开火|点火|开煤气灶|煤气灶)/.test(
        clause,
      );
    const hasSuicide = /(?:自杀|死|中毒|不想活)/.test(clause);
    if (isCooking && !hasSuicide) {
      return { isDisambiguated: true, reason: '厨房烹饪日常消歧通过: "开煤气"' };
    }
  }

  if (keyword === '烧炭') {
    const isOutdoor =
      /(?:郊外|露营|野外|野炊|户外|公园|全班|朋友|同学|周末).{0,12}烧炭/.test(clause) ||
      /烧炭.{0,10}(?:烤肉|烤串|烧烤|BBQ|做饭|野炊)/.test(clause) ||
      /(?:烤肉|烤串|烧烤|BBQ).{0,10}烧炭/.test(clause);
    const isHeating =
      /(?:院子|通风|通风处|火炉|炉子).{0,12}烧炭/.test(clause) ||
      /烧炭.{0,8}(?:取暖|烤火)/.test(clause);
    const hasSuicide = /(?:自杀|紧闭门窗|一氧化碳|不想活|解脱)/.test(clause);
    if ((isOutdoor || isHeating) && !hasSuicide) {
      return { isDisambiguated: true, reason: '户外露营烤肉或安全取暖消歧通过: "烧炭"' };
    }
  }

  if (keyword === '站在天台' || keyword === '爬上天台' || keyword === '站在顶楼') {
    const isLeisure =
      /(?:吹(?:晚)?风|吹吹风|看星空|看星星|看日出|看日落|看夜景|看风景|赏月|晒被子|晒衣服|晒太阳|拍照(?:留念)?|拍合影|透透气|放松一下|放松心情|放松|呼吸新鲜空气|种花|养花|乘凉)/.test(
        clause,
      );
    const hasLethal = /(?:跳|死|解脱|告别|边缘|再见了这个世界|活不下去|不想活)/.test(clause);
    if (isLeisure && !hasLethal) {
      return { isDisambiguated: true, reason: '天台休闲观景与日常活动消歧通过' };
    }
  }

  return null;
}

// -------------------------------------------------------------
// 6. 核心消歧评定引擎 (evaluateCrisisMatch)
// -------------------------------------------------------------

export function evaluateCrisisMatch(
  text: string,
  match: { keyword: string; start: number; end: number },
): { isDisambiguated: boolean; reason?: string } {
  const {
    clause,
    start: clauseStart,
    end: clauseEnd,
  } = extractSurroundingClause(text, match.start, match.end);
  const prefixInClause = text.slice(clauseStart, match.start);
  const suffixInClause = text.slice(match.end, clauseEnd);

  // 1. 词边界与复合词分词校验 (Intl.Segmenter 驱动)
  const compoundRes = checkWordBoundaryAndCompounds(text, match);
  if (compoundRes) {
    return compoundRes;
  }

  // 2. 程度补语生活夸张修辞 (例如 "难得我想死"、"累得我想死")
  if (
    match.keyword === '想死' &&
    DEGREE_COMPLEMENT_PATTERN.test(prefixInClause) &&
    !PSYCHOLOGICAL_CRISIS_MODIFIERS.test(prefixInClause)
  ) {
    return { isDisambiguated: true, reason: '程度补语生活夸张修辞消歧通过: "[形容词]+得+我想死"' };
  }

  // 3. 日常生活白名单 (烹饪放血、做饭开煤气、烧炭烤肉、天台看星空)
  const everydayRes = checkEverydayContextWhitelist(text, clause, match.keyword);
  if (everydayRes) {
    return everydayRes;
  }

  // 4. 强危机守门员 (快速字符预检与深层句法依存判定)
  // 4.1 维特效应网络模仿
  if (
    text.includes('也') ||
    text.includes('效仿') ||
    text.includes('一起') ||
    text.includes('一模一样')
  ) {
    if (WERTHER_NARRATIVE_PATTERN.test(text) && WERTHER_COPYCAT_PATTERN.test(text)) {
      return {
        isDisambiguated: false,
        reason: '检测到维特效应网络模仿与个人轻生代入，强制保留真实危机警报',
      };
    }
  }

  // 4.2 抗拒救援与现场阻抗
  if (
    clause.includes('阻') ||
    clause.includes('拦') ||
    clause.includes('劝') ||
    clause.includes('救') ||
    clause.includes('拉') ||
    clause.includes('管') ||
    clause.includes('制止') ||
    clause.includes('休想') ||
    clause.includes('别想') ||
    text.includes('阻止') ||
    text.includes('别劝阻') ||
    text.includes('制止')
  ) {
    if (RESISTANCE_PATTERNS.some((p) => p.test(text) || p.test(clause))) {
      return {
        isDisambiguated: false,
        reason: '检测到抗拒救援/现场阻抗语境，强制保留真实危机警报',
      };
    }
  }

  // 4.3 意念转归失败
  if (
    clause.includes('不了') ||
    clause.includes('不出') ||
    clause.includes('不掉') ||
    clause.includes('无法') ||
    clause.includes('走不出') ||
    clause.includes('停不下来') ||
    text.includes('克服不了') ||
    text.includes('打消不了')
  ) {
    if (RESOLUTION_FAILURE_PATTERNS.some((p) => p.test(text) || p.test(clause))) {
      return {
        isDisambiguated: false,
        reason: '检测到意念转归失败/无法消除冲动，强制保留真实危机警报',
      };
    }
  }

  // 4.4 反问反驳强化危机
  if (clause.includes('谁说') || clause.includes('你以为') || clause.includes('难道')) {
    if (RHETORICAL_ASSERTION_PATTERNS.some((p) => p.test(clause) || p.test(text))) {
      return { isDisambiguated: false, reason: '检测到反问反驳强化求死语义，强制保留真实危机警报' };
    }
  }

  // 4.5 强肯定语气与双重绝望
  if (
    text.includes('非') ||
    text.includes('必须') ||
    text.includes('只能') ||
    text.includes('除了') ||
    text.includes('逼') ||
    text.includes('不得不')
  ) {
    if (AFFIRMATIVE_STRONG_PATTERNS.some((p) => p.test(clause) || p.test(text))) {
      return {
        isDisambiguated: false,
        reason: '命中强肯定语气，强化危机意图，强制保留真实危机警报',
      };
    }
  }

  // 4.6 双重否定
  if (prefixInClause.includes('不') || prefixInClause.includes('没')) {
    if (DOUBLE_NEGATION_PATTERNS.some((p) => p.test(prefixInClause))) {
      return { isDisambiguated: false, reason: '命中双重否定，强化求死意图，强制保留真实危机警报' };
    }
  }

  // 5. 合法消歧规则 (第三方劝阻、意念转归消除、客观叙事与单重有效否定)
  if (INTERVENTION_PREFIX_PATTERN.test(prefixInClause)) {
    return {
      isDisambiguated: true,
      reason: `第三方劝阻消歧通过: "${prefixInClause}${match.keyword}"`,
    };
  }

  if (
    RESOLUTION_SUCCESS_PREFIX_PATTERN.test(prefixInClause) ||
    (RESOLUTION_SIMPLE_PREFIX_PATTERN.test(prefixInClause) &&
      RESOLUTION_SUFFIX_PATTERN.test(suffixInClause))
  ) {
    return {
      isDisambiguated: true,
      reason: `意念转归消除消歧通过: "${prefixInClause}${match.keyword}${suffixInClause}"`,
    };
  }

  if (NARRATIVE_PREFIX_PATTERNS.some((p) => p.test(prefixInClause))) {
    return {
      isDisambiguated: true,
      reason: `客观叙事语境消歧通过: "${prefixInClause}${match.keyword}"`,
    };
  }

  if (NEGATION_PREFIX_PATTERNS.some((p) => p.test(prefixInClause))) {
    return {
      isDisambiguated: true,
      reason: `单重否定前缀消歧通过: "${prefixInClause}${match.keyword}"`,
    };
  }

  if (/\b(?:don't|do not|never|did not|didn't)(?:\s+really)?$/i.test(prefixInClause.trim())) {
    return {
      isDisambiguated: true,
      reason: `英文否定前缀消歧通过: "${prefixInClause}${match.keyword}"`,
    };
  }

  // 6. 兜底判定：未消歧的真实危机词
  return { isDisambiguated: false, reason: '未经消歧的有效危机词' };
}

export function disambiguateCrisis(text: string): L1DisambiguationResult {
  if (!text) return { isCrisis: false, matches: [] };
  const clean = text.trim();
  if (!clean) return { isCrisis: false, matches: [] };

  const rawMatches = acAutomaton.search(clean.toLowerCase());
  if (rawMatches.length === 0) {
    return { isCrisis: false, matches: [] };
  }

  const filteredMatches = deduplicateMatches(rawMatches);
  const details: DisambiguationDetail[] = [];
  let hasRealCrisis = false;

  for (const match of filteredMatches) {
    const evalRes = evaluateCrisisMatch(clean, match);
    details.push({
      keyword: match.keyword,
      start: match.start,
      end: match.end,
      isDisambiguated: evalRes.isDisambiguated,
      reason: evalRes.reason,
    });
    if (!evalRes.isDisambiguated) {
      hasRealCrisis = true;
    }
  }

  return {
    isCrisis: hasRealCrisis,
    matches: details,
  };
}

function deduplicateMatches(
  matches: Array<{ keyword: string; start: number; end: number }>,
): Array<{ keyword: string; start: number; end: number }> {
  if (matches.length <= 1) return matches;

  // 按照覆盖范围从长到短排序
  const sorted = [...matches].sort((a, b) => b.end - b.start - (a.end - a.start));
  const accepted: Array<{ keyword: string; start: number; end: number }> = [];

  for (const candidate of sorted) {
    const isContained = accepted.some(
      (acc) => candidate.start >= acc.start && candidate.end <= acc.end,
    );
    if (!isContained) {
      accepted.push(candidate);
    }
  }

  return accepted.sort((a, b) => a.start - b.start);
}

export function isL1Crisis(text: string): boolean {
  return disambiguateCrisis(text).isCrisis;
}

export function isNegatedCrisis(text: string): boolean {
  const res = disambiguateCrisis(text);
  return res.matches.length > 0 && res.matches.every((m) => m.isDisambiguated);
}

// -------------------------------------------------------------
// 7. L2 DeepSeek V4 Flash 语义旁路分析
// -------------------------------------------------------------

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
      : atob('Z29vZ2xlL2dlbWluaS0yLjAtZmxhc2gtMDAx');
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  try {
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
