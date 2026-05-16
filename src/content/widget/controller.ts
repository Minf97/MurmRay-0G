import { GHOST_MESSAGE_TYPES } from '../../shared/messages';
import { isBlacklistedUrl, type PageContext } from '../../shared/analysis';
import { normalizeWidgetMatches, resolveWidgetStatus, type WidgetState } from '../widget-model';
import { createWidgetElements } from './dom';
import { createWidgetDragController } from './drag';
import { renderWidget } from './render';
import { installWidgetThemeSync, loadWidgetThemePreference, type WidgetThemeStorage } from './theme';

type BrowserLike = {
  runtime: { sendMessage(message: unknown): Promise<any> };
  storage: WidgetThemeStorage & {
    local: WidgetThemeStorage['local'] & { set(items: Record<string, unknown>): Promise<void> };
  };
};

type WidgetOptions = {
  browser: BrowserLike;
  readPageContext: () => PageContext;
  openSidepanel?: () => void;
  scheduleContentReady: () => void;
};

const ANALYZE_DELAY_MS = 1100;
const URL_WATCH_MS = 700;

// 事件路径
function getEventPath(event: Event) {
  if (typeof event.composedPath === 'function') return event.composedPath();

  const path: EventTarget[] = [];
  let node = event.target as Node | null;
  while (node) {
    path.push(node);
    node = node.parentNode;
  }
  path.push(window);
  return path;
}

