import { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { EXTENSION_NAME } from '../../src/shared/manifest';
import { POLYMARKET_PORTFOLIO_ADDRESS_STORAGE_KEY } from '../../src/shared/config';
import { SHOW_PAYMENT_SURFACE, SHOW_WALLET_SURFACE } from '../../src/shared/feature-flags';
import { ANALYSIS_MESSAGE_TYPES, AUTH_MESSAGE_TYPES, CORE_MESSAGE_TYPES, GHOST_MESSAGE_TYPES, MEMBERSHIP_MESSAGE_TYPES, PAGE_MESSAGE_TYPES, POLYMARKET_MESSAGE_TYPES, USAGE_PACK_MESSAGE_TYPES, WALLET_MESSAGE_TYPES } from '../../src/shared/messages';
import type { AnalysisMatch, AnalysisResult, PageContext } from '../../src/shared/analysis';
import type { AuthUser } from '../../src/shared/auth';
import type { GhostStatePayload } from '../../src/background/ghost-mode';
import { getChainDisplay, isXLayerChain, XLAYER_MAINNET } from '../../src/shared/chains';
import {
  createEmptyPortfolioSnapshot,
  decorateMatchesWithPortfolio,
  normalizeEvmAddress,
  type PortfolioSnapshot,
} from '../../src/shared/portfolio';
import {
  buildChainPaymentOrderId,
  createDefaultPricingCatalog,
  getItemPriceAmount,
  getMembershipPlan,
  getPlanPriceLabel,
  getQuotaLabel,
  getUsagePackLabel,
  isPaymentConfigReady,
  isZeroPricedItem,
  MURMRAY_PAYMENT_CONFIG,
  type MembershipPlan,
  type MembershipStatus,
  type PaymentConfirmation,
  type PaymentOrder,
  type PricingCatalog,
  type UsagePack,
} from '../../src/shared/membership';
import {
  normalizeWalletProviderKey,
  shortenWalletAddress,
  WALLET_PROVIDER_OPTIONS,
  type WalletProviderKey,
  type WalletState,
} from '../../src/shared/wallet';
import {
  normalizeThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '../../src/shared/theme';
import {
  getDirectionMeta,
  getScoreTier,
  getTabIndex,
  getVisibleMatches,
  shouldSkipPage,
  SIDE_PANEL_TABS,
  summarizeAnalysis,
  type AnalysisStatus,
  type SidePanelTab,
} from './view-model';
import { AuthLoading, AuthPanel, UserProfile, type AuthStatus } from './auth-panel';
import { SettingsView } from './settings-view';

type ChannelStatus = 'checking' | 'ready' | 'error';
type ActiveTabInfo = { id: number; title: string };
type WalletAction = 'refresh' | 'connect' | 'switch';

const STATUS_COPY: Record<ChannelStatus, string> = {
  checking: '检测中',
  ready: '通道就绪',
  error: '通道异常',
};

const ANALYSIS_COPY: Record<AnalysisStatus, string> = {
  idle: '等待分析',
  loading: '正在分析',
  ready: '分析完成',
  error: '分析失败',
  blocked: '已跳过',
};

// 系统主题
function readSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// 检测通道
async function detectChannelStatus() {
  try {
    const response = await browser.runtime.sendMessage({
      type: CORE_MESSAGE_TYPES.ping,
    });

    if (response?.ok && response.type === CORE_MESSAGE_TYPES.pong) {
      return 'ready' satisfies ChannelStatus;
    }
  } catch {
    return 'error' satisfies ChannelStatus;
  }

  return 'error' satisfies ChannelStatus;
}

// 取活动页
async function readActivePageContext(): Promise<PageContext> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!Number.isFinite(tab?.id)) {
    throw new Error('未找到当前标签页');
  }

  const response = await browser.tabs.sendMessage(tab.id, {
    type: PAGE_MESSAGE_TYPES.extract,
  }).catch(() => null);

  if (!response?.ok || !response.pageContext) {
    throw new Error(response?.error || '页面内容采集失败');
  }

  return response.pageContext as PageContext;
}

// 当前标签
async function readActiveTabInfo(): Promise<ActiveTabInfo | null> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!Number.isFinite(tab?.id)) return null;
  return {
    id: Number(tab.id),
    title: typeof tab.title === 'string' ? tab.title : '',
  };
}

// 映射状态
function mapGhostStatus(status: string): AnalysisStatus {
  if (status === 'analyzing') return 'loading';
  if (status === 'opportunity' || status === 'no_opportunity') return 'ready';
  if (status === 'blocked') return 'blocked';
  if (status === 'error') return 'error';
  return 'idle';
}

// 语义色值
function statusTone(status: AnalysisStatus | ChannelStatus) {
  if (status === 'ready') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'loading' || status === 'checking') return 'active';
  if (status === 'blocked') return 'muted';
  return 'neutral';
}

// 美元格式
function formatUsd(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

// 盈亏格式
function formatSignedUsd(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return '$0.00';
  return `${numeric > 0 ? '+' : '-'}${formatUsd(Math.abs(numeric))}`;
}

// 盈亏色调
function pnlTone(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) return 'text-(--ink-3)';
  return numeric > 0 ? 'text-(--good)' : 'text-(--bad)';
}

// 时间文案
function formatDateTime(value: unknown) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// 日期文案
function formatDateShort(value: unknown) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// 解析链ID
function parseChainId(chainId: unknown) {
  if (typeof chainId === 'number') return chainId;
  if (typeof chainId === 'string' && chainId.trim()) {
    if (chainId.startsWith('0x')) return Number.parseInt(chainId, 16);
    const numeric = Number(chainId);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

// 渲染图标
function TabIcon({ tab }: { tab: SidePanelTab }) {
  if (tab === 'profile') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M5 21c0-3.866 3.134-7 7-7s7 3.134 7 7" />
      </svg>
    );
  }

  if (tab === 'settings') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h2" />
        <path d="M11 6h10" />
        <circle cx="8" cy="6" r="2.4" />
        <path d="M3 12h10" />
        <path d="M19 12h2" />
        <circle cx="16" cy="12" r="2.4" />
        <path d="M3 18h6" />
        <path d="M15 18h6" />
        <circle cx="12" cy="18" r="2.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 16v-3" />
      <path d="M12 16v-7" />
      <path d="M16 16v-5" />
    </svg>
  );
}

// 导航标签
function TabButton({
  tab,
  activeTab,
  onSelect,
}: {
  tab: typeof SIDE_PANEL_TABS[number];
  activeTab: SidePanelTab;
  onSelect: (tab: SidePanelTab) => void;
}) {
  const isActive = tab.key === activeTab;

  return (
    <button
      type="button"
      id={`tab-${tab.key}`}
      role="tab"
      aria-selected={isActive}
      aria-controls={`view-${tab.key}`}
      className={`relative z-1 inline-flex min-h-9 flex-1 basis-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border-0 bg-transparent text-[13px] font-medium transition-colors duration-160 hover:text-(--ink-1) ${isActive ? 'text-(--ink-1)' : 'text-(--ink-3)'}`}
      onClick={() => onSelect(tab.key)}
    >
      <span className="size-4 [&_svg]:size-4">
        <TabIcon tab={tab.key} />
      </span>
      <span>{tab.label}</span>
    </button>
  );
}

