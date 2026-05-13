import { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { EXTENSION_NAME } from '../../src/shared/manifest';
import { ANALYSIS_MESSAGE_TYPES, AUTH_MESSAGE_TYPES, CORE_MESSAGE_TYPES, GHOST_MESSAGE_TYPES, PAGE_MESSAGE_TYPES } from '../../src/shared/messages';
import type { AnalysisMatch, AnalysisResult, PageContext } from '../../src/shared/analysis';
import type { AuthUser } from '../../src/shared/auth';
import type { GhostStatePayload } from '../../src/background/ghost-mode';
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

type ChannelStatus = 'checking' | 'ready' | 'error';
type ActiveTabInfo = { id: number; title: string };

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
}: {
  status: AnalysisStatus;
  result: AnalysisResult | null;
  error: string;
}) {
  const matches = useMemo(() => getVisibleMatches(result), [result]);

  if (status === 'loading') {
    return <EmptyResult status="loading" message="正在读取页面并匹配 Polymarket 盘口。" />;
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
  lastTitle,
  onAnalyze,
}: {
  channelStatus: ChannelStatus;
  analysisStatus: AnalysisStatus;
  ghostEnabled: boolean;
  result: AnalysisResult | null;
  error: string;
  lastTitle: string;
  onAnalyze: () => void;
}) {
  return (
    <section id="view-feed" role="tabpanel" aria-labelledby="tab-feed">
      <header className="flex items-start justify-between gap-4 border-b border-(--rule) px-4 pb-4 pt-[18px]">
        <div className="min-w-0">
          <p className="m-0 mb-1.5 text-[11px] font-bold uppercase tracking-normal text-(--accent)">{EXTENSION_NAME}</p>
          <h1 className="m-0 text-2xl font-[650] leading-[1.15] tracking-normal text-(--ink-1)">信号</h1>
          <p className="mb-0 mt-2 line-clamp-2 max-w-[42ch] overflow-hidden text-[13px] leading-[1.4] text-(--ink-3)">{lastTitle || '尚未读取当前页面'}</p>
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

      <div className="flex min-h-11 items-center gap-2 overflow-x-auto border-b border-(--rule) px-4" aria-label="运行状态">
        <StatusPill label={STATUS_COPY[channelStatus]} tone={statusTone(channelStatus)} />
        <StatusPill label={ANALYSIS_COPY[analysisStatus]} tone={statusTone(analysisStatus)} />
        <StatusPill label={ghostEnabled ? '幽灵模式开' : '幽灵模式关'} tone={ghostEnabled ? 'success' : 'neutral'} />
        <span className="shrink-0 text-xs tabular-nums text-(--ink-3)">{summarizeAnalysis(result)}</span>
      </div>

      <ResultBoard status={analysisStatus} result={result} error={error} />
    </section>
  );
}

// 我的视图
function ProfileView({
  user,
  logoutBusy,
  onLogout,
}: {
  user: AuthUser;
  logoutBusy: boolean;
  onLogout: () => void;
}) {
  return (
    <section id="view-profile" role="tabpanel" aria-labelledby="tab-profile">
      <UserProfile user={user} logoutBusy={logoutBusy} onLogout={onLogout} />

      <div className="flex min-h-[60px] items-center justify-between gap-3 border-b border-(--rule) px-4">
        <span className="text-sm font-semibold text-(--ink-1)">会员状态</span>
        <span className="inline-flex min-h-[22px] items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2)">待迁移</span>
      </div>
    </section>
  );
}

// 设置视图
function SettingsView({
  ghostEnabled,
  ghostBusy,
  onToggleGhost,
}: {
  ghostEnabled: boolean;
  ghostBusy: boolean;
  onToggleGhost: (enabled: boolean) => void;
}) {
  return (
    <section id="view-settings" role="tabpanel" aria-labelledby="tab-settings">
      <div className="flex min-h-[60px] items-center justify-between gap-3 border-b border-(--rule) px-4">
        <div className="inline-flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-(--ink-1)">幽灵模式</span>
          <span className="inline-flex min-h-[22px] items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2)">{ghostEnabled ? '已开启' : '已关闭'}</span>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center" aria-label="幽灵模式">
          <input
            className="peer sr-only"
            type="checkbox"
            checked={ghostEnabled}
            disabled={ghostBusy}
            onChange={(event) => onToggleGhost(event.currentTarget.checked)}
          />
          <span className="relative h-5 w-[34px] rounded-full bg-(--rule-strong) transition-colors duration-160 peer-checked:bg-(--ink-1) peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--accent) peer-checked:[&>span]:translate-x-3.5" aria-hidden="true">
            <span className="absolute left-[3px] top-[3px] size-3.5 rounded-full bg-(--paper) transition-transform duration-160 [box-shadow:0_1px_2px_rgb(17_24_39/18%)]" />
          </span>
        </label>
      </div>
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
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authError, setAuthError] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);

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
      return;
    }

    applyAuthUser(null);
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
    void refreshGhostStateForActiveTab();

    // 监听运行态
    const handleRuntimeMessage = (message: unknown) => {
      if (!message || typeof message !== 'object') return false;
      const typedMessage = message as { type?: unknown; enabled?: unknown; payload?: GhostStatePayload; user?: AuthUser | null };

      if (typedMessage.type === AUTH_MESSAGE_TYPES.stateChanged) {
        applyAuthUser(typedMessage.user || null);
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
            lastTitle={lastTitle}
            onAnalyze={handleAnalyzeClick}
          />
        </div>
        <div hidden={activeTab !== 'profile'}>
          <ProfileView user={authUser} logoutBusy={logoutBusy} onLogout={handleLogout} />
        </div>
        <div hidden={activeTab !== 'settings'}>
          <SettingsView
            ghostEnabled={ghostEnabled}
            ghostBusy={ghostBusy}
            onToggleGhost={handleGhostToggle}
          />
        </div>
      </div>
    </main>
  );
}