// 创建控制器
export function createContentWidgetController(options: WidgetOptions) {
  const elements = createWidgetElements();
  const drag = createWidgetDragController(elements, options.browser.storage);
  const widgetState: WidgetState & { requestToken: number } = {
    enabled: false,
    status: 'idle',
    matches: [],
    totalMarkets: 0,
    collapsedToSparkle: false,
    requestToken: 0,
  };

  let analyzeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHref = location.href;

  // 渲染状态
  function render() {
    renderWidget(elements, widgetState);
    drag.scheduleClamp();
  }

  // 清理定时
  function clearAnalyzeTimer() {
    if (!analyzeTimer) return;
    clearTimeout(analyzeTimer);
    analyzeTimer = null;
  }

  // 重置结果
  function resetResult(status: WidgetState['status']) {
    widgetState.status = status;
    widgetState.matches = [];
    widgetState.totalMarkets = 0;
    widgetState.collapsedToSparkle = false;
  }

  // 空闲状态
  function setManualIdleState() {
    resetResult('idle');
  }

  // 跳过状态
  function setBlockedState() {
    resetResult('blocked');
  }

  // 应用结果
  function applyAnalysisPayload(payload: unknown) {
    const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    widgetState.status = resolveWidgetStatus(data);
    widgetState.matches = normalizeWidgetMatches(data.matches);
    widgetState.totalMarkets = Number(data.totalMarkets || 0);
    widgetState.collapsedToSparkle = false;
    render();
  }

  // 打开面板
  function openSidepanel() {
    if (options.openSidepanel) {
      options.openSidepanel();
      return;
    }

    void options.browser.runtime
      .sendMessage({ type: GHOST_MESSAGE_TYPES.openSidepanel })
      .catch(() => undefined);
  }

  // 分析当前页
  async function analyzeCurrentPage(optionsArg: { force?: boolean; allowBlacklisted?: boolean; triggerSource?: 'manual' | 'ghost_mode' } = {}) {
    const force = Boolean(optionsArg.force);
    if (!widgetState.enabled && !force) return;

    if (isBlacklistedUrl(location.href) && !force) {
      setBlockedState();
      render();
      return;
    }

    let pageContext: PageContext;
    try {
      pageContext = options.readPageContext();
    } catch {
      resetResult('error');
      render();
      return;
    }

    const requestToken = widgetState.requestToken + 1;
    widgetState.requestToken = requestToken;
    resetResult('analyzing');
    render();

    try {
      const response = await options.browser.runtime.sendMessage({
        type: GHOST_MESSAGE_TYPES.analyzePage,
        pageContext,
        allowBlacklisted: Boolean(optionsArg.allowBlacklisted),
        triggerSource: optionsArg.triggerSource || (widgetState.enabled ? 'ghost_mode' : 'manual'),
      });

      if (requestToken !== widgetState.requestToken) return;
      if (!response?.ok && !response?.payload) {
        widgetState.status = 'error';
        render();
        return;
      }

      applyAnalysisPayload(response?.payload || {
        status: Array.isArray(response?.matches) && response.matches.length > 0 ? 'opportunity' : 'no_opportunity',
        totalMarkets: Number(response?.totalMarkets || 0),
        matches: Array.isArray(response?.matches) ? response.matches : [],
      });
    } catch {
      if (requestToken !== widgetState.requestToken) return;
      widgetState.status = 'error';
      render();
    }
  }

  // 计划分析
  function scheduleAnalyze(delayMs = ANALYZE_DELAY_MS) {
    if (!widgetState.enabled || isBlacklistedUrl(location.href)) {
      clearAnalyzeTimer();
      return;
    }

    clearAnalyzeTimer();
    analyzeTimer = setTimeout(() => {
      analyzeTimer = null;
      void analyzeCurrentPage({ allowBlacklisted: false, force: false, triggerSource: 'ghost_mode' });
    }, delayMs);
  }

  // 设置幽灵
  function setGhostModeEnabled(enabled: boolean) {
    widgetState.enabled = Boolean(enabled);
    widgetState.requestToken += 1;
    clearAnalyzeTimer();

    if (!widgetState.enabled) {
      setManualIdleState();
      render();
      return;
    }

    if (isBlacklistedUrl(location.href)) {
      setBlockedState();
      render();
      return;
    }

    resetResult('analyzing');
    render();
    scheduleAnalyze(150);
  }

  // 点击组件
  function handleWidgetClick(event: Event) {
    if (drag.suppressNextClick()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const path = getEventPath(event);
    const onDismiss = path.some((node) => (node as Element)?.classList?.contains('dismiss'));
    const onCard = path.some((node) => (node as Element)?.classList?.contains('ghost-card'));
    const onPill = path.some((node) => (node as Element)?.classList?.contains('ghost-pill'));

    if (onDismiss) {
      event.preventDefault();
      event.stopPropagation();
      widgetState.collapsedToSparkle = true;
      render();
      return;
    }

    if (widgetState.status === 'analyzing') return;
    if (widgetState.status === 'blocked') return;

    if (widgetState.status === 'opportunity') {
      if (onCard || !widgetState.collapsedToSparkle) openSidepanel();
      else {
        widgetState.collapsedToSparkle = false;
        render();
      }
      return;
    }

    if (onPill && (widgetState.status === 'no_opportunity' || widgetState.status === 'error')) {
      void analyzeCurrentPage({ allowBlacklisted: true, force: true, triggerSource: 'manual' });
      return;
    }

    void analyzeCurrentPage({ allowBlacklisted: true, force: true, triggerSource: 'manual' });
  }

  // 检查跳转
  function handleLocationMaybeChanged() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    widgetState.requestToken += 1;
    clearAnalyzeTimer();
    widgetState.matches = [];
    widgetState.totalMarkets = 0;
    widgetState.collapsedToSparkle = false;

    if (widgetState.enabled) {
      if (isBlacklistedUrl(location.href)) setBlockedState();
      else {
        widgetState.status = 'analyzing';
        scheduleAnalyze();
      }
    } else {
      setManualIdleState();
    }

    render();
    options.scheduleContentReady();
  }

  return {
    async init() {
      drag.bind();
      await loadWidgetThemePreference(elements, options.browser.storage);
      installWidgetThemeSync(elements, options.browser.storage);
      await drag.loadPosition();
      render();

      elements.disk.addEventListener('click', handleWidgetClick);
      elements.card.addEventListener('click', handleWidgetClick);
      elements.card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        handleWidgetClick(event);
      });
      elements.pill.addEventListener('click', handleWidgetClick);

      const response = await options.browser.runtime
        .sendMessage({ type: GHOST_MESSAGE_TYPES.getState })
        .catch(() => null);
      setGhostModeEnabled(Boolean(response?.enabled));
    },

    handleLocationMaybeChanged,

    installWindowListeners() {
      window.addEventListener('pageshow', () => {
        if (widgetState.enabled) scheduleAnalyze(250);
      });
      window.addEventListener('resize', drag.scheduleClamp);
      window.setInterval(handleLocationMaybeChanged, URL_WATCH_MS);
    },

    applyAnalysisPayload,
    setGhostModeEnabled,
  };
}
