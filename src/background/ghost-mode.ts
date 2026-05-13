import {
  GHOST_CACHE_TTL_MS,
  GHOST_MAX_CACHE_ENTRIES,
  GHOST_MODE_STORAGE_KEY,
} from '../shared/config';
import { GHOST_MESSAGE_TYPES, PAGE_MESSAGE_TYPES } from '../shared/messages';
import {
  buildPageContext,
  isBlacklistedUrl,
  normalizeAnalysisResult,
  type AnalysisResult,
  type PageContext,
} from '../shared/analysis';
import { invokePolymarketAnalysis } from './api';
import type { Browser } from 'wxt/browser';

export type GhostStatus = 'idle' | 'analyzing' | 'opportunity' | 'no_opportunity' | 'blocked' | 'error';

export type GhostTriggerSource = 'manual' | 'ghost_mode' | '';

export type GhostStatePayload = {
  tabId: number | null;
  pageKey: string;
  pageTitle: string;
  pageUrl: string;
  status: GhostStatus;
  triggerSource: GhostTriggerSource;
  requestId: string;
  totalMarkets: number;
  matches: AnalysisResult['matches'];
  error: string;
  cached: boolean;
  updatedAt: string;
};

type StoredCache = {
  result: AnalysisResult;
  expiresAt: number;
};

type GhostStorage = {
  get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

type GhostControllerOptions = {
  browser: Browser;
  analyzePage?: (pageContext: PageContext) => Promise<AnalysisResult>;
  consumeAnalysisQuota?: () => Promise<unknown>;
  now?: () => number;
  createRequestId?: () => string;
};

type AnalyzePageOptions = {
  tabId?: number | null;
  allowBlacklisted?: boolean;
  triggerSource?: GhostTriggerSource;
};

// 标准布尔
function normalizeStoredBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : fallback;
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0' || normalized === '') return false;
  return fallback;
}

