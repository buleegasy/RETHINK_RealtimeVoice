import { zhSegmenter, extractSurroundingClause } from './clause-boundary';
import {
  DEGREE_COMPLEMENT_PATTERN,
  PSYCHOLOGICAL_CRISIS_MODIFIERS,
  AFFIRMATIVE_STRONG_PATTERNS,
  DOUBLE_NEGATION_PATTERNS,
  RHETORICAL_ASSERTION_PATTERNS,
  RESISTANCE_PATTERNS,
  RESOLUTION_FAILURE_PATTERNS,
  WERTHER_NARRATIVE_PATTERN,
  WERTHER_COPYCAT_PATTERN,
  INTERVENTION_PREFIX_PATTERN,
  RESOLUTION_SUCCESS_PREFIX_PATTERN,
  RESOLUTION_SIMPLE_PREFIX_PATTERN,
  RESOLUTION_SUFFIX_PATTERN,
  NARRATIVE_PREFIX_PATTERNS,
  NEGATION_PREFIX_PATTERNS,
} from './patterns';

export function checkWordBoundaryAndCompounds(
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

export function checkEverydayContextWhitelist(
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
