import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { EXTENSION_NAME } from '../../src/shared/manifest';
import { ANALYSIS_MESSAGE_TYPES, CORE_MESSAGE_TYPES, PAGE_MESSAGE_TYPES } from '../../src/shared/messages';
import { mergeMatches, type AnalysisResult, type PageContext } from '../../src/shared/analysis';

type ChannelStatus = 'checking' | 'ready' | 'error';
type AnalysisStatus = 'idle' | 'loading' | 'ready' | 'error';

const STATUS_COPY: Record<ChannelStatus, string> = {
  checking: '正在检测消息通道',
  ready: '消息通道已就绪',
  error: '消息通道异常',
};

const ANALYSIS_COPY: Record<AnalysisStatus, string> = {
  idle: '等待分析',
  loading: '正在分析当前页面',
  ready: '分析完成',
  error: '分析失败',
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

// 状态样式
function getStatusTone(status: ChannelStatus) {
  if (status === 'ready') return 'text-emerald-600';
  if (status === 'error') return 'text-rose-600';
  return 'text-amber-600';
}

// 分析样式
function getAnalysisTone(status: AnalysisStatus) {
  if (status === 'ready') return 'text-emerald-600';
  if (status === 'error') return 'text-rose-600';
  if (status === 'loading') return 'text-blue-600';
  return 'text-slate-500';
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

// 结果文案
function formatMatchSummary(result: AnalysisResult | null) {
  if (!result) return '点击按钮开始分析';
  if (!result.matches.length) return `已扫描 ${result.totalMarkets} 个盘口，未发现匹配`;
  return `已匹配 ${result.matches.length} 个盘口，共扫描 ${result.totalMarkets} 个盘口`;
}

// 链接文案
function safeLink(url: string | null) {
  if (!url) return '#';
  return url;
}

export function App() {
  const [status, setStatus] = useState<ChannelStatus>('checking');
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

    // 读取状态
    void detectChannelStatus().then((nextStatus) => {
      if (!alive) return;
      setStatus(nextStatus);
    });

    return () => {
      alive = false;
    };
  }, []);

  async function handleAnalyzeClick() {
    setAnalysisStatus('loading');
    setAnalysisError('');

    try {
      const pageContext = await readActivePageContext();
      setLastTitle(pageContext.title);

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
      setAnalysisStatus('error');
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-5 py-6 text-slate-950">
      <section className="mx-auto max-w-lg rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">
          Manual Analysis
        </p>
        <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-slate-950">
          {EXTENSION_NAME}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          点击按钮后，会抓取当前网页并请求 Polymarket 机会分析。
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleAnalyzeClick}
            disabled={analysisStatus === 'loading'}
            className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            分析当前页面
          </button>
          <p className={`flex items-center text-sm font-medium ${getAnalysisTone(analysisStatus)}`}>
            {ANALYSIS_COPY[analysisStatus]}
          </p>
        </div>

        {analysisError ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {analysisError}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3">
          <article className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Channel
            </span>
            <p className={`mt-2 text-sm font-medium ${getStatusTone(status)}`}>
              {STATUS_COPY[status]}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Stack
            </span>
            <p className="mt-2 text-sm text-slate-700">
              WXT / React / Tailwind
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Page
            </span>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {lastTitle || '尚未分析'}
            </p>
          </article>
        </div>

        <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">分析结果</h2>
            <p className="text-xs text-slate-500">{formatMatchSummary(analysisResult)}</p>
          </div>

          {analysisResult?.matches?.length ? (
            <div className="mt-4 grid gap-3">
              {mergeMatches(analysisResult.matches).map((match) => (
                <a
                  key={match.marketId}
                  href={safeLink(match.marketUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/60"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-950">{match.question || '未命名盘口'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {match.direction || '不确定'} · #{match.marketId}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">
                      {Math.round(match.confidence)}%
                    </span>
                  </div>
                  {match.reason ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600">{match.reason}</p>
                  ) : null}
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              {analysisStatus === 'loading'
                ? '分析中...'
                : analysisResult
                  ? '当前页面没有匹配盘口'
                  : '等待发起分析'}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
