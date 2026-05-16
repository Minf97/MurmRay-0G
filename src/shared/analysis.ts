import { MAX_PAGE_TEXT_CHARS, MAX_SELECTION_TEXT_CHARS } from './config';

// 截断文本
export function clipText(text: unknown, maxLength: number) {
  const normalized = String(text ?? '').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

// 无机会错误
export function isNoOpportunityAnalysisError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();
  return (
    lower.includes('page text is empty')
    || lower.includes('summary is empty')
    || lower.includes('no analyzable content')
    || lower.includes('no actionable event')
    || lower.includes('no prediction-market event')
  );
}

// 标准链接
export function normalizePolymarketUrl(input: unknown) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (/^polymarket\.com\//i.test(value)) return `https://${value}`;
  return `https://polymarket.com/${value.replace(/^\/+/, '')}`;
}

// 识别仓位
export function extractPolymarketSlugFromUrl(input: unknown) {
  const normalized = normalizePolymarketUrl(input);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/^\/market\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

// 统一文本
export function normalizeLooseTextKey(input: unknown) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s%.$-]/gu, '');
}

// 解析跳转
export function resolveOpportunityUrl(match: Record<string, unknown> | null | undefined) {
  const direct = normalizePolymarketUrl(match?.marketUrl ?? match?.url);
  if (direct) return direct;

  const slug = typeof match?.slug === 'string' ? match.slug.trim() : '';
  if (!slug) return null;

  return `https://polymarket.com/market/${slug.replace(/^\/+/, '')}`;
}

// 合并候选
export function mergeMatches(matches: unknown[]) {
  const byMarketId = new Map<number, {
    marketId: number;
    question: string;
    confidence: number;
    direction: string;
    reason: string;
    marketUrl: string | null;
  }>();

  for (const match of matches) {
    const marketId = Number((match as { marketId?: unknown })?.marketId);
    if (!Number.isFinite(marketId)) continue;

    const candidate = {
      marketId,
      question: typeof (match as { question?: unknown })?.question === 'string'
        ? (match as { question: string }).question
        : '',
      confidence: Number.isFinite(Number((match as { confidence?: unknown })?.confidence))
        ? Number((match as { confidence?: unknown })?.confidence)
        : 0,
      direction: typeof (match as { direction?: unknown })?.direction === 'string'
        ? (match as { direction: string }).direction
        : '不确定',
      reason: typeof (match as { reason?: unknown })?.reason === 'string'
        ? (match as { reason: string }).reason
        : '',
      marketUrl: resolveOpportunityUrl(match as Record<string, unknown>),
    };

    const existing = byMarketId.get(marketId);
    if (!existing) {
      byMarketId.set(marketId, candidate);
      continue;
    }

    if (candidate.confidence > existing.confidence) {
      byMarketId.set(marketId, {
        ...candidate,
        marketUrl: candidate.marketUrl || existing.marketUrl,
      });
      continue;
    }

    if (candidate.confidence === existing.confidence) {
      byMarketId.set(marketId, {
        ...existing,
        marketUrl: existing.marketUrl || candidate.marketUrl,
      });
      continue;
    }

    if (candidate.marketUrl && !existing.marketUrl) {
      byMarketId.set(marketId, { ...existing, marketUrl: candidate.marketUrl });
    }
  }

  return Array.from(byMarketId.values()).sort((a, b) => b.confidence - a.confidence);
}

// 黑名单页
export function isBlacklistedUrl(url: unknown) {
  try {
    const parsed = new URL(String(url || ''));
    const host = (parsed.hostname || '').toLowerCase().replace(/^www\./, '');
    if (host === 'google.com' || host === 'baidu.com') return true;
    if (host === 'polymarket.com' || host.endsWith('.polymarket.com')) return true;
    if (host === 'x.com' || host === 'twitter.com') {
      return !extractTwitterStatusId(parsed.toString());
    }
    return false;
  } catch {
    return false;
  }
}

// 识别推文
export function extractTwitterStatusId(url: unknown) {
  try {
    const parsed = new URL(String(url || ''));
    const host = (parsed.hostname || '').toLowerCase().replace(/^www\./, '');
    if (host !== 'x.com' && host !== 'twitter.com') return null;
    const match = parsed.pathname.match(/^\/[^/]+\/status\/(\d+)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

// 构建键值
function buildCacheKeyHint(url: string) {
  const twitterStatusId = extractTwitterStatusId(url);
  if (twitterStatusId) return `twitter-status:${twitterStatusId}`;

  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return clipText(url, 240);
  }
}

export interface PageContext {
  title: string;
  url: string;
  pageText: string;
  selectedText: string;
  cacheKeyHint: string;
}

// 生成上下文
export function buildPageContext(raw: unknown): PageContext {
  const pageContext = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const title = clipText(pageContext.title, 300) || 'Untitled';
  const url = clipText(pageContext.url, 1200);
  const pageText = clipText(pageContext.pageText, MAX_PAGE_TEXT_CHARS);
  const selectedText = clipText(pageContext.selectedText, MAX_SELECTION_TEXT_CHARS);
  const cacheKeyHint = clipText(pageContext.cacheKeyHint, 240) || (url ? buildCacheKeyHint(url) : '');

  if (!url || !/^https?:/i.test(url)) {
    throw new Error('Invalid page URL.');
  }

  if (!pageText && !selectedText) {
    throw new Error('Page text is empty.');
  }

  return { title, url, pageText, selectedText, cacheKeyHint };
}

export interface AnalysisMatch {
  marketId: number;
  question: string;
  confidence: number;
  direction: string;
  reason: string;
  marketUrl: string | null;
  isHeld?: boolean;
  heldOutcomeLabel?: string;
  heldCashPnl?: number;
  heldCurrentValue?: number;
  heldPositionCount?: number;
}

export interface AnalysisResult {
  totalMarkets: number;
  matches: AnalysisMatch[];
}

// 标准结果
export function normalizeAnalysisResult(raw: unknown): AnalysisResult {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    totalMarkets: Number.isFinite(Number(data.totalMarkets)) ? Number(data.totalMarkets) : 0,
    matches: mergeMatches(Array.isArray(data.matches) ? data.matches : []),
  };
}
