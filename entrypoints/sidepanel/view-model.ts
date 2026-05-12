import {
  isBlacklistedUrl,
  mergeMatches,
  type AnalysisMatch,
  type AnalysisResult,
  type PageContext,
} from '../../src/shared/analysis.ts';

export const SIDE_PANEL_TABS = [
  { key: 'feed', label: '信号' },
  { key: 'profile', label: '我的' },
  { key: 'settings', label: '设置' },
] as const;

export type SidePanelTab = typeof SIDE_PANEL_TABS[number]['key'];
export type AnalysisStatus = 'idle' | 'loading' | 'ready' | 'error' | 'blocked';

export type ScoreTier = {
  key: 'very-high' | 'high' | 'medium' | 'moderate';
  label: string;
};

export type DirectionMeta = {
  label: string;
  tone: 'yes' | 'no' | 'neutral';
};

// 标签序号
export function getTabIndex(tab: SidePanelTab) {
  return SIDE_PANEL_TABS.findIndex((item) => item.key === tab);
}

// 得分分层
export function getScoreTier(score: unknown): ScoreTier {
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if (safeScore >= 85) return { key: 'very-high', label: 'Very High' };
  if (safeScore >= 70) return { key: 'high', label: 'High' };
  if (safeScore >= 50) return { key: 'medium', label: 'Medium' };
  return { key: 'moderate', label: 'Moderate' };
}

// 方向标签
export function getDirectionMeta(direction: unknown): DirectionMeta {
  const label = String(direction || '不确定');
  const lower = label.toLowerCase();
  if (lower.includes('yes') || label.includes('看涨') || label.includes('是')) {
    return { label, tone: 'yes' };
  }

  if (lower.includes('no') || label.includes('看跌') || label.includes('否')) {
    return { label, tone: 'no' };
  }

  return { label, tone: 'neutral' };
}

// 结果摘要
export function summarizeAnalysis(result: AnalysisResult | null) {
  if (!result) return '等待分析';
  if (!result.matches.length) return `扫描 ${result.totalMarkets} 个盘口`;
  return `${result.matches.length} 个匹配 / ${result.totalMarkets} 个盘口`;
}

// 可见机会
export function getVisibleMatches(result: AnalysisResult | null, limit = 12): AnalysisMatch[] {
  if (!result) return [];
  return mergeMatches(result.matches).slice(0, limit);
}

// 跳过页面
export function shouldSkipPage(pageContext: PageContext) {
  return isBlacklistedUrl(pageContext.url);
}
