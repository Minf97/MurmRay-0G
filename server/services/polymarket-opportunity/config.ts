export const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
export const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_MODEL = 'x-ai/grok-4.20';
export const DEFAULT_OPENROUTER_EMBED_MODEL = 'google/gemini-embedding-2-preview';
export const DEFAULT_OPENROUTER_EMBED_DIMENSIONS = '3072';
export const DEFAULT_OPENROUTER_HTTP_REFERER = 'https://murmray.app';
export const DEFAULT_OPENROUTER_APP_TITLE = 'MurmRay';
export const DEFAULT_TOP_K = 100;
export const DEFAULT_PREFETCH_COUNT = 1200;
export const DEFAULT_EMBED_BATCH_SIZE = 80;

// 截断文本
export function clipText(input: unknown, maxChars: number): string {
  if (typeof input !== 'string') return '';
  const normalized = input.replace(/\r/g, '').trim();
  if (!normalized) return '';
  return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars);
}

// 整理整数
export function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(input);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

// 切分数组
export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
