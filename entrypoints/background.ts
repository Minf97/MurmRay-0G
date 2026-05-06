import { browser } from 'wxt/browser';
import { CORE_MESSAGE_TYPES, createCorePong } from '../src/shared/messages';

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
function handleRuntimeMessage(message: unknown, _sender: unknown, sendResponse: (value?: unknown) => void) {
  if (!message || typeof message !== 'object') return undefined;

  if ('type' in message && message.type === CORE_MESSAGE_TYPES.ping) {
    sendResponse(createCorePong());
    return true;
  }

  if (
    'type' in message &&
    (message.type === CORE_MESSAGE_TYPES.contentReady
      || message.type === CORE_MESSAGE_TYPES.sidepanelReady)
  ) {
    sendResponse({ ok: true });
    return true;
  }

  return undefined;
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
