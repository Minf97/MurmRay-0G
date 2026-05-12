import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { EXTENSION_NAME } from '../../src/shared/manifest';
import { ANALYSIS_MESSAGE_TYPES, CORE_MESSAGE_TYPES, PAGE_MESSAGE_TYPES } from '../../src/shared/messages';
import type { AnalysisMatch, AnalysisResult, PageContext } from '../../src/shared/analysis';
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

type ChannelStatus = 'checking' | 'ready' | 'error';

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
      className={`tab-bar-item${isActive ? ' is-active' : ''}`}
      onClick={() => onSelect(tab.key)}
    >
      <span className="tab-bar-icon">
        <TabIcon tab={tab.key} />
      </span>
      <span>{tab.label}</span>
    </button>
  );
}

// 状态圆点
function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`status-pill ${tone}`}>
      <span className="status-dot" aria-hidden="true" />
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
    <span className="gauge-shell">
      <svg className="gauge" viewBox="0 0 44 44" aria-hidden="true">
        <circle className="gauge-track" cx="22" cy="22" r={radius} />
        <circle
          className="gauge-fill"
          data-tier={tier.key}
          cx="22"
          cy="22"
          r={radius}
          strokeDasharray={circumference.toFixed(2)}
          strokeDashoffset={dashOffset.toFixed(2)}
        />
      </svg>
      <span className="gauge-value">{safeScore}</span>
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
      className="opportunity-item"
      onClick={() => openMarket(match.marketUrl)}
      disabled={!match.marketUrl}
      aria-label={`打开盘口：${match.question || '未命名盘口'}`}
    >
      <span className="row-body">
        <span className="opportunity-question-row">
          <span className="row-icon" data-tier={tier.key} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M22 7 13.5 15.5 9 11l-7 7" />
              <path d="M16 7h6v6" />
            </svg>
          </span>
          <span className="opportunity-question">{match.question || '未命名盘口'}</span>
        </span>
        <span className="row-source">Polymarket · #{match.marketId}</span>
        <span className="opportunity-badges">
          <span className={`badge badge-direction ${direction.tone}`}>{direction.label}</span>
        </span>
        {match.reason ? <span className="opportunity-reason">{match.reason}</span> : null}
      </span>

      <span className="row-score">
        <ScoreGauge score={score} />
        <span className="score-label" data-tier={tier.key}>{tier.label}</span>
      </span>

      <span className="row-arrow" aria-hidden="true">
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
    <article className={`result-card ${status}`}>
      <span className="result-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M2 8.82a15 15 0 0 1 20 0" />
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <circle cx="12" cy="20" r="0.6" />
        </svg>
      </span>
      <h2>{ANALYSIS_COPY[status]}</h2>
      <p>{message}</p>
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
    <section className="result-panel" aria-label="分析结果">
      <div className="opportunity-list">
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
  result,
  error,
  lastTitle,
  onAnalyze,
}: {
  channelStatus: ChannelStatus;
  analysisStatus: AnalysisStatus;
  result: AnalysisResult | null;
  error: string;
  lastTitle: string;
  onAnalyze: () => void;
}) {
  return (
    <section id="view-feed" className="view is-active" role="tabpanel" aria-labelledby="tab-feed">
      <header className="feed-header">
        <div className="feed-title-block">
          <p className="eyebrow">{EXTENSION_NAME}</p>
          <h1>信号</h1>
          <p className="page-title">{lastTitle || '尚未读取当前页面'}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onAnalyze}
          disabled={analysisStatus === 'loading'}
        >
          {analysisStatus === 'loading' ? '分析中' : '分析当前页'}
        </button>
      </header>

      <div className="status-strip" aria-label="运行状态">
        <StatusPill label={STATUS_COPY[channelStatus]} tone={statusTone(channelStatus)} />
        <StatusPill label={ANALYSIS_COPY[analysisStatus]} tone={statusTone(analysisStatus)} />
        <span className="status-summary">{summarizeAnalysis(result)}</span>
      </div>

      <ResultBoard status={analysisStatus} result={result} error={error} />
    </section>
  );
}

// 我的视图
function ProfileView() {
  return (
    <section id="view-profile" className="view" role="tabpanel" aria-labelledby="tab-profile">
      <div className="profile-block">
        <span className="profile-avatar" aria-hidden="true">M</span>
        <div className="profile-copy">
          <h2>访客</h2>
          <p>登录与会员将在后续功能迁移。</p>
        </div>
      </div>

      <div className="setting-row">
        <span className="setting-label-text">会员状态</span>
        <span className="badge">未接入</span>
      </div>
    </section>
  );
}

// 设置视图
function SettingsView() {
  return (
    <section id="view-settings" className="view" role="tabpanel" aria-labelledby="tab-settings">
      <div className="setting-row">
        <div className="setting-label-group">
          <span className="setting-label-text">幽灵模式</span>
          <span className="badge">待迁移</span>
        </div>
        <label className="ghost-mode-toggle" aria-label="幽灵模式">
          <input type="checkbox" disabled />
          <span className="ghost-mode-track" aria-hidden="true">
            <span className="ghost-mode-thumb" />
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

    return () => {
      alive = false;
    };
  }, []);

  // 触发分析
  async function handleAnalyzeClick() {
    setActiveTab('feed');
    setAnalysisStatus('loading');
    setAnalysisError('');

    try {
      const pageContext = await readActivePageContext();
      setLastTitle(pageContext.title);

      if (shouldSkipPage(pageContext)) {
        setAnalysisResult(null);
        setAnalysisStatus('blocked');
        return;
      }

      const response = await browser.runtime.sendMessage({
        type: ANALYSIS_MESSAGE_TYPES.analyzePage,
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

  return (
    <main className="sidepanel-shell">
      <nav
        className="tab-bar"
        role="tablist"
        aria-label="主导航"
        data-active={getTabIndex(activeTab)}
      >
        <span className="tab-bar-indicator" aria-hidden="true" />
        {SIDE_PANEL_TABS.map((tab) => (
          <TabButton key={tab.key} tab={tab} activeTab={activeTab} onSelect={setActiveTab} />
        ))}
      </nav>

      <div className="views">
        <div hidden={activeTab !== 'feed'}>
          <FeedView
            channelStatus={channelStatus}
            analysisStatus={analysisStatus}
            result={analysisResult}
            error={analysisError}
            lastTitle={lastTitle}
            onAnalyze={handleAnalyzeClick}
          />
        </div>
        <div hidden={activeTab !== 'profile'}>
          <ProfileView />
        </div>
        <div hidden={activeTab !== 'settings'}>
          <SettingsView />
        </div>
      </div>
    </main>
  );
}
