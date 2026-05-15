import {
  ANALYSIS_CACHE_STORAGE_KEY,
  GHOST_CACHE_TTL_MS,
  GHOST_MAX_CACHE_ENTRIES,
} from '../shared/config';
import { normalizeAnalysisResult, type AnalysisResult } from '../shared/analysis';

type CacheEntry = {
  result: AnalysisResult;
  expiresAt: number;
  updatedAt: number;
};

type CacheStorage = {
  get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

// 生成键
export function buildAnalysisCacheKey(url: unknown) {
  try {
    const parsed = new URL(String(url || ''));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(url || '').trim();
  }
}

// 校验条目
function normalizeEntry(value: unknown, now: number): CacheEntry | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as { result?: unknown; expiresAt?: unknown; updatedAt?: unknown };
  const expiresAt = Number(item.expiresAt);
  const updatedAt = Number(item.updatedAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  if (!Number.isFinite(updatedAt)) return null;
  return {
    result: normalizeAnalysisResult(item.result),
    expiresAt,
    updatedAt,
  };
}

// 创建缓存
export function createAnalysisCache(storage: CacheStorage, now = () => Date.now()) {
  let memory = new Map<string, CacheEntry>();
  let loaded = false;

  // 载入缓存
  async function load() {
    if (loaded) return;
    loaded = true;
    const result = await storage.get(ANALYSIS_CACHE_STORAGE_KEY);
    const raw = result[ANALYSIS_CACHE_STORAGE_KEY];
    if (!raw || typeof raw !== 'object') return;

    const current = now();
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const entry = normalizeEntry(value, current);
      if (entry) memory.set(key, entry);
    }
  }

  // 保存缓存
  async function persist() {
    const current = now();
    const sorted = Array.from(memory.entries())
      .filter(([, entry]) => entry.expiresAt > current)
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, GHOST_MAX_CACHE_ENTRIES);
    memory = new Map(sorted);
    await storage.set({ [ANALYSIS_CACHE_STORAGE_KEY]: Object.fromEntries(sorted) });
  }

  // 读取结果
  async function get(pageKey: string) {
    await load();
    const cached = normalizeEntry(memory.get(pageKey), now());
    if (!cached) {
      memory.delete(pageKey);
      await persist();
      return null;
    }
    return cached.result;
  }

  // 写入结果
  async function set(pageKey: string, result: AnalysisResult) {
    await load();
    memory.set(pageKey, {
      result: normalizeAnalysisResult(result),
      expiresAt: now() + GHOST_CACHE_TTL_MS,
      updatedAt: now(),
    });
    await persist();
  }

  return { get, set };
}
