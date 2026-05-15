import { clipText } from './config';
import type { Market, VectorCandidate } from './types';

type InsforgeMarketRow = Omit<VectorCandidate, 'acceptingOrders' | 'enableOrderBook' | 'vectorScore'>;

// 构建链接
export function buildPolymarketUrl(url: string | null, slug: string | null): string | null {
  const normalizedUrl = clipText(url, 1200);
  if (normalizedUrl) {
    if (/^https?:\/\//i.test(normalizedUrl)) return normalizedUrl;
    if (normalizedUrl.startsWith('//')) return `https:${normalizedUrl}`;
    if (/^polymarket\.com\//i.test(normalizedUrl)) return `https://${normalizedUrl}`;
    return `https://polymarket.com/${normalizedUrl.replace(/^\/+/, '')}`;
  }

  const normalizedSlug = clipText(slug, 500);
  if (!normalizedSlug) return null;
  return `https://polymarket.com/market/${normalizedSlug.replace(/^\/+/, '')}`;
}

// 映射候选
export function mapInsforgeMarket(raw: unknown): VectorCandidate {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid market row');
  }

  const row = raw as InsforgeMarketRow;

  if (!Number.isFinite(row.id)) {
    throw new Error('Invalid market id');
  }

  if (typeof row.question !== 'string' || !row.question.trim()) {
    throw new Error('Invalid market question');
  }

  if (!Number.isFinite(row.distance)) {
    throw new Error('Invalid market distance');
  }

  return {
    id: row.id,
    question: row.question,
    url: row.url,
    slug: row.slug,
    endDate: row.endDate,
    volumeNum: row.volumeNum,
    liquidityNum: row.liquidityNum,
    tags: row.tags,
    tagSlugs: row.tagSlugs,
    categories: row.categories,
    acceptingOrders: true,
    enableOrderBook: true,
    updatedAt: row.updatedAt,
    distance: row.distance,
  };
}
