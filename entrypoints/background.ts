import { browser } from 'wxt/browser';
import { ANALYSIS_MESSAGE_TYPES, CORE_MESSAGE_TYPES, createCorePong } from '../src/shared/messages';
import { invokePolymarketAnalysis } from '../src/background/api';
import { buildPageContext } from '../src/shared/analysis';
import type { Browser } from 'wxt/browser';

type RuntimeMessage = {
  type: string;
  pageContext?: unknown;
};

type RuntimeSender = Browser.runtime.MessageSender;
type RuntimeResponse = (response?: unknown) => void;

// 判定消息
function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  return Boolean(message)
    && typeof message === 'object'
    && 'type' in message!
    && typeof (message as { type?: unknown }).type === 'string';
}

// 绑定面板
async function applySidePanelBehavior() {
  if (!browser.sidePanel?.setPanelBehavior) return;

  try {
    await browser.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error('[murmray] failed to set sidepanel behavior', error);
  }
}

// 处理消息
function handleRuntimeMessage(message: unknown, _sender: RuntimeSender, sendResponse: RuntimeResponse) {
  if (!isRuntimeMessage(message)) {
    return false;
  }

  if (message.type === CORE_MESSAGE_TYPES.ping) {
    sendResponse(createCorePong());
    return false;
  }

  if (
    message.type === CORE_MESSAGE_TYPES.contentReady
    || message.type === CORE_MESSAGE_TYPES.sidepanelReady
  ) {
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === ANALYSIS_MESSAGE_TYPES.analyzePage) {
    void (async () => {
      try {
        const pageContext = buildPageContext((message as { pageContext?: unknown }).pageContext);
        const result = await invokePolymarketAnalysis(pageContext);
        sendResponse({ ok: true, result });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error || '分析失败');
        sendResponse({ ok: false, error: text });
      }
    })();
    return true;
  }

  return false;
}

export default defineBackground(() => {
  // 初始化面板
  browser.runtime.onInstalled.addListener(() => {
    void applySidePanelBehavior();
  });

  // 恢复面板
  browser.runtime.onStartup.addListener(() => {
    void applySidePanelBehavior();
  });

  // 监听消息
  browser.runtime.onMessage.addListener(handleRuntimeMessage);

  void applySidePanelBehavior();
});
