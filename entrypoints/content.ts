import { browser } from 'wxt/browser';
import { WEB_PAGE_MATCHES } from '../src/shared/manifest';
import { CORE_MESSAGE_TYPES } from '../src/shared/messages';

export default defineContentScript({
  matches: [...WEB_PAGE_MATCHES],
  runAt: 'document_idle',
  main() {
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