// 状态圆点
function StatusPill({ label, tone }: { label: string; tone: ReturnType<typeof statusTone> }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-(--ink-2)">
      <span
        className={`size-[7px] rounded-full ${
          tone === 'success'
            ? 'bg-(--good)'
            : tone === 'danger'
              ? 'bg-(--bad)'
              : tone === 'active'
                ? 'bg-(--accent)'
                : tone === 'muted'
                  ? 'bg-(--amber)'
                  : 'bg-(--ink-4)'
        }`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// 得分仪表
function ScoreGauge({ score }: { score: number }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const tier = getScoreTier(safeScore);
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeScore / 100);

  return (
    <span className="relative block size-11">
      <svg className="size-11" viewBox="0 0 44 44" aria-hidden="true">
        <circle className="fill-none stroke-(--rule) stroke-[3.5]" cx="22" cy="22" r={radius} />
        <circle
          className={`origin-center -rotate-90 fill-none transition-[stroke-dashoffset] duration-300 stroke-[3.5] ${
            tier.key === 'very-high'
              ? 'stroke-(--score-very-high)'
              : tier.key === 'high'
                ? 'stroke-(--score-high)'
                : tier.key === 'medium'
                  ? 'stroke-(--score-medium)'
                  : 'stroke-(--score-moderate)'
          }`}
          data-tier={tier.key}
          cx="22"
          cy="22"
          r={radius}
          strokeDasharray={circumference.toFixed(2)}
          strokeDashoffset={dashOffset.toFixed(2)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums text-(--ink-1)">{safeScore}</span>
    </span>
  );
}

// 打开盘口
async function openMarket(url: string | null) {
  if (!url) return;

  try {
    await browser.tabs.create({ url, active: true });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// 机会行
function OpportunityRow({ match }: { match: AnalysisMatch }) {
  const score = Math.round(Number(match.confidence) || 0);
  const tier = getScoreTier(score);
  const direction = getDirectionMeta(match.direction);

  return (
    <button
      type="button"
      className="group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_52px_16px] items-center gap-3 border-0 border-b border-(--rule) bg-(--paper) px-4 py-[15px] text-left text-inherit transition-colors duration-160 hover:bg-(--surface) focus-visible:bg-(--surface) disabled:cursor-default disabled:opacity-72"
      onClick={() => openMarket(match.marketUrl)}
      disabled={!match.marketUrl}
      aria-label={`打开盘口：${match.question || '未命名盘口'}`}
    >
      <span className="flex min-w-0 flex-col gap-[5px]">
        <span className="flex min-w-0 items-start gap-2">
          <span
            className={`mt-px inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5 ${
              tier.key === 'very-high'
                ? 'text-(--score-very-high)'
                : tier.key === 'high'
                  ? 'text-(--score-high)'
                  : tier.key === 'medium'
                    ? 'text-(--score-medium)'
                    : 'text-(--score-moderate)'
            }`}
            data-tier={tier.key}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24">
              <path d="M22 7 13.5 15.5 9 11l-7 7" />
              <path d="M16 7h6v6" />
            </svg>
          </span>
          <span className="line-clamp-2 min-w-0 overflow-hidden text-[13px] font-semibold leading-[1.35] text-(--ink-1)">{match.question || '未命名盘口'}</span>
        </span>
        <span className="text-[11px] tabular-nums text-(--ink-4)">Polymarket · #{match.marketId}</span>
        <span className="flex flex-wrap gap-[5px]">
          <span
            className={`inline-flex min-h-[22px] items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2) ${
              direction.tone === 'yes'
                ? 'border-[#a7f3d0] bg-(--good-soft) text-(--good)'
                : direction.tone === 'no'
                  ? 'border-[#fecdd3] bg-(--bad-soft) text-(--bad)'
                  : ''
            }`}
          >
            {direction.label}
          </span>
          {match.isHeld ? (
            <span className={`inline-flex min-h-[22px] items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold ${pnlTone(match.heldCashPnl)}`}>
              已持仓 · {match.heldOutcomeLabel || '仓位'} · {formatSignedUsd(match.heldCashPnl)}
            </span>
          ) : null}
        </span>
        {match.reason ? <span className="line-clamp-2 overflow-hidden text-xs leading-[1.45] text-(--ink-3)">{match.reason}</span> : null}
      </span>

      <span className="flex flex-col items-center gap-0.5">
        <ScoreGauge score={score} />
        <span
          className={`whitespace-nowrap text-[9px] font-bold uppercase ${
            tier.key === 'very-high'
              ? 'text-(--score-very-high)'
              : tier.key === 'high'
                ? 'text-(--score-high)'
                : tier.key === 'medium'
                  ? 'text-(--score-medium)'
                  : 'text-(--score-moderate)'
          }`}
          data-tier={tier.key}
        >
          {tier.label}
        </span>
      </span>

      <span className="text-(--ink-4) transition-[color,transform] duration-160 group-hover:translate-x-0.5 group-hover:text-(--accent) group-focus-visible:translate-x-0.5 group-focus-visible:text-(--accent) [&_svg]:size-4" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}

// 空白状态
function EmptyResult({ status, message }: { status: AnalysisStatus; message: string }) {
  return (
    <article className="flex min-h-[calc(100vh-146px)] flex-col items-center justify-center gap-3 px-[18px] py-8 text-center">
      <span
        className={`inline-flex size-12 items-center justify-center text-(--ink-4) [&_svg]:size-12 [&_circle]:fill-current [&_circle]:stroke-none ${
          status === 'loading'
            ? 'animate-[pulse_900ms_ease-in-out_infinite] text-(--accent)'
            : status === 'error'
              ? 'text-(--bad)'
              : status === 'blocked'
                ? 'text-(--amber)'
                : ''
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24">
          <path d="M2 8.82a15 15 0 0 1 20 0" />
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <circle cx="12" cy="20" r="0.6" />
        </svg>
      </span>
      <h2 className={`m-0 text-[22px] font-[650] tracking-normal text-(--ink-1) ${status === 'error' ? 'text-(--bad)' : ''}`}>{ANALYSIS_COPY[status]}</h2>
      <p className="m-0 max-w-[32ch] text-[13px] leading-[1.55] text-(--ink-3)">{message}</p>
    </article>
  );
}

// 结果区域
function ResultBoard({
  status,
  result,
  error,
  portfolioSnapshot,
}: {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  error: string;
  portfolioSnapshot: PortfolioSnapshot | null;
}) {
  const matches = useMemo(() => (
    decorateMatchesWithPortfolio(getVisibleMatches(result), portfolioSnapshot)
  ), [result, portfolioSnapshot]);

  if (status === 'loading') {
    return <EmptyResult status="loading" message="正在读取页面并匹配市场盘口。" />;
  }

  if (status === 'error') {
    return <EmptyResult status="error" message={error || '当前页面分析失败。'} />;
  }

  if (status === 'blocked') {
    return <EmptyResult status="blocked" message="该网站不在分析范围内。" />;
  }

  if (status === 'idle') {
    return <EmptyResult status="idle" message="点击分析当前页后显示匹配机会。" />;
  }

  if (!matches.length) {
    return <EmptyResult status="ready" message="当前页面与可下注题目关联不足。" />;
  }

  return (
    <section className="block" aria-label="分析结果">
      <div className="block">
        {matches.map((match) => (
          <OpportunityRow key={match.marketId} match={match} />
        ))}
      </div>
    </section>
  );
}

// 信号视图
function FeedView({
  channelStatus,
  analysisStatus,
  ghostEnabled,
  result,
  error,
  portfolioSnapshot,
  lastTitle,
  onAnalyze,
}: {
  channelStatus: ChannelStatus;
  analysisStatus: AnalysisStatus;
  ghostEnabled: boolean;
  result: AnalysisResult | null;
  error: string;
  portfolioSnapshot: PortfolioSnapshot | null;
  lastTitle: string;
  onAnalyze: () => void;
}) {
  return (
    <section id="view-feed" role="tabpanel" aria-labelledby="tab-feed">
      <header className="flex items-start justify-between gap-4 border-b border-(--rule) px-4 pb-4 pt-[18px]">
        <div className="flex min-w-0 items-start gap-3">
          {/* <img src="/brand/murmray-logo.png" alt="" className="mt-0.5 size-10 shrink-0 rounded-md border border-(--rule) object-cover" /> */}
          <div className="min-w-0">
            <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-normal text-(--accent)">{EXTENSION_NAME}</p>
            <h1 className="m-0 text-2xl font-[650] leading-[1.15] tracking-normal text-(--ink-1)">信号</h1>
            <p className="mb-0 mt-2 line-clamp-2 max-w-[42ch] overflow-hidden text-[13px] leading-[1.4] text-(--ink-3)">{lastTitle || '尚未读取当前页面'}</p>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex min-h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-(--ink-1) px-[13px] text-[13px] font-semibold text-(--paper) transition-colors duration-160 hover:bg-(--accent) disabled:cursor-progress disabled:bg-(--ink-4)"
          onClick={onAnalyze}
          disabled={analysisStatus === 'loading'}
        >
          {analysisStatus === 'loading' ? '分析中' : '分析当前页'}
        </button>
      </header>

      {/* <div className="flex min-h-11 items-center gap-2 overflow-x-auto border-b border-(--rule) px-4" aria-label="运行状态">
        <StatusPill label={STATUS_COPY[channelStatus]} tone={statusTone(channelStatus)} />
        <StatusPill label={ANALYSIS_COPY[analysisStatus]} tone={statusTone(analysisStatus)} />
        <StatusPill label={ghostEnabled ? '幽灵模式开' : '幽灵模式关'} tone={ghostEnabled ? 'success' : 'neutral'} />
        <span className="shrink-0 text-xs tabular-nums text-(--ink-3)">{summarizeAnalysis(result)}</span>
      </div> */}

      <ResultBoard status={analysisStatus} result={result} error={error} portfolioSnapshot={portfolioSnapshot} />
    </section>
  );
}

// 钱包标签
function walletBadgeLabel(walletState: WalletState | null, busy: boolean, error: string) {
  if (busy && !walletState) return '检测中';
  if (error) return '异常';
  if (!walletState?.hasProvider) return '未检测';
  if (!walletState.connected) return '未连接';
  if (isXLayerChain(walletState.chainId)) return 'X Layer';
  return getChainDisplay(walletState.chainId).name;
}

// 钱包详情
function WalletStatusBlock({
  walletState,
  providerKey,
  busy,
  error,
  onProviderChange,
  onRefresh,
  onConnect,
  onSwitchXLayer,
}: {
  walletState: WalletState | null;
  providerKey: WalletProviderKey;
  busy: boolean;
  error: string;
  onProviderChange: (providerKey: WalletProviderKey) => void;
  onRefresh: () => void;
  onConnect: () => void;
  onSwitchXLayer: () => void;
}) {
  const chain = getChainDisplay(walletState?.chainId);
  const accountLabel = shortenWalletAddress(walletState?.account);
  const statusText = error || (walletState?.connected
    ? `${walletState.walletLabel} · ${accountLabel || '已连接'} · ${chain.name}`
    : walletState?.hasProvider
      ? `${walletState.walletLabel} · 未连接`
      : '在普通网页中检测浏览器钱包');
  const onTargetChain = isXLayerChain(walletState?.chainId);

  return (
    <div className="border-b border-(--rule) px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-(--ink-1)">钱包</span>
          <span className={`mt-0.5 block text-[11px] leading-[1.45] ${error ? 'text-(--bad)' : 'text-(--ink-3)'}`}>{statusText}</span>
        </div>
        <span className="inline-flex min-h-[22px] shrink-0 items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2)">
          {walletBadgeLabel(walletState, busy, error)}
        </span>
      </div>

      <div className="mt-3 inline-flex rounded-lg border border-(--rule) bg-(--surface) p-0.5">
        {WALLET_PROVIDER_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`min-h-7 cursor-pointer rounded-md border-0 px-2.5 text-[11px] font-semibold transition-colors duration-160 disabled:cursor-progress ${
              providerKey === option.key
                ? 'bg-(--paper) text-(--ink-1) [box-shadow:0_1px_2px_rgb(17_24_39/8%)]'
                : 'bg-transparent text-(--ink-3) hover:text-(--ink-1)'
            }`}
            onClick={() => onProviderChange(option.key)}
            disabled={busy}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-(--rule) bg-(--paper) px-2.5 text-[11px] font-semibold text-(--ink-2) transition-colors duration-160 hover:bg-(--surface) disabled:cursor-progress disabled:text-(--ink-4)"
          onClick={onRefresh}
          disabled={busy}
        >
          刷新
        </button>
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-(--rule) bg-(--paper) px-2.5 text-[11px] font-semibold text-(--ink-2) transition-colors duration-160 hover:bg-(--surface) disabled:cursor-progress disabled:text-(--ink-4)"
          onClick={onConnect}
          disabled={busy}
        >
          连接
        </button>
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-(--ink-1) px-2.5 text-[11px] font-semibold text-(--paper) transition-colors duration-160 hover:bg-(--accent) disabled:cursor-progress disabled:bg-(--ink-4)"
          onClick={onSwitchXLayer}
          disabled={busy || onTargetChain}
        >
          {onTargetChain ? '已在 X Layer' : `切换 ${XLAYER_MAINNET.chainName}`}
        </button>
      </div>
    </div>
  );
}

type PurchaseFeedback = {
  tone: 'success' | 'error' | 'info';
  title: string;
  detail: string;
  txHash?: string;
} | null;

// 钱包提示
function billingWalletText(walletState: WalletState | null) {
  if (!walletState?.hasProvider) return '未检测到钱包';
  if (!walletState.connected) return `${walletState.walletLabel} · 未连接`;
  return `${walletState.walletLabel} · ${shortenWalletAddress(walletState.account) || '已连接'} · ${getChainDisplay(walletState.chainId).name}`;
}

// 会员摘要
function MembershipSummaryBlock({
  status,
  catalog,
  onRefresh,
}: {
  status: MembershipStatus | null;
  catalog: PricingCatalog;
  onRefresh: () => void;
}) {
  const freePlan = getMembershipPlan('free', catalog.membershipPlans);
  const headline = status?.unlimited ? '不限分析' : '免费使用';
  const meta = status?.expiresAt
    ? `有效期至 ${formatDateShort(status.expiresAt)}`
    : `每日 ${freePlan?.dailyQuota ?? status?.dailyQuota ?? 1000} 次免费`;

  return (
    <div className="border-b border-(--rule) px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex min-h-[22px] items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2)">
            {status?.planName || '普通用户'}
          </span>
          <strong className="mt-2 block text-lg font-[650] leading-tight text-(--ink-1)">{headline}</strong>
          <span className="mt-1 block text-[11px] leading-[1.45] text-(--ink-3)">{meta}</span>
        </div>
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-(--rule) bg-(--paper) px-2.5 text-[11px] font-semibold text-(--ink-2) transition-colors duration-160 hover:bg-(--surface)"
          onClick={onRefresh}
        >
          刷新
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-(--rule) bg-(--surface) px-2.5 py-2">
          <span className="block text-[10px] font-semibold text-(--ink-4)">今日剩余</span>
          <strong className="mt-1 block text-sm text-(--ink-1)">{status?.unlimited ? '不限' : Math.max(0, Number(status?.remainingToday || 0))}</strong>
        </div>
        <div className="rounded-lg border border-(--rule) bg-(--surface) px-2.5 py-2">
          <span className="block text-[10px] font-semibold text-(--ink-4)">额外额度</span>
          <strong className="mt-1 block text-sm text-(--ink-1)">{Math.max(0, Number(status?.extraCredits || 0))}</strong>
        </div>
      </div>
    </div>
  );
}

// 购买反馈
function PurchaseFeedbackBlock({ feedback }: { feedback: PurchaseFeedback }) {
  if (!feedback) return null;

  const toneClass = feedback.tone === 'success'
    ? 'border-[#a7f3d0] bg-(--good-soft) text-(--good)'
    : feedback.tone === 'error'
      ? 'border-[#fecdd3] bg-(--bad-soft) text-(--bad)'
      : 'border-(--rule) bg-(--surface) text-(--ink-2)';
  const txUrl = feedback.txHash ? `${MURMRAY_PAYMENT_CONFIG.txExplorerBaseUrl}${feedback.txHash}` : '';

  return (
    <div className={`mx-4 mt-3 rounded-lg border px-3 py-2 ${toneClass}`}>
      <strong className="block text-xs">{feedback.title}</strong>
      <span className="mt-1 block break-words text-[11px] leading-[1.45]">{feedback.detail}</span>
      {txUrl ? (
        <button
          type="button"
          className="mt-2 border-0 bg-transparent p-0 text-[11px] font-semibold underline"
          onClick={() => openMarket(txUrl)}
        >
          查看交易
        </button>
      ) : null}
    </div>
  );
}

// 会员卡片
function PlanCard({
  plan,
  currentPlanCode,
  busyKey,
  onPurchase,
}: {
  plan: MembershipPlan;
  currentPlanCode: string;
  busyKey: string;
  onPurchase: (productType: 'membership', code: string) => void;
}) {
  const isCurrent = currentPlanCode === plan.code;
  const paymentReady = isPaymentConfigReady(plan);
  const disabled = !plan.purchasable || isCurrent || !paymentReady || busyKey === `membership:${plan.code}`;

  return (
    <article className={`rounded-lg border px-3 py-3 ${plan.featured ? 'border-(--ink-2) bg-(--surface)' : 'border-(--rule) bg-(--paper)'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block text-sm text-(--ink-1)">{plan.name}</strong>
          <span className="mt-1 block text-[11px] leading-[1.45] text-(--ink-3)">{plan.description}</span>
        </div>
        <span className="shrink-0 text-xs font-bold text-(--ink-1)">{getPlanPriceLabel(plan)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-(--ink-3)">{getQuotaLabel(plan.dailyQuota)}</span>
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-(--ink-1) px-2.5 text-[11px] font-semibold text-(--paper) transition-colors duration-160 hover:bg-(--accent) disabled:cursor-default disabled:bg-(--ink-4)"
          onClick={() => onPurchase('membership', plan.code)}
          disabled={disabled}
        >
          {busyKey === `membership:${plan.code}` ? '处理中' : isCurrent ? '当前' : paymentReady ? plan.ctaLabel : '暂不可用'}
        </button>
      </div>
    </article>
  );
}

// 次卡卡片
function UsagePackCard({
  pack,
  busyKey,
  onPurchase,
}: {
  pack: UsagePack;
  busyKey: string;
  onPurchase: (productType: 'usage_pack', code: string) => void;
}) {
  const paymentReady = isPaymentConfigReady(pack);
  const disabled = !pack.purchasable || !paymentReady || busyKey === `usage_pack:${pack.code}`;

  return (
    <article className="rounded-lg border border-(--rule) bg-(--paper) px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block text-sm text-(--ink-1)">{pack.name}</strong>
          <span className="mt-1 block text-[11px] leading-[1.45] text-(--ink-3)">{pack.description}</span>
        </div>
        <span className="shrink-0 text-xs font-bold text-(--ink-1)">{getPlanPriceLabel(pack)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold text-(--ink-3)">{getUsagePackLabel(pack.creditCount)}</span>
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-(--rule) bg-(--paper) px-2.5 text-[11px] font-semibold text-(--ink-2) transition-colors duration-160 hover:bg-(--surface) disabled:cursor-default disabled:text-(--ink-4)"
          onClick={() => onPurchase('usage_pack', pack.code)}
          disabled={disabled}
        >
          {busyKey === `usage_pack:${pack.code}` ? '处理中' : paymentReady ? pack.ctaLabel : '暂不可用'}
        </button>
      </div>
    </article>
  );
}

// 购买中心
function MembershipBillingBlock({
  status,
  catalog,
  walletState,
  walletBusy,
  walletProviderKey,
  busyKey,
  feedback,
  onRefreshStatus,
  onWalletConnect,
  onWalletSwitchXLayer,
  onPurchase,
}: {
  status: MembershipStatus | null;
  catalog: PricingCatalog;
  walletState: WalletState | null;
  walletBusy: boolean;
  walletProviderKey: WalletProviderKey;
  busyKey: string;
  feedback: PurchaseFeedback;
  onRefreshStatus: () => void;
  onWalletConnect: () => void;
  onWalletSwitchXLayer: () => void;
  onPurchase: (productType: 'membership' | 'usage_pack', code: string) => void;
}) {
  const plans = catalog.membershipPlans.filter((plan) => plan.isActive);
  const packs = catalog.usagePacks.filter((pack) => pack.isActive);
  const onTargetChain = isXLayerChain(walletState?.chainId);

  return (
    <div className="border-b border-(--rule) pb-3">
      <MembershipSummaryBlock status={status} catalog={catalog} onRefresh={onRefreshStatus} />
      <div className="border-b border-(--rule) px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-sm font-semibold text-(--ink-1)">链上支付</span>
            <span className="mt-0.5 block text-[11px] leading-[1.45] text-(--ink-3)">
              {walletProviderKey === 'auto' ? '自动钱包' : walletProviderKey} · {billingWalletText(walletState)}
            </span>
          </div>
          <span className="inline-flex min-h-[22px] shrink-0 items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2)">
            {MURMRAY_PAYMENT_CONFIG.paymentSymbol}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-(--rule) bg-(--paper) px-2.5 text-[11px] font-semibold text-(--ink-2) transition-colors duration-160 hover:bg-(--surface) disabled:cursor-progress disabled:text-(--ink-4)"
            onClick={onWalletConnect}
            disabled={walletBusy}
          >
            连接钱包
          </button>
          <button
            type="button"
            className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-(--ink-1) px-2.5 text-[11px] font-semibold text-(--paper) transition-colors duration-160 hover:bg-(--accent) disabled:cursor-progress disabled:bg-(--ink-4)"
            onClick={onWalletSwitchXLayer}
            disabled={walletBusy || onTargetChain}
          >
            {onTargetChain ? '已在 X Layer' : '切换 X Layer'}
          </button>
        </div>
      </div>

      <PurchaseFeedbackBlock feedback={feedback} />

      <div className="px-4 pt-3">
        <h2 className="m-0 text-sm font-semibold text-(--ink-1)">会员权益</h2>
        <div className="mt-2 grid gap-2">
          {plans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              currentPlanCode={status?.planCode || 'free'}
              busyKey={busyKey}
              onPurchase={onPurchase}
            />
          ))}
        </div>

        <h2 className="m-0 mt-4 text-sm font-semibold text-(--ink-1)">补充额度</h2>
        <div className="mt-2 grid gap-2">
          {packs.map((pack) => (
            <UsagePackCard
              key={pack.code}
              pack={pack}
              busyKey={busyKey}
              onPurchase={onPurchase}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// 来源标签
function portfolioSourceLabel(snapshot: PortfolioSnapshot | null, walletLookupEnabled = SHOW_WALLET_SURFACE) {
  if (snapshot?.source === 'manual') return '手动地址';
  if (snapshot?.source === 'auto') return walletLookupEnabled ? '自动钱包' : '自动地址';
  return walletLookupEnabled ? '未连接' : '未填写';
}

// 持仓区块
function PortfolioBlock({
  snapshot,
  addressInput,
  walletLookupEnabled,
  busy,
  error,
  onAddressInputChange,
  onSaveAddress,
  onClearAddress,
  onRefresh,
}: {
  snapshot: PortfolioSnapshot | null;
  addressInput: string;
  walletLookupEnabled: boolean;
  busy: boolean;
  error: string;
  onAddressInputChange: (value: string) => void;
  onSaveAddress: () => void;
  onClearAddress: () => void;
  onRefresh: () => void;
}) {
  const summary = snapshot?.summary;
  const positions = Array.isArray(snapshot?.positions) ? snapshot.positions.slice(0, 6) : [];
  const savedAddress = normalizeEvmAddress(addressInput);
  const profileName = snapshot?.profile?.pseudonym
    || snapshot?.profile?.name
    || snapshot?.profile?.xUsername
    || shortenWalletAddress(snapshot?.profileAddress)
    || '尚未读取';
  const fetchedText = snapshot?.fetchedAt ? formatDateTime(snapshot.fetchedAt) : '';
  const emptyMessage = walletLookupEnabled
    ? '未检测到持仓地址'
    : '请手动填写 Polymarket 地址读取持仓';
  const helperText = snapshot?.profileAddress
    ? `${portfolioSourceLabel(snapshot, walletLookupEnabled)} · ${shortenWalletAddress(snapshot.profileAddress)}${fetchedText ? ` · ${fetchedText}` : ''}`
    : snapshot?.message || emptyMessage;

  return (
    <div className="border-b border-(--rule) px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm font-semibold text-(--ink-1)">Polymarket 持仓</span>
          <span className="mt-0.5 block text-[11px] leading-[1.45] text-(--ink-3)">{profileName} · {helperText}</span>
        </div>
        <span className="inline-flex min-h-[22px] shrink-0 items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2)">
          {portfolioSourceLabel(snapshot, walletLookupEnabled)}
        </span>
      </div>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-[11px] font-semibold text-(--ink-3)">持仓地址</span>
        <input
          className="min-h-9 w-full rounded-lg border border-(--rule) bg-(--paper) px-2.5 text-xs text-(--ink-1) outline-none transition-colors duration-160 placeholder:text-(--ink-4) focus:border-(--rule-strong)"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x..."
          value={addressInput}
          onChange={(event) => onAddressInputChange(event.currentTarget.value)}
          disabled={busy}
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-(--rule) bg-(--paper) px-2.5 text-[11px] font-semibold text-(--ink-2) transition-colors duration-160 hover:bg-(--surface) disabled:cursor-progress disabled:text-(--ink-4)"
          onClick={onSaveAddress}
          disabled={busy}
        >
          {savedAddress ? '保存地址' : '保存'}
        </button>
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-(--rule) bg-(--paper) px-2.5 text-[11px] font-semibold text-(--ink-2) transition-colors duration-160 hover:bg-(--surface) disabled:cursor-progress disabled:text-(--ink-4)"
          onClick={onClearAddress}
          disabled={busy || !addressInput}
        >
          {walletLookupEnabled ? '恢复自动' : '清除地址'}
        </button>
        <button
          type="button"
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-(--ink-1) px-2.5 text-[11px] font-semibold text-(--paper) transition-colors duration-160 hover:bg-(--accent) disabled:cursor-progress disabled:bg-(--ink-4)"
          onClick={onRefresh}
          disabled={busy}
        >
          {busy ? '读取中' : '刷新持仓'}
        </button>
      </div>

      {error ? <p className="mb-0 mt-2 text-[11px] leading-[1.45] text-(--bad)">{error}</p> : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-(--rule) bg-(--surface) px-2.5 py-2">
          <span className="block text-[10px] font-semibold text-(--ink-4)">仓位数</span>
          <strong className="mt-1 block text-sm text-(--ink-1)">{Math.max(0, Number(summary?.positionCount || 0))}</strong>
        </div>
        <div className="rounded-lg border border-(--rule) bg-(--surface) px-2.5 py-2">
          <span className="block text-[10px] font-semibold text-(--ink-4)">当前市值</span>
          <strong className="mt-1 block text-sm text-(--ink-1)">{formatUsd(summary?.totalCurrentValue)}</strong>
        </div>
        <div className="rounded-lg border border-(--rule) bg-(--surface) px-2.5 py-2">
          <span className="block text-[10px] font-semibold text-(--ink-4)">当前盈亏</span>
          <strong className={`mt-1 block text-sm ${pnlTone(summary?.totalCashPnl)}`}>{formatSignedUsd(summary?.totalCashPnl)}</strong>
        </div>
        <div className="rounded-lg border border-(--rule) bg-(--surface) px-2.5 py-2">
          <span className="block text-[10px] font-semibold text-(--ink-4)">已实现盈亏</span>
          <strong className={`mt-1 block text-sm ${pnlTone(summary?.totalRealizedPnl)}`}>{formatSignedUsd(summary?.totalRealizedPnl)}</strong>
        </div>
      </div>

      <div className="mt-3 border-t border-(--rule)">
        {positions.length ? positions.map((position) => (
          <button
            key={`${position.slug}-${position.outcome}-${position.id}`}
            type="button"
            className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-3 border-0 border-b border-(--rule) bg-transparent px-0 py-2.5 text-left text-inherit transition-colors duration-160 hover:bg-(--surface)"
            onClick={() => openMarket(position.slug ? `https://polymarket.com/market/${encodeURIComponent(position.slug)}` : null)}
          >
            <span className="min-w-0">
              <span className="line-clamp-2 block text-xs font-semibold leading-[1.35] text-(--ink-1)">{position.title || '未命名盘口'}</span>
              <span className="mt-1 inline-flex min-h-[20px] items-center rounded-full border border-(--rule) bg-(--paper) px-1.5 text-[10px] font-semibold text-(--ink-3)">{position.outcome || '仓位'}</span>
            </span>
            <span className="text-right">
              <strong className="block text-xs text-(--ink-1)">{formatUsd(position.currentValue)}</strong>
              <span className={`mt-1 block text-[10px] font-semibold ${pnlTone(position.cashPnl)}`}>{formatSignedUsd(position.cashPnl)}</span>
            </span>
          </button>
        )) : (
          <p className="mb-0 mt-3 text-[11px] leading-[1.45] text-(--ink-4)">{snapshot?.message || (walletLookupEnabled ? '当前没有读到持仓。' : '当前没有读到持仓，请先填写地址。')}</p>
        )}
      </div>
    </div>
  );
}

// 我的视图
function ProfileView({
  user,
  membershipStatus,
  pricingCatalog,
  purchaseBusyKey,
  purchaseFeedback,
  walletState,
  walletProviderKey,
  walletBusy,
  walletError,
  portfolioSnapshot,
  portfolioAddressInput,
  portfolioBusy,
  portfolioError,
  logoutBusy,
  onRefreshMembership,
  onPurchase,
  onWalletProviderChange,
  onWalletRefresh,
  onWalletConnect,
  onWalletSwitchXLayer,
  onPortfolioAddressInputChange,
  onPortfolioSaveAddress,
  onPortfolioClearAddress,
  onPortfolioRefresh,
  onLogout,
}: {
  user: AuthUser;
  membershipStatus: MembershipStatus | null;
  pricingCatalog: PricingCatalog;
  purchaseBusyKey: string;
  purchaseFeedback: PurchaseFeedback;
  walletState: WalletState | null;
  walletProviderKey: WalletProviderKey;
  walletBusy: boolean;
  walletError: string;
  portfolioSnapshot: PortfolioSnapshot | null;
  portfolioAddressInput: string;
  portfolioBusy: boolean;
  portfolioError: string;
  logoutBusy: boolean;
  onRefreshMembership: () => void;
  onPurchase: (productType: 'membership' | 'usage_pack', code: string) => void;
  onWalletProviderChange: (providerKey: WalletProviderKey) => void;
  onWalletRefresh: () => void;
  onWalletConnect: () => void;
  onWalletSwitchXLayer: () => void;
  onPortfolioAddressInputChange: (value: string) => void;
  onPortfolioSaveAddress: () => void;
  onPortfolioClearAddress: () => void;
  onPortfolioRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <section id="view-profile" role="tabpanel" aria-labelledby="tab-profile">
      <UserProfile user={user} logoutBusy={logoutBusy} onLogout={onLogout} />
      {SHOW_PAYMENT_SURFACE ? (
        <MembershipBillingBlock
          status={membershipStatus}
          catalog={pricingCatalog}
          walletState={walletState}
          walletBusy={walletBusy}
          walletProviderKey={walletProviderKey}
          busyKey={purchaseBusyKey}
          feedback={purchaseFeedback}
          onRefreshStatus={onRefreshMembership}
          onWalletConnect={onWalletConnect}
          onWalletSwitchXLayer={onWalletSwitchXLayer}
          onPurchase={onPurchase}
        />
      ) : null}
      {SHOW_WALLET_SURFACE ? (
        <WalletStatusBlock
          walletState={walletState}
          providerKey={walletProviderKey}
          busy={walletBusy}
          error={walletError}
          onProviderChange={onWalletProviderChange}
          onRefresh={onWalletRefresh}
          onConnect={onWalletConnect}
          onSwitchXLayer={onWalletSwitchXLayer}
        />
      ) : null}
      <PortfolioBlock
        snapshot={portfolioSnapshot}
        addressInput={portfolioAddressInput}
        walletLookupEnabled={SHOW_WALLET_SURFACE}
        busy={portfolioBusy}
        error={portfolioError}
        onAddressInputChange={onPortfolioAddressInputChange}
        onSaveAddress={onPortfolioSaveAddress}
        onClearAddress={onPortfolioClearAddress}
        onRefresh={onPortfolioRefresh}
      />
    </section>
  );
}

// 主应用
export function App() {
  const [activeTab, setActiveTab] = useState<SidePanelTab>('feed');
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>('checking');
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [lastTitle, setLastTitle] = useState('');
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const activeTabIdRef = useRef<number | null>(null);
  const [ghostEnabled, setGhostEnabled] = useState(false);
  const [ghostBusy, setGhostBusy] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPrefersDark);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [walletProviderKey, setWalletProviderKey] = useState<WalletProviderKey>('auto');
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [pricingCatalog, setPricingCatalog] = useState<PricingCatalog>(() => createDefaultPricingCatalog());
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [purchaseBusyKey, setPurchaseBusyKey] = useState('');
  const [purchaseFeedback, setPurchaseFeedback] = useState<PurchaseFeedback>(null);
  const [portfolioSnapshot, setPortfolioSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [portfolioAddressInput, setPortfolioAddressInput] = useState('');
  const [portfolioBusy, setPortfolioBusy] = useState(false);
  const [portfolioError, setPortfolioError] = useState('');
  const resolvedTheme = useMemo(
    () => resolveThemePreference(themePreference, systemPrefersDark),
    [themePreference, systemPrefersDark],
  );

  // 应用幽灵态
  function applyGhostPayload(payload: GhostStatePayload | null | undefined) {
    if (!payload) return;

    setLastTitle(payload.pageTitle || payload.pageUrl || '');
    setAnalysisStatus(mapGhostStatus(payload.status));
    setAnalysisError(payload.error || '');
    setAnalysisResult({
      totalMarkets: payload.totalMarkets,
      matches: payload.matches,
    });
  }

  // 读取幽灵态
  async function refreshGhostStateForActiveTab() {
    const tab = await readActiveTabInfo();
    activeTabIdRef.current = tab?.id ?? null;
    setActiveTabId(tab?.id ?? null);

    if (!tab?.id) return;

    const response = await browser.runtime.sendMessage({
      type: GHOST_MESSAGE_TYPES.getTabState,
      tabId: tab.id,
    }).catch(() => null);

    if (response?.ok && response.payload) {
      applyGhostPayload(response.payload as GhostStatePayload);
      return;
    }

    if (tab.title) {
      setLastTitle(tab.title);
    }
  }

  // 应用用户态
  function applyAuthUser(user: AuthUser | null) {
    setAuthUser(user);
    setAuthStatus(user ? 'signed_in' : 'signed_out');
    if (user) setAuthError('');
  }

  // 读取用户态
  async function refreshAuthUser() {
    setAuthStatus('checking');

    const response = await browser.runtime
      .sendMessage({ type: AUTH_MESSAGE_TYPES.getUser })
      .catch(() => null);

    if (response?.ok && response.data?.user) {
      applyAuthUser(response.data.user as AuthUser);
      void refreshMembershipStatus({ silent: true, forceCatalog: true });
      return;
    }

    applyAuthUser(null);
  }

  // 读取权益
  async function refreshMembershipStatus(options: { silent?: boolean; forceCatalog?: boolean } = {}) {
    if (!options.silent) setPurchaseFeedback(null);

    const [catalogResponse, statusResponse] = await Promise.all([
      browser.runtime
        .sendMessage({ type: MEMBERSHIP_MESSAGE_TYPES.getCatalog, force: Boolean(options.forceCatalog) })
        .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) })),
      browser.runtime
        .sendMessage({ type: MEMBERSHIP_MESSAGE_TYPES.getStatus })
        .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) })),
    ]);

    if (catalogResponse?.ok && catalogResponse.data) {
      setPricingCatalog(catalogResponse.data as PricingCatalog);
    }

    if (statusResponse?.ok && statusResponse.data) {
      setMembershipStatus(statusResponse.data as MembershipStatus);
      return;
    }

    if (!options.silent) {
      setPurchaseFeedback({
        tone: 'error',
        title: '权益读取失败',
        detail: statusResponse?.error || '无法读取会员状态',
      });
    }
  }

  useEffect(() => {
    let alive = true;

    // 广播就绪
    void browser.runtime
      .sendMessage({ type: CORE_MESSAGE_TYPES.sidepanelReady })
      .catch(() => undefined);

    // 读取通道
    void detectChannelStatus().then((nextStatus) => {
      if (!alive) return;
      setChannelStatus(nextStatus);
    });

    // 读取模式
    void browser.runtime
      .sendMessage({ type: GHOST_MESSAGE_TYPES.getState })
      .then((response) => {
        if (!alive) return;
        setGhostEnabled(Boolean(response?.enabled));
      })
      .catch(() => undefined);

    void refreshAuthUser();
    void refreshMembershipStatus({ silent: true });
    void refreshGhostStateForActiveTab();
    if (SHOW_WALLET_SURFACE) void refreshWalletState({ silent: true });
    void loadPortfolioAddressPreference();

    // 监听运行态
    const handleRuntimeMessage = (message: unknown) => {
      if (!message || typeof message !== 'object') return false;
      const typedMessage = message as { type?: unknown; enabled?: unknown; payload?: GhostStatePayload; user?: AuthUser | null };

      if (typedMessage.type === AUTH_MESSAGE_TYPES.stateChanged) {
        applyAuthUser(typedMessage.user || null);
        if (typedMessage.user) void refreshMembershipStatus({ silent: true, forceCatalog: true });
        return false;
      }

      if (typedMessage.type === GHOST_MESSAGE_TYPES.modeChanged) {
        setGhostEnabled(Boolean(typedMessage.enabled));
        return false;
      }

      if (typedMessage.type === GHOST_MESSAGE_TYPES.stateUpdated && typedMessage.payload) {
        const incomingTabId = Number(typedMessage.payload.tabId);
        const currentTabId = activeTabIdRef.current;
        if (!Number.isFinite(incomingTabId) || currentTabId === null || incomingTabId === currentTabId) {
          applyGhostPayload(typedMessage.payload);
        }
      }

      return false;
    };
    browser.runtime.onMessage.addListener(handleRuntimeMessage);

    // 监听切页
    const handleTabActivated = () => {
      void refreshGhostStateForActiveTab();
    };
    browser.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      alive = false;
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
      browser.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    let alive = true;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    // 读取主题
    void browser.storage.local.get(THEME_STORAGE_KEY).then((result) => {
      if (!alive) return;
      setThemePreference(normalizeThemePreference(result[THEME_STORAGE_KEY]));
    });

    // 监听系统
    const handleSystemThemeChange = () => {
      setSystemPrefersDark(media.matches);
    };
    media.addEventListener('change', handleSystemThemeChange);

    return () => {
      alive = false;
      media.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  // 触发分析
  async function handleAnalyzeClick() {
    setActiveTab('feed');
    setAnalysisStatus('loading');
    setAnalysisError('');

    try {
      const tab = await readActiveTabInfo();
      const pageContext = await readActivePageContext();
      activeTabIdRef.current = tab?.id ?? null;
      setActiveTabId(tab?.id ?? null);
      setLastTitle(pageContext.title);

      if (shouldSkipPage(pageContext)) {
        setAnalysisResult(null);
        setAnalysisStatus('blocked');
        return;
      }

      const response = await browser.runtime.sendMessage({
        type: ANALYSIS_MESSAGE_TYPES.analyzePage,
        tabId: tab?.id,
        pageContext,
      });

      if (!response?.ok || !response.result) {
        throw new Error(response?.error || '分析失败');
      }

      setAnalysisResult(response.result as AnalysisResult);
      setAnalysisStatus('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '分析失败');
      setAnalysisError(message);
      setAnalysisResult(null);
      setAnalysisStatus('error');
    }
  }

  // 切换幽灵
  async function handleGhostToggle(enabled: boolean) {
    setGhostBusy(true);
    setGhostEnabled(enabled);

    try {
      const response = await browser.runtime.sendMessage({
        type: GHOST_MESSAGE_TYPES.setState,
        enabled,
      });

      if (!response?.ok) {
        throw new Error(response?.error || '切换幽灵模式失败');
      }

      setGhostEnabled(Boolean(response.enabled));
      if (response.enabled) {
        await refreshGhostStateForActiveTab();
      } else {
        setAnalysisStatus('idle');
        setAnalysisResult(null);
        setAnalysisError('');
      }
    } catch (error) {
      const response = await browser.runtime
        .sendMessage({ type: GHOST_MESSAGE_TYPES.getState })
        .catch(() => null);
      setGhostEnabled(Boolean(response?.enabled));
      setAnalysisError(error instanceof Error ? error.message : String(error || '切换失败'));
    } finally {
      setGhostBusy(false);
    }
  }

  // 切换主题
  function handleThemePreferenceChange(preference: ThemePreference) {
    setThemePreference(preference);
    void browser.storage.local.set({
      [THEME_STORAGE_KEY]: preference,
    });
  }

  // 谷歌登录
  async function handleGoogleLogin() {
    setAuthStatus('checking');
    setAuthError('');

    const response = await browser.runtime
      .sendMessage({ type: AUTH_MESSAGE_TYPES.googleSignIn })
      .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));

    if (response?.ok && response.data?.user) {
      applyAuthUser(response.data.user as AuthUser);
      return;
    }

    setAuthStatus('signed_out');
    setAuthError(response?.error || 'Google 登录失败');
  }

  // 请求钱包
  async function sendWalletMessage(type: string, providerKey: WalletProviderKey) {
    const response = await browser.runtime
      .sendMessage({ type, providerKey })
      .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));

    if (!response?.ok || !response.data) {
      throw new Error(response?.error || '钱包请求失败');
    }

    return response.data as WalletState;
  }

  // 读取钱包
  async function refreshWalletState(options: { providerKey?: WalletProviderKey; silent?: boolean } = {}) {
    const providerKey = normalizeWalletProviderKey(options.providerKey || walletProviderKey);
    if (!options.silent) {
      setWalletBusy(true);
      setWalletError('');
    }

    try {
      const nextState = await sendWalletMessage(WALLET_MESSAGE_TYPES.getState, providerKey);
      setWalletState(nextState);
      if (!options.silent) setWalletError('');
      return nextState;
    } catch (error) {
      if (!options.silent) {
        setWalletError(error instanceof Error ? error.message : String(error || '钱包状态读取失败'));
      }
      return null;
    } finally {
      if (!options.silent) setWalletBusy(false);
    }
  }

  // 钱包操作
  async function runWalletAction(action: WalletAction, providerKey = walletProviderKey) {
    const normalizedProviderKey = normalizeWalletProviderKey(providerKey);
    setWalletBusy(true);
    setWalletError('');

    try {
      const type = action === 'connect'
        ? WALLET_MESSAGE_TYPES.connect
        : action === 'switch'
          ? WALLET_MESSAGE_TYPES.switchXLayer
          : WALLET_MESSAGE_TYPES.getState;
      const nextState = await sendWalletMessage(type, normalizedProviderKey);
      setWalletState(nextState);
      if (!portfolioAddressInput.trim()) {
        void refreshPortfolioSnapshot({ force: true, silent: true });
      }
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : String(error || '钱包操作失败'));
    } finally {
      setWalletBusy(false);
    }
  }

  // 选择钱包
  function handleWalletProviderChange(providerKey: WalletProviderKey) {
    setWalletProviderKey(providerKey);
    void runWalletAction('refresh', providerKey);
  }

  // 创建订单
  async function createPurchaseOrder(productType: 'membership' | 'usage_pack', code: string) {
    const type = productType === 'membership'
      ? MEMBERSHIP_MESSAGE_TYPES.createOrder
      : USAGE_PACK_MESSAGE_TYPES.createOrder;
    const response = await browser.runtime
      .sendMessage({
        type,
        ...(productType === 'membership' ? { planCode: code } : { packCode: code }),
      })
      .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));

    if (!response?.ok || !response.data) {
      throw new Error(response?.error || '订单创建失败');
    }

    return response.data as PaymentOrder;
  }

  // 发送付款
  async function sendPurchasePayment(order: PaymentOrder) {
    if (!order.paymentRequired || order.zeroPrice) {
      return {
        txHash: `free-${order.productType}-${order.orderId}`,
        account: walletState?.account || null,
        chainId: order.chainId,
        freeClaim: true,
      };
    }

    const chainOrderId = buildChainPaymentOrderId({
      orderId: order.orderId,
      productType: order.productType,
      itemName: order.itemName,
      amount: order.amount,
      symbol: order.paymentSymbol,
    });

    const response = await browser.runtime
      .sendMessage({
        type: WALLET_MESSAGE_TYPES.sendPayment,
        mode: 'xlayer',
        providerKey: walletProviderKey,
        to: order.recipientAddress,
        valueHex: order.valueHex,
        tokenAddress: order.paymentTokenAddress,
        tokenAmountHex: order.paymentAmountHex,
        tokenDecimals: order.paymentTokenDecimals,
        tokenSymbol: order.paymentSymbol,
        orderId: chainOrderId,
      })
      .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));

    if (!response?.ok || !response.data) {
      throw new Error(response?.error || '链上支付失败');
    }

    return response.data as {
      txHash?: string;
      account?: string | null;
      chainId?: string | number | null;
      freeClaim?: boolean;
    };
  }

  // 确认订单
  async function confirmPurchaseOrder(order: PaymentOrder, payment: { txHash?: string; account?: string | null; chainId?: string | number | null }) {
    const type = order.productType === 'membership'
      ? MEMBERSHIP_MESSAGE_TYPES.confirmOrder
      : USAGE_PACK_MESSAGE_TYPES.confirmOrder;
    const response = await browser.runtime
      .sendMessage({
        type,
        orderId: order.orderId,
        txHash: payment.txHash,
        senderAddress: payment.account,
        chainId: parseChainId(payment.chainId) || order.chainId,
      })
      .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));

    if (!response?.ok || !response.data) {
      throw new Error(response?.error || '订单确认失败');
    }

    return response.data as PaymentConfirmation;
  }

  // 执行购买
  async function handlePurchase(productType: 'membership' | 'usage_pack', code: string) {
    const busyKey = `${productType}:${code}`;
    setPurchaseBusyKey(busyKey);
    setPurchaseFeedback({
      tone: 'info',
      title: '正在处理',
      detail: '请按钱包弹窗完成链上支付。',
    });

    try {
      const catalogItem = productType === 'membership'
        ? getMembershipPlan(code, pricingCatalog.membershipPlans)
        : pricingCatalog.usagePacks.find((pack) => pack.code === code);
      if (!catalogItem || !isPaymentConfigReady(catalogItem)) {
        throw new Error('当前项目暂不可用');
      }

      const priceAmount = getItemPriceAmount(catalogItem);
      const order = await createPurchaseOrder(productType, code);
      const payment = await sendPurchasePayment(order);
      const confirmation = await confirmPurchaseOrder(order, payment);
      await Promise.all([
        refreshMembershipStatus({ silent: true, forceCatalog: true }),
        refreshWalletState({ silent: true }),
      ]);

      const detail = productType === 'usage_pack'
        ? `已到账 ${confirmation.creditCount ?? order.creditCount ?? 0} 次额度`
        : `已启用 ${order.itemName}`;
      setPurchaseFeedback({
        tone: 'success',
        title: payment.freeClaim ? '权益已启用' : '支付已确认',
        detail: `${detail} · ${priceAmount} ${order.paymentSymbol}`,
        txHash: payment.freeClaim ? undefined : payment.txHash,
      });
    } catch (error) {
      setPurchaseFeedback({
        tone: 'error',
        title: '购买失败',
        detail: error instanceof Error ? error.message : String(error || '购买失败'),
      });
    } finally {
      setPurchaseBusyKey('');
    }
  }

  // 读地址偏好
  async function loadPortfolioAddressPreference() {
    const result = await browser.storage.local
      .get(POLYMARKET_PORTFOLIO_ADDRESS_STORAGE_KEY)
      .catch(() => ({}));
    const normalized = normalizeEvmAddress(result[POLYMARKET_PORTFOLIO_ADDRESS_STORAGE_KEY]);
    const nextAddress = normalized || '';
    setPortfolioAddressInput(nextAddress);
    await refreshPortfolioSnapshot({ address: nextAddress, silent: true });
  }

  // 请求持仓
  async function requestPortfolioSnapshot(options: { address?: string; force?: boolean } = {}) {
    const rawAddress = options.address ?? portfolioAddressInput;
    const normalizedAddress = normalizeEvmAddress(rawAddress);

    if (!SHOW_WALLET_SURFACE && String(rawAddress || '').trim() && !normalizedAddress) {
      throw new Error('请输入有效的 EVM 地址');
    }

    if (!SHOW_WALLET_SURFACE && !normalizedAddress) {
      return createEmptyPortfolioSnapshot({
        source: 'none',
        mode: 'unresolved',
        message: '请手动填写 Polymarket 地址读取持仓。',
      });
    }

    const response = await browser.runtime
      .sendMessage({
        type: POLYMARKET_MESSAGE_TYPES.getPortfolio,
        address: normalizedAddress || rawAddress || null,
        providerKey: SHOW_WALLET_SURFACE ? walletProviderKey : null,
        force: Boolean(options.force),
      })
      .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));

    if (!response?.ok || !response.data) {
      throw new Error(response?.error || '持仓读取失败');
    }

    return response.data as PortfolioSnapshot;
  }

  // 刷新持仓
  async function refreshPortfolioSnapshot(options: { address?: string; force?: boolean; silent?: boolean } = {}) {
    const address = options.address ?? portfolioAddressInput;
    if (!options.silent) {
      setPortfolioBusy(true);
      setPortfolioError('');
    }

    try {
      const snapshot = await requestPortfolioSnapshot({
        address,
        force: options.force,
      });
      setPortfolioSnapshot(snapshot);
      if (!options.silent) setPortfolioError('');
      return snapshot;
    } catch (error) {
      if (!options.silent) {
        setPortfolioError(error instanceof Error ? error.message : String(error || '持仓读取失败'));
      }
      return null;
    } finally {
      if (!options.silent) setPortfolioBusy(false);
    }
  }

  // 保存地址
  async function handlePortfolioSaveAddress() {
    const normalized = normalizeEvmAddress(portfolioAddressInput);
    if (!normalized) {
      setPortfolioError('请输入有效的 EVM 地址');
      return;
    }

    setPortfolioBusy(true);
    setPortfolioError('');
    try {
      await browser.storage.local.set({
        [POLYMARKET_PORTFOLIO_ADDRESS_STORAGE_KEY]: normalized,
      });
      setPortfolioAddressInput(normalized);
      await refreshPortfolioSnapshot({ address: normalized, force: true, silent: true });
    } catch (error) {
      setPortfolioError(error instanceof Error ? error.message : String(error || '地址保存失败'));
    } finally {
      setPortfolioBusy(false);
    }
  }

  // 清除地址
  async function handlePortfolioClearAddress() {
    setPortfolioBusy(true);
    setPortfolioError('');
    try {
      await browser.storage.local.remove(POLYMARKET_PORTFOLIO_ADDRESS_STORAGE_KEY);
      setPortfolioAddressInput('');
      await refreshPortfolioSnapshot({ address: '', force: true, silent: true });
    } catch (error) {
      setPortfolioError(error instanceof Error ? error.message : String(error || '地址清除失败'));
    } finally {
      setPortfolioBusy(false);
    }
  }

  // 退出登录
  async function handleLogout() {
    setLogoutBusy(true);

    try {
      const response = await browser.runtime.sendMessage({ type: AUTH_MESSAGE_TYPES.logout });
      if (!response?.ok) {
        throw new Error(response?.error || '退出登录失败');
      }

      applyAuthUser(null);
      setActiveTab('feed');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error || '退出登录失败'));
    } finally {
      setLogoutBusy(false);
    }
  }

  if (authStatus === 'checking' && !authUser) {
    return <AuthLoading />;
  }

  if (!authUser) {
    return (
      <AuthPanel
        status={authStatus}
        error={authError}
        onGoogleLogin={handleGoogleLogin}
      />
    );
  }

  return (
    <main className="min-h-screen bg-(--paper) text-(--ink-1)">
      <nav
        className="sticky top-0 z-10 isolate mx-4 mb-2 mt-3 flex items-stretch gap-0 rounded-full border border-(--rule) bg-(--surface-strong) p-1"
        role="tablist"
        aria-label="主导航"
        data-active={getTabIndex(activeTab)}
      >
        <span
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-8px)/3)] rounded-full bg-(--paper) transition-transform duration-220 ease-in-out [box-shadow:0_1px_2px_rgb(17_24_39/10%)] ${
            activeTab === 'profile'
              ? 'translate-x-full'
              : activeTab === 'settings'
                ? 'translate-x-[200%]'
                : 'translate-x-0'
          }`}
          aria-hidden="true"
        />
        {SIDE_PANEL_TABS.map((tab) => (
          <TabButton key={tab.key} tab={tab} activeTab={activeTab} onSelect={setActiveTab} />
        ))}
      </nav>

      <div>
        <div hidden={activeTab !== 'feed'}>
          <FeedView
            channelStatus={channelStatus}
            analysisStatus={analysisStatus}
            ghostEnabled={ghostEnabled}
            result={analysisResult}
            error={analysisError}
            portfolioSnapshot={portfolioSnapshot}
            lastTitle={lastTitle}
            onAnalyze={handleAnalyzeClick}
          />
        </div>
        <div hidden={activeTab !== 'profile'}>
          <ProfileView
            user={authUser}
            membershipStatus={membershipStatus}
            pricingCatalog={pricingCatalog}
            purchaseBusyKey={purchaseBusyKey}
            purchaseFeedback={purchaseFeedback}
            walletState={walletState}
            walletProviderKey={walletProviderKey}
            walletBusy={walletBusy}
            walletError={walletError}
            portfolioSnapshot={portfolioSnapshot}
            portfolioAddressInput={portfolioAddressInput}
            portfolioBusy={portfolioBusy}
            portfolioError={portfolioError}
            logoutBusy={logoutBusy}
            onRefreshMembership={() => refreshMembershipStatus({ forceCatalog: true })}
            onPurchase={handlePurchase}
            onWalletProviderChange={handleWalletProviderChange}
            onWalletRefresh={() => runWalletAction('refresh')}
            onWalletConnect={() => runWalletAction('connect')}
            onWalletSwitchXLayer={() => runWalletAction('switch')}
            onPortfolioAddressInputChange={setPortfolioAddressInput}
            onPortfolioSaveAddress={handlePortfolioSaveAddress}
            onPortfolioClearAddress={handlePortfolioClearAddress}
            onPortfolioRefresh={() => refreshPortfolioSnapshot({ force: true })}
            onLogout={handleLogout}
          />
        </div>
        <div hidden={activeTab !== 'settings'}>
          <SettingsView
            ghostEnabled={ghostEnabled}
            ghostBusy={ghostBusy}
            themePreference={themePreference}
            resolvedTheme={resolvedTheme}
            onToggleGhost={handleGhostToggle}
            onThemePreferenceChange={handleThemePreferenceChange}
          />
        </div>
      </div>
    </main>
  );
}