// 标准页键
export function buildGhostPageKey(pageContext: Pick<PageContext, 'url' | 'cacheKeyHint'>) {
  if (pageContext.cacheKeyHint) return `hint:${pageContext.cacheKeyHint}`;

  try {
    const parsed = new URL(pageContext.url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(pageContext.url || '');
  }
}

// 创建载荷
export function createGhostPayload(
  tabId: number | null,
  pageContext: PageContext,
  status: GhostStatus,
  result: AnalysisResult,
  options: {
    pageKey?: string;
    requestId?: string;
    triggerSource?: GhostTriggerSource;
    error?: string;
    cached?: boolean;
    updatedAt?: string;
  } = {},
): GhostStatePayload {
  return {
    tabId: Number.isFinite(tabId) ? Number(tabId) : null,
    pageKey: options.pageKey || buildGhostPageKey(pageContext),
    pageTitle: pageContext.title,
    pageUrl: pageContext.url,
    status,
    triggerSource: options.triggerSource || '',
    requestId: options.requestId || '',
    totalMarkets: result.totalMarkets,
    matches: result.matches,
    error: options.error || '',
    cached: Boolean(options.cached),
    updatedAt: options.updatedAt || new Date().toISOString(),
  };
}

// 创建控制器
export function createGhostModeController(options: GhostControllerOptions) {
  const browser = options.browser;
  const storage = browser.storage.local as GhostStorage;
  const analyzePage = options.analyzePage || invokePolymarketAnalysis;
  const consumeAnalysisQuota = options.consumeAnalysisQuota || (async () => undefined);
  const now = options.now || (() => Date.now());
  const createRequestId = options.createRequestId || (() => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

  const stateByTabId = new Map<number, GhostStatePayload>();
  const cacheByPageKey = new Map<string, StoredCache>();
  const inFlightByPageKey = new Map<string, Promise<AnalysisResult>>();

  // 写入缓存
  function setCachedResult(pageKey: string, result: AnalysisResult) {
    cacheByPageKey.set(pageKey, {
      result,
      expiresAt: now() + GHOST_CACHE_TTL_MS,
    });

    while (cacheByPageKey.size > GHOST_MAX_CACHE_ENTRIES) {
      const oldestKey = cacheByPageKey.keys().next().value;
      if (!oldestKey) break;
      cacheByPageKey.delete(oldestKey);
    }
  }

  // 读取缓存
  function getCachedResult(pageKey: string) {
    const cached = cacheByPageKey.get(pageKey);
    if (!cached) return null;
    if (cached.expiresAt <= now()) {
      cacheByPageKey.delete(pageKey);
      return null;
    }
    return cached.result;
  }

  // 通知面板
  async function notifyState(payload: GhostStatePayload) {
    try {
      await browser.runtime.sendMessage({
        type: GHOST_MESSAGE_TYPES.stateUpdated,
        payload,
      });
    } catch {
      // 无监听页
    }

    if (Number.isFinite(payload.tabId)) {
      try {
        await browser.tabs.sendMessage(Number(payload.tabId), {
          type: GHOST_MESSAGE_TYPES.stateUpdated,
          payload,
        });
      } catch {
        // 无内容页
      }
    }
  }

  // 广播模式
  async function notifyMode(enabled: boolean) {
    try {
      await browser.runtime.sendMessage({
        type: GHOST_MESSAGE_TYPES.modeChanged,
        enabled,
      });
    } catch {
      // 无监听页
    }

    try {
      const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
      await Promise.all(tabs.map(async (tab) => {
        if (!Number.isFinite(tab.id)) return;
        try {
          await browser.tabs.sendMessage(Number(tab.id), {
            type: GHOST_MESSAGE_TYPES.modeChanged,
            enabled,
          });
        } catch {
          // 跳过标签
        }
      }));
    } catch {
      // 查询失败
    }
  }

  // 保存状态
  async function setTabState(tabId: number | null, payload: GhostStatePayload) {
    if (!Number.isFinite(tabId)) return;
    stateByTabId.set(Number(tabId), payload);
    await notifyState(payload);
  }

  // 状态仍新
  function isCurrentRequest(tabId: number | null, pageKey: string, requestId: string) {
    if (!Number.isFinite(tabId)) return true;
    const current = stateByTabId.get(Number(tabId));
    if (!current) return false;
    return current.pageKey === pageKey && current.requestId === requestId;
  }

  // 运行分析
  async function analyzeWithCache(pageKey: string, pageContext: PageContext) {
    const cached = getCachedResult(pageKey);
    if (cached) {
      return { result: cached, cached: true };
    }

    const existing = inFlightByPageKey.get(pageKey);
    if (existing) {
      return { result: await existing, cached: false };
    }

    const promise = (async () => {
      await consumeAnalysisQuota();
      return normalizeAnalysisResult(await analyzePage(pageContext));
    })();

    inFlightByPageKey.set(pageKey, promise);
    try {
      const result = await promise;
      setCachedResult(pageKey, result);
      return { result, cached: false };
    } finally {
      inFlightByPageKey.delete(pageKey);
    }
  }

  // 分析页面
  async function analyzePageContext(rawPageContext: unknown, analyzeOptions: AnalyzePageOptions = {}) {
    let pageContext: PageContext;
    try {
      pageContext = buildPageContext(rawPageContext);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '页面无效');
      return { ok: false, error: message, payload: null };
    }

    const tabId = Number.isFinite(analyzeOptions.tabId) ? Number(analyzeOptions.tabId) : null;
    const pageKey = buildGhostPageKey(pageContext);
    const requestId = createRequestId();
    const triggerSource = analyzeOptions.triggerSource || 'ghost_mode';

    if (isBlacklistedUrl(pageContext.url) && !analyzeOptions.allowBlacklisted) {
      const payload = createGhostPayload(tabId, pageContext, 'blocked', { totalMarkets: 0, matches: [] }, {
        pageKey,
        requestId,
        triggerSource,
      });
      await setTabState(tabId, payload);
      return { ok: true, result: { totalMarkets: 0, matches: [] }, payload };
    }

    const analyzingPayload = createGhostPayload(tabId, pageContext, 'analyzing', { totalMarkets: 0, matches: [] }, {
      pageKey,
      requestId,
      triggerSource,
    });
    await setTabState(tabId, analyzingPayload);

    try {
      const { result, cached } = await analyzeWithCache(pageKey, pageContext);
      const status = result.matches.length ? 'opportunity' : 'no_opportunity';
      const payload = createGhostPayload(tabId, pageContext, status, result, {
        pageKey,
        requestId,
        triggerSource,
        cached,
      });

      if (isCurrentRequest(tabId, pageKey, requestId)) {
        await setTabState(tabId, payload);
      }

      return { ok: true, result, payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '分析失败');
      const payload = createGhostPayload(tabId, pageContext, 'error', { totalMarkets: 0, matches: [] }, {
        pageKey,
        requestId,
        triggerSource,
        error: message,
      });

      if (isCurrentRequest(tabId, pageKey, requestId)) {
        await setTabState(tabId, payload);
      }

      return { ok: false, error: message, payload };
    }
  }

  // 抽取标签
  async function analyzeTab(tabId: number, triggerSource: GhostTriggerSource = 'ghost_mode') {
    const response = await browser.tabs.sendMessage(tabId, {
      type: PAGE_MESSAGE_TYPES.extract,
    }).catch(() => null);

    if (!response || typeof response !== 'object' || !(response as { ok?: unknown }).ok) {
      throw new Error((response as { error?: string } | null)?.error || '页面内容采集失败');
    }

    return analyzePageContext((response as { pageContext?: unknown }).pageContext, {
      tabId,
      triggerSource,
    });
  }

  // 分析活动页
  async function analyzeActiveTab() {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    const tabId = Number(tab?.id);
    const tabUrl = typeof tab?.url === 'string' ? tab.url : '';
    if (!Number.isFinite(tabId) || !/^https?:/i.test(tabUrl)) return null;

    return analyzeTab(tabId, 'ghost_mode').catch(() => null);
  }

  // 读取开关
  async function getEnabled() {
    const result = await storage.get(GHOST_MODE_STORAGE_KEY);
    const raw = result[GHOST_MODE_STORAGE_KEY];
    const hasValue = Object.prototype.hasOwnProperty.call(result, GHOST_MODE_STORAGE_KEY);
    const enabled = normalizeStoredBoolean(raw, false);

    if (!hasValue || raw !== enabled) {
      await storage.set({ [GHOST_MODE_STORAGE_KEY]: enabled });
    }

    return enabled;
  }

  // 设置开关
  async function setEnabled(enabled: boolean) {
    const nextEnabled = Boolean(enabled);
    await storage.set({ [GHOST_MODE_STORAGE_KEY]: nextEnabled });
    await notifyMode(nextEnabled);

    if (nextEnabled) {
      void analyzeActiveTab();
    }

    return nextEnabled;
  }

  // 内容就绪
  async function handleContentReady(sender: Browser.runtime.MessageSender) {
    if (!await getEnabled()) return;
    const tabId = Number(sender.tab?.id);
    if (!Number.isFinite(tabId)) return;
    await analyzeTab(tabId, 'ghost_mode').catch(() => undefined);
  }

  // 标签关闭
  function handleTabRemoved(tabId: number) {
    if (!Number.isFinite(tabId)) return;
    stateByTabId.delete(Number(tabId));
  }

  // 当前状态
  function getTabState(tabId: unknown) {
    const normalizedTabId = Number(tabId);
    if (!Number.isFinite(normalizedTabId)) return null;
    return stateByTabId.get(normalizedTabId) || null;
  }

  return {
    analyzeActiveTab,
    analyzePageContext,
    analyzeTab,
    getEnabled,
    getTabState,
    handleContentReady,
    handleTabRemoved,
    setEnabled,
  };
}
