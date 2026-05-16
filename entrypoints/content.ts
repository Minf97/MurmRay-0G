import { browser } from 'wxt/browser';
import { WEB_PAGE_MATCHES } from '../src/shared/manifest';
import { CORE_MESSAGE_TYPES, GHOST_MESSAGE_TYPES, PAGE_MESSAGE_TYPES } from '../src/shared/messages';
import { readPageContext } from '../src/content/page-context';
import { createContentWidgetController } from '../src/content/widget/controller';
import { getContentRuntime, sendContentRuntimeMessage } from '../src/content/runtime';

const READY_DELAY_MS = 700;

let readyTimer: ReturnType<typeof setTimeout> | null = null;

// 广播就绪
function notifyContentReady() {
  void sendContentRuntimeMessage(browser, {
    type: CORE_MESSAGE_TYPES.contentReady,
    url: location.href,
    title: document.title,
  })
    .catch(() => undefined);
}

// 延迟广播
function scheduleContentReady(delayMs = READY_DELAY_MS) {
  if (readyTimer) clearTimeout(readyTimer);

  readyTimer = setTimeout(() => {
    readyTimer = null;
    notifyContentReady();
  }, delayMs);
}

// 监听导航
function installNavigationWatchers(onChange: () => void) {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    originalPushState.apply(this, args);
    onChange();
  };

  history.replaceState = function replaceState(...args) {
    originalReplaceState.apply(this, args);
    onChange();
  };

  window.addEventListener('popstate', onChange);
  window.addEventListener('hashchange', onChange);
}

// 页面消息
function handlePageExtract(sendResponse: (value?: unknown) => void) {
  try {
    sendResponse({ ok: true, pageContext: readPageContext() });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error || '采集失败');
    sendResponse({ ok: false, error: text });
  }
}

export default defineContentScript({
  matches: [...WEB_PAGE_MATCHES],
  runAt: 'document_idle',
  main() {
    const widget = createContentWidgetController({
      browser,
      readPageContext,
      scheduleContentReady,
    });

    // 监听消息
    getContentRuntime(browser).onMessage?.addListener((message: unknown, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') return false;
      const typedMessage = message as { type?: unknown; enabled?: unknown; payload?: unknown };

      if (typedMessage.type === PAGE_MESSAGE_TYPES.extract) {
        handlePageExtract(sendResponse);
        return false;
      }

      if (typedMessage.type === GHOST_MESSAGE_TYPES.modeChanged) {
        widget.setGhostModeEnabled(Boolean(typedMessage.enabled));
        return false;
      }

      if (typedMessage.type === GHOST_MESSAGE_TYPES.stateUpdated && typedMessage.payload) {
        widget.applyAnalysisPayload(typedMessage.payload);
        return false;
      }

      return false;
    });

    // 初始就绪
    scheduleContentReady(0);

    // 初始化球
    void widget.init();
    widget.installWindowListeners();
    installNavigationWatchers(widget.handleLocationMaybeChanged);
  },
});
