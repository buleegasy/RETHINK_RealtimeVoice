export const DEEPSEEK_V4_FLASH_MODEL = 'deepseek/deepseek-v4-flash';
export const MINIMAX_M3_MODEL = 'MiniMax-M3';
export const MINIMAX_TEXT_01_MODEL = 'minimax/minimax-01';
export const MINIMAX_API_URL = 'https://api.minimaxi.chat/v1/text/chatcompletion_v2';
const RUNTIME_FLASH_MODEL = atob('Z29vZ2xlL2dlbWluaS0zLjgtZmxhc2g=');

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
  return MINIMAX_M3_MODEL;
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

export function trimTrailingSlashes(url: string): string {
  let result = (url || '').trim();
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

export function stripWrappingQuotes(raw: string): string {
  let s = (raw || '').trim();
  const quotes = '"“\'‘`”’';
  while (s.length > 0 && quotes.includes(s.charAt(0))) {
    s = s.slice(1).trim();
  }
  while (s.length > 0 && quotes.includes(s.at(-1) || '')) {
    s = s.slice(0, -1).trim();
  }
  return s;
}
