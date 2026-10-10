/**
 * DeepSeek V4 Flash Cognitive Engine Facade
 * 向上保持 100% 契约兼容，底层委托至 cognitive 子模块
 */

export type {
  FlashOptions,
  ShadowReasoningContext,
  ShadowReasoningResult,
  StructuredSessionReport,
} from './cognitive/types';

export {
  DEEPSEEK_V4_FLASH_MODEL,
  MINIMAX_TEXT_01_MODEL,
  resolveFlashModel,
  resolveReportingModel,
  parseJsonSafe,
} from './cognitive/constants';

export { performShadowReasoning } from './cognitive/shadow-reasoning';
export { generateStructuredReportWithFlash } from './cognitive/session-reporter';
export { generateWeeklySummaryDeepSeekV4Flash } from './cognitive/weekly-summary';
export {
  formatSituationalMemoryPrompt,
  consolidateSituationalMemoryWithLLM,
} from './cognitive/situational-memory';
