import { browser } from 'wxt/browser';
import { WEB_PAGE_MATCHES } from '../src/shared/manifest';
import { CORE_MESSAGE_TYPES, PAGE_MESSAGE_TYPES } from '../src/shared/messages';
import { buildPageContext, clipText, extractTwitterStatusId } from '../src/shared/analysis';

// 提取页面
function readPageContext() {
  return buildPageContext({
    title: document.title,
    url: location.href,
    pageText: clipText(document.body?.innerText || document.body?.textContent || '', 12_000),
    selectedText: clipText(window.getSelection()?.toString() || '', 2_000),
    cacheKeyHint: extractTwitterStatusId(location.href)
      ? `twitter-status:${extractTwitterStatusId(location.href)}`
      : '',
  });
}

export default defineContentScript({
  matches: [...WEB_PAGE_MATCHES],
  runAt: 'document_idle',
  main() {
    // 处理采集
    browser.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: (value?: unknown) => void) => {
      if (!message || typeof message !== 'object') return false;

      if ('type' in message && message.type === PAGE_MESSAGE_TYPES.extract) {
        try {
          sendResponse({ ok: true, pageContext: readPageContext() });
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error || '采集失败');
          sendResponse({ ok: false, error: text });
        }
        return false;
      }

      return false;
    });

    // 广播就绪
    void browser.runtime
      .sendMessage({
        type: CORE_MESSAGE_TYPES.contentReady,
        url: location.href,
        title: document.title,
      })
      .catch(() => undefined);
  },
});
