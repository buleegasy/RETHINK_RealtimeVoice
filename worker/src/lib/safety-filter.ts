/**
 * SafetyFilter Facade
 * 向上保持 100% 契约兼容，底层委托至高内聚的 safety 子模块
 */

export type {
  SafetyCheckOptions,
  DoubleSpeedSafetyResult,
  DisambiguationDetail,
  L1DisambiguationResult,
  TokenSegment,
} from './safety/types';

export { segmentText } from './safety/clause-boundary';
export { evaluateCrisisMatch } from './safety/context-evaluator';
export {
  disambiguateCrisis,
  isL1Crisis,
  isNegatedCrisis,
  deduplicateMatches,
} from './safety/l1-disambiguator';
export {
  OPENROUTER_JEV_MODEL,
  checkL2FlashSafety,
  checkDoubleSpeedSafety,
} from './safety/l2-verifier';
