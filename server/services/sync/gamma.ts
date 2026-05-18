import { sleep } from '../shared/config.js';
import { GAMMA_API_BASE, USER_AGENT } from './config.js';
import type { FetchImpl, SyncMarketRow } from './types.js';

// 读文本
function readText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  return value ? value : null;
}

// 读时间
function readTimestamp(input: unknown): string | null {
  const value = readText(input);
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

// 读数值
function readNumber(input: unknown): number | null {
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

// 读标签
function readTags(rawTags: unknown): { tags: string | null; tagSlugs: string | null } {
  if (!Array.isArray(rawTags)) return { tags: null, tagSlugs: null };
  const labels: string[] = [];
  const slugs: string[] = [];

  for (const item of rawTags) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { label?: unknown; slug?: unknown };
    const label = readText(row.label);
    const slug = readText(row.slug);
    if (label) labels.push(label);
    if (slug) slugs.push(slug);
  }

  return {
    tags: labels.length ? Array.from(new Set(labels)).sort().join('|') : null,
    tagSlugs: slugs.length ? Array.from(new Set(slugs)).sort().join('|') : null,
  };
}

// 分类字段
function buildCategories(rawMarket: Record<string, unknown>, rawEvent?: Record<string, unknown>): string | null {
  const values = [
    readText(rawMarket.category),
    readText(rawEvent?.category),
    readText(rawEvent?.slug),
    readText(rawEvent?.title),
  ];

  if (Array.isArray(rawMarket.events)) {
    for (const item of rawMarket.events) {
      if (!item || typeof item !== 'object') continue;
      const event = item as Record<string, unknown>;
      values.push(readText(event.category), readText(event.slug), readText(event.title));
    }
  }

  const unique = Array.from(new Set(values.filter((item): item is string => Boolean(item)))).sort();
  return unique.length ? unique.join('|') : null;
}

// 市场链接
function buildMarketUrl(url: string | null, slug: string | null): string | null {
  if (url) return url;
  if (!slug) return null;
  return `https://polymarket.com/market/${slug}`;
}

// 映射市场
export function mapGammaMarket(raw: unknown, rawEvent?: unknown): SyncMarketRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const event = rawEvent && typeof rawEvent === 'object' ? rawEvent as Record<string, unknown> : undefined;
  const id = Number(item.id);
  if (!Number.isFinite(id)) return null;

  const question = readText(item.question);
  if (!question) return null;

  const slug = readText(item.slug);
  const { tags, tagSlugs } = readTags(item.tags);

  return {
    id,
    question,
    url: buildMarketUrl(readText(item.url), slug),
    slug,
    conditionid: readText(item.conditionId),
    enddate: readTimestamp(item.endDate) ?? readTimestamp(item.endDateIso),
    volumenum: readNumber(item.volumeNum) ?? readNumber(item.volume) ?? readNumber(item.volumeClob),
    liquiditynum: readNumber(item.liquidityNum) ?? readNumber(item.liquidity),
    tags,
    tag_slugs: tagSlugs,
    categories: buildCategories(item, event),
    acceptingorders: typeof item.acceptingOrders === 'boolean' ? item.acceptingOrders : false,
    enableorderbook: typeof item.enableOrderBook === 'boolean' ? item.enableOrderBook : false,
    updatedat: readTimestamp(item.updatedAt),
  };
}

// 请求 JSON
async function fetchJson(fetchImpl: FetchImpl, url: string, retries: number): Promise<unknown> {
  let lastError = '';
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= retries) break;
      await sleep(300 * attempt);
    }
  }
  throw new Error(lastError || 'Unknown request failure');
}

// 拉市场页
export async function fetchGammaMarketsPage(fetchImpl: FetchImpl, offset: number, limit: number): Promise<unknown[]> {
  const url = new URL(`${GAMMA_API_BASE}/markets`);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('order', 'updatedAt');
  url.searchParams.set('ascending', 'false');
  url.searchParams.set('closed', 'false');
  const json = await fetchJson(fetchImpl, url.toString(), 5);
  if (!Array.isArray(json)) throw new Error('Polymarket markets response is not an array');
  return json;
}

// 拉事件页
export async function fetchGammaEventsPage(fetchImpl: FetchImpl, offset: number, limit: number): Promise<unknown[]> {
  const url = new URL(`${GAMMA_API_BASE}/events`);
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');
  url.searchParams.set('archived', 'false');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const json = await fetchJson(fetchImpl, url.toString(), 8);
  if (!Array.isArray(json)) throw new Error('Polymarket events response is not an array');
  return json;
}
