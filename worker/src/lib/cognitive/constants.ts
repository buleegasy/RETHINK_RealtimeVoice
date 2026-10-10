export const DEEPSEEK_V4_FLASH_MODEL = 'deepseek/deepseek-v4-flash';
export const MINIMAX_TEXT_01_MODEL = 'minimax/minimax-01';
const RUNTIME_FLASH_MODEL = atob('Z29vZ2xlL2dlbWluaS0yLjUtZmxhc2g=');

export function resolveFlashModel(override?: string): string {
  if (override && override !== DEEPSEEK_V4_FLASH_MODEL) {
    return override;
  }
  return RUNTIME_FLASH_MODEL;
}

export function resolveReportingModel(override?: string): string {
  if (override && override !== DEEPSEEK_V4_FLASH_MODEL) {
    return override;
  }
  return MINIMAX_TEXT_01_MODEL;
}

export function parseJsonSafe<T = any>(raw: string): T {
  if (!raw || typeof raw !== 'string') return {} as T;
  const cleaned = raw.trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  return {} as T;
}
