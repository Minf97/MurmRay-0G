import {
  extractPolymarketSlugFromUrl,
  normalizeLooseTextKey,
  type AnalysisMatch,
} from './analysis';

export type PortfolioSource = 'none' | 'manual' | 'auto';

export type PolymarketProfile = {
  name: string;
  pseudonym: string;
  xUsername: string;
  image: string;
  proxyWallet: string | null;
  bio: string;
};

export type PolymarketPosition = {
  id: string;
  slug: string;
  title: string;
  outcome: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  initialValue: number;
  cashPnl: number;
  realizedPnl: number;
  percentPnl: number;
  endDate: string;
  icon: string;
};

export type PortfolioSummary = {
  positionCount: number;
  totalSize: number;
  totalCurrentValue: number;
  totalInitialValue: number;
  totalCashPnl: number;
  totalRealizedPnl: number;
};

export type PortfolioSnapshot = {
  source: PortfolioSource;
  mode?: 'unresolved' | 'resolved';
  message?: string;
  requestedAddress: string | null;
  accountAddress: string | null;
  profileAddress: string | null;
  fetchedAt: string;
  profile: PolymarketProfile | null;
  positions: PolymarketPosition[];
  summary: PortfolioSummary;
};

export type PortfolioIndexEntry = {
  outcomes: Set<string>;
  currentValue: number;
  cashPnl: number;
  realizedPnl: number;
  positionCount: number;
};

export type PortfolioIndex = {
  bySlug: Map<string, PortfolioIndexEntry>;
  byTitle: Map<string, PortfolioIndexEntry>;
};

// 规范地址
export function normalizeEvmAddress(input: unknown) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!/^0x[a-f0-9]{40}$/i.test(value)) return null;
  return value.toLowerCase();
}

// 规范数字
export function toFiniteNumber(input: unknown) {
  const value = Number(input);
  return Number.isFinite(value) ? value : 0;
}

// 截断文本
function clipText(input: unknown, maxChars: number) {
  if (typeof input !== 'string') return '';
  const normalized = input.trim();
  if (!normalized) return '';
  return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars);
}

// 空摘要
export function createEmptyPortfolioSummary(): PortfolioSummary {
  return {
    positionCount: 0,
    totalSize: 0,
    totalCurrentValue: 0,
    totalInitialValue: 0,
    totalCashPnl: 0,
    totalRealizedPnl: 0,
  };
}

// 空快照
export function createEmptyPortfolioSnapshot(extra: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    source: 'none',
    requestedAddress: null,
    accountAddress: null,
    profileAddress: null,
    fetchedAt: new Date().toISOString(),
    profile: null,
    positions: [],
    summary: createEmptyPortfolioSummary(),
    ...extra,
  };
}

// 标准资料
export function normalizePolymarketProfile(raw: unknown): PolymarketProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  return {
    name: clipText(data.name || data.displayName || data.handle, 120),
    pseudonym: clipText(data.pseudonym, 120),
    xUsername: clipText(data.xUsername || data.twitterUsername, 120),
    image: clipText(data.profileImage || data.image, 2000),
    proxyWallet: normalizeEvmAddress(data.proxyWallet),
    bio: clipText(data.bio, 280),
  };
}

// 标准仓位
export function normalizePortfolioPosition(raw: unknown): PolymarketPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const slug = clipText(data.slug || data.marketSlug, 300).toLowerCase();
  const title = clipText(data.title || data.question || data.marketQuestion, 500);
  const outcome = clipText(data.outcome || data.side, 80);
  const conditionId = clipText(data.conditionId || data.condition_id, 200);

  if (!slug && !title && !conditionId) return null;

  return {
    id: clipText(data.id || data.positionId, 120),
    slug,
    title,
    outcome,
    conditionId,
    size: toFiniteNumber(data.size ?? data.amount ?? data.quantity),
    avgPrice: toFiniteNumber(data.avgPrice ?? data.averagePrice ?? data.entryPrice),
    curPrice: toFiniteNumber(data.curPrice ?? data.currentPrice),
    currentValue: toFiniteNumber(data.currentValue),
    initialValue: toFiniteNumber(data.initialValue),
    cashPnl: toFiniteNumber(data.cashPnl),
    realizedPnl: toFiniteNumber(data.realizedPnl),
    percentPnl: toFiniteNumber(data.percentPnl),
    endDate: clipText(data.endDate || data.endDateIso, 120),
    icon: clipText(data.icon || data.image, 2000),
  };
}

// 汇总仓位
export function buildPortfolioSummary(positions: PolymarketPosition[]): PortfolioSummary {
  return positions.reduce((summary, position) => ({
    positionCount: summary.positionCount + 1,
    totalSize: summary.totalSize + toFiniteNumber(position.size),
    totalCurrentValue: summary.totalCurrentValue + toFiniteNumber(position.currentValue),
    totalInitialValue: summary.totalInitialValue + toFiniteNumber(position.initialValue),
    totalCashPnl: summary.totalCashPnl + toFiniteNumber(position.cashPnl),
    totalRealizedPnl: summary.totalRealizedPnl + toFiniteNumber(position.realizedPnl),
  }), createEmptyPortfolioSummary());
}

// 构建索引
export function buildPortfolioIndex(snapshot: PortfolioSnapshot | null | undefined): PortfolioIndex {
  const bySlug = new Map<string, PortfolioIndexEntry>();
  const byTitle = new Map<string, PortfolioIndexEntry>();
  const positions = Array.isArray(snapshot?.positions) ? snapshot.positions : [];

  for (const position of positions) {
    const slugKey = typeof position?.slug === 'string' ? position.slug.trim().toLowerCase() : '';
    const titleKey = normalizeLooseTextKey(position?.title);
    if (!slugKey && !titleKey) continue;

    const targetMap = slugKey ? bySlug : byTitle;
    const targetKey = slugKey || titleKey;
    const existing = targetMap.get(targetKey) || {
      outcomes: new Set<string>(),
      currentValue: 0,
      cashPnl: 0,
      realizedPnl: 0,
      positionCount: 0,
    };

    existing.positionCount += 1;
    existing.currentValue += toFiniteNumber(position.currentValue);
    existing.cashPnl += toFiniteNumber(position.cashPnl);
    existing.realizedPnl += toFiniteNumber(position.realizedPnl);
    if (position.outcome) existing.outcomes.add(String(position.outcome));

    targetMap.set(targetKey, existing);
    if (slugKey && titleKey && !byTitle.has(titleKey)) {
      byTitle.set(titleKey, existing);
    }
  }

  return { bySlug, byTitle };
}

// 关联持仓
export function decorateMatchesWithPortfolio<T extends AnalysisMatch>(matches: T[], snapshot: PortfolioSnapshot | null | undefined) {
  const portfolioIndex = buildPortfolioIndex(snapshot);

  return matches.map((match) => {
    const slugKey = extractPolymarketSlugFromUrl(match.marketUrl);
    const titleKey = normalizeLooseTextKey(match.question);
    const entry = (slugKey && portfolioIndex.bySlug.get(slugKey))
      || (titleKey && portfolioIndex.byTitle.get(titleKey))
      || null;

    if (!entry) return match;

    const outcomes = Array.from(entry.outcomes || []);
    return {
      ...match,
      isHeld: true,
      heldOutcomeLabel: outcomes.length === 1 ? outcomes[0] : `${outcomes.length} 个仓位`,
      heldCashPnl: toFiniteNumber(entry.cashPnl),
      heldCurrentValue: toFiniteNumber(entry.currentValue),
      heldPositionCount: Math.max(0, Number(entry.positionCount || 0)),
    };
  });
}
