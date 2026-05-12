export type WidgetStatus = 'idle' | 'analyzing' | 'opportunity' | 'no_opportunity' | 'blocked' | 'error';

export type WidgetMatch = {
  question: string;
  confidence: number;
};

export type WidgetState = {
  enabled: boolean;
  status: WidgetStatus;
  matches: WidgetMatch[];
  totalMarkets: number;
  collapsedToSparkle: boolean;
};

export type WidgetView =
  | { mode: 'disk'; state: 'idle' | 'analyzing' | 'found'; countLabel: string; ariaLabel: string }
  | { mode: 'card'; title: string; scope: string; rows: Array<{ question: string; confidence: number; tier: string }>; ariaLabel: string }
  | { mode: 'pill'; kind: 'empty' | 'blocked' | 'error'; label: string; ariaLabel: string };

// 得分分层
export function getWidgetTierKey(score: unknown) {
  const normalized = Math.round(Number(score) || 0);
  if (normalized >= 85) return 'very-high';
  if (normalized >= 70) return 'high';
  if (normalized >= 50) return 'medium';
  return 'moderate';
}

// 盘口数量
export function formatWidgetMarketCount(totalMarkets: unknown) {
  const normalized = Math.max(0, Math.round(Number(totalMarkets) || 0));
  if (normalized < 10_000) return String(normalized);

  const value = normalized / 10_000;
  const label = Number.isInteger(value)
    ? String(value)
    : value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, '');
  return `${label}万`;
}

// 截断标题
export function truncateWidgetText(text: unknown, maxLength: number) {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

// 载荷状态
export function resolveWidgetStatus(payload: unknown): WidgetStatus {
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const status = typeof data.status === 'string' ? data.status : '';
  const matches = Array.isArray(data.matches) ? data.matches : [];
  const totalMarkets = Number(data.totalMarkets || 0);

  if (status === 'blocked') return 'blocked';
  if (status === 'error') return 'error';
  if (status === 'analyzing') return 'analyzing';
  if (matches.length > 0) return 'opportunity';
  if (status === 'no_opportunity' || totalMarkets > 0) return 'no_opportunity';
  return 'idle';
}

// 规范候选
export function normalizeWidgetMatches(matches: unknown): WidgetMatch[] {
  if (!Array.isArray(matches)) return [];

  return matches
    .map((match) => {
      const item = match && typeof match === 'object' ? match as Record<string, unknown> : {};
      return {
        question: typeof item.question === 'string' ? item.question : '',
        confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : 0,
      };
    })
    .filter((match) => match.question || match.confidence > 0);
}

// 创建视图
export function buildWidgetView(state: WidgetState): WidgetView {
  if (state.status === 'analyzing') {
    return {
      mode: 'disk',
      state: 'analyzing',
      countLabel: '',
      ariaLabel: '正在分析当前网页',
    };
  }

  if (state.status === 'opportunity') {
    if (state.collapsedToSparkle) {
      const countLabel = state.matches.length > 9 ? '9+' : String(state.matches.length);
      return {
        mode: 'disk',
        state: 'found',
        countLabel,
        ariaLabel: `发现 ${state.matches.length} 个机会，点击展开`,
      };
    }

    return {
      mode: 'card',
      title: `${state.matches.length} 个机会`,
      scope: `已扫 ${formatWidgetMarketCount(state.totalMarkets)} 条`,
      rows: state.matches.slice(0, 2).map((match) => ({
        question: truncateWidgetText(match.question, 60) || '（无题目）',
        confidence: Math.round(Number(match.confidence) || 0),
        tier: getWidgetTierKey(match.confidence),
      })),
      ariaLabel: `发现 ${state.matches.length} 个机会，点击打开侧边栏`,
    };
  }

  if (state.status === 'no_opportunity') {
    return { mode: 'pill', kind: 'empty', label: '无机会', ariaLabel: '未发现机会，点击重试' };
  }

  if (state.status === 'blocked') {
    return { mode: 'pill', kind: 'blocked', label: '已跳过', ariaLabel: '当前网站已跳过' };
  }

  if (state.status === 'error') {
    return { mode: 'pill', kind: 'error', label: '分析失败', ariaLabel: '分析失败，点击重试' };
  }

  return {
    mode: 'disk',
    state: 'idle',
    countLabel: '',
    ariaLabel: '点击分析当前网页',
  };
}
