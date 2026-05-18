import { sleep } from '../shared/config.js';
import { EX1024_API_BASE, USER_AGENT } from './config.js';
import type { FetchImpl, SyncMarketRow } from './types.js';

const E6_SCALE = 1_000_000;

// 读文本
function readText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  return value ? value : null;
}

// 读数值
function readNumber(input: unknown): number | null {
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

// 读时间
function readTimestamp(input: unknown): string | null {
  const value = readText(input);
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

// E6 金额
function readE6(input: unknown): number | null {
  const value = readNumber(input);
  return value === null ? null : value / E6_SCALE;
}

// 标签列表
function readTags(input: unknown): { tags: string | null; tagSlugs: string | null } {
  if (!Array.isArray(input)) return { tags: null, tagSlugs: null };
  const tags = input.map(readText).filter((item): item is string => Boolean(item));
  const unique = Array.from(new Set(tags)).sort();
  return {
    tags: unique.length ? unique.join('|') : null,
    tagSlugs: unique.length ? unique.map((item) => item.toLowerCase().replace(/\s+/g, '-')).join('|') : null,
  };
}

// 归一问题
function buildQuestion(item: Record<string, unknown>): string | null {
  const question = readText(item.question);
  const description = readText(item.description);
  if (!question) return description;
  if (!description || description.toLowerCase() === question.toLowerCase()) return question;
  return `${question} - ${description}`;
}

// 分类集合
function buildCategories(item: Record<string, unknown>): string | null {
  const values = [
    '1024ex',
    readText(item.marketType),
    readText(item.category),
    readText(item.subcategory),
    readText(item.oracleType),
  ].filter((value): value is string => Boolean(value));
  const unique = Array.from(new Set(values)).sort();
  return unique.length ? unique.join('|') : null;
}

// 市场链接
function buildMarketUrl(item: Record<string, unknown>, slug: string | null): string | null {
  const direct = readText(item.url);
  if (direct) return direct;
  if (!slug) return null;
  return `https://testnet.1024ex.com/prediction/event/${encodeURIComponent(slug)}`;
}

// 活跃状态
function isAcceptingOrders(item: Record<string, unknown>): boolean {
  return readText(item.status)?.toUpperCase() === 'ACTIVE';
}

// 映射市场
export function map1024Market(raw: unknown): SyncMarketRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const sourceId = readNumber(item.marketIdNumeric) ?? readNumber(item.marketId);
  if (sourceId === null || !Number.isInteger(sourceId)) return null;

  const question = buildQuestion(item);
  if (!question) return null;

  const slug = readText(item.slug);
  const { tags, tagSlugs } = readTags(item.tags);
  const acceptingOrders = isAcceptingOrders(item);

  return {
    id: -Math.abs(sourceId),
    question,
    url: buildMarketUrl(item, slug),
    slug,
    conditionid: readText(item.questionHash) ?? `1024ex:${sourceId}`,
    enddate: readTimestamp(item.endTime) ?? readTimestamp(item.resolutionTime),
    volumenum: readE6(item.totalVolumeE6),
    liquiditynum: readE6(item.totalLiquidityE6),
    tags,
    tag_slugs: tagSlugs,
    categories: buildCategories(item),
    acceptingorders: acceptingOrders,
    enableorderbook: acceptingOrders,
    updatedat: readTimestamp(item.updatedAt) ?? readTimestamp(item.createdAt),
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

// 解包列表
function readItems(json: unknown): unknown[] {
  if (!json || typeof json !== 'object') throw new Error('1024ex response is not an object');
  const body = json as { data?: unknown };
  if (Array.isArray(body.data)) return body.data;
  if (body.data && typeof body.data === 'object' && Array.isArray((body.data as { items?: unknown }).items)) {
    return (body.data as { items: unknown[] }).items;
  }
  throw new Error('1024ex markets response returned invalid rows');
}

// 拉活跃市场
export async function fetch1024ActiveMarkets(fetchImpl: FetchImpl): Promise<unknown[]> {
  const json = await fetchJson(fetchImpl, `${EX1024_API_BASE}/api/v1/prediction/markets/active`, 5);
  return readItems(json);
}

// 拉市场页
export async function fetch1024MarketsPage(fetchImpl: FetchImpl, page: number, pageSize: number): Promise<{
  items: unknown[];
  hasNext: boolean;
}> {
  const url = new URL(`${EX1024_API_BASE}/api/v1/prediction/markets`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  const json = await fetchJson(fetchImpl, url.toString(), 5);
  const items = readItems(json);
  const pagination = json && typeof json === 'object'
    ? ((json as { data?: { pagination?: { hasNext?: unknown } } }).data?.pagination)
    : null;
  return { items, hasNext: pagination?.hasNext === true };
}
