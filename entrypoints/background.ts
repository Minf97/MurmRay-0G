import { browser } from 'wxt/browser';
import { ANALYSIS_MESSAGE_TYPES, CORE_MESSAGE_TYPES, GHOST_MESSAGE_TYPES, createCorePong } from '../src/shared/messages';
import { createGhostModeController } from '../src/background/ghost-mode';
import type { Browser } from 'wxt/browser';

type RuntimeMessage = {
  type: string;
  pageContext?: unknown;
  enabled?: unknown;
  tabId?: unknown;
  allowBlacklisted?: unknown;
  triggerSource?: unknown;
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
function handleRuntimeMessage(
  message: unknown,
  sender: RuntimeSender,
  sendResponse: RuntimeResponse,
  ghostMode: ReturnType<typeof createGhostModeController>,
) {
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
    if (message.type === CORE_MESSAGE_TYPES.contentReady) {
      void ghostMode.handleContentReady(sender);
    }
    return false;
  }

  if (
    message.type === ANALYSIS_MESSAGE_TYPES.analyzePage
    || message.type === GHOST_MESSAGE_TYPES.analyzePage
  ) {
    void (async () => {
      const senderTabId = Number(sender.tab?.id);
      const messageTabId = Number(message.tabId);
      const tabId = Number.isFinite(senderTabId) ? senderTabId : messageTabId;
      const triggerSource = message.triggerSource === 'ghost_mode' ? 'ghost_mode' : 'manual';
      const result = await ghostMode.analyzePageContext(message.pageContext, {
        tabId,
        allowBlacklisted: Boolean(message.allowBlacklisted),
        triggerSource,
      });
      sendResponse(result.ok
        ? {
            ok: true,
            result: result.result,
            payload: result.payload,
            totalMarkets: result.result?.totalMarkets,
            matches: result.result?.matches,
          }
        : { ok: false, error: result.error, payload: result.payload });
    })();
    return true;
  }

  if (message.type === GHOST_MESSAGE_TYPES.openSidepanel) {
    void (async () => {
      let opened = false;
      const tabId = Number(sender.tab?.id);
      const windowId = Number(sender.tab?.windowId);

      try {
        if (browser.sidePanel?.open && Number.isFinite(tabId)) {
          await browser.sidePanel.open({ tabId });
          opened = true;
        } else if (browser.sidePanel?.open && Number.isFinite(windowId)) {
          await browser.sidePanel.open({ windowId });
          opened = true;
        }
      } catch {
        opened = false;
      }

      sendResponse({ ok: opened });
    })();
    return true;
  }

  if (message.type === GHOST_MESSAGE_TYPES.getState) {
    void (async () => {
      sendResponse({ ok: true, enabled: await ghostMode.getEnabled() });
    })();
    return true;
  }

  if (message.type === GHOST_MESSAGE_TYPES.setState) {
    void (async () => {
      const enabled = await ghostMode.setEnabled(Boolean(message.enabled));
      sendResponse({ ok: true, enabled });
    })();
    return true;
  }

  if (message.type === GHOST_MESSAGE_TYPES.getTabState) {
    void (async () => {
      sendResponse({ ok: true, payload: ghostMode.getTabState(message.tabId) });
    })();
    return true;
  }

  return false;
}

export default defineBackground(() => {
  const ghostMode = createGhostModeController({ browser });

  // 初始化面板
  browser.runtime.onInstalled.addListener(() => {
    void applySidePanelBehavior();
    void ghostMode.getEnabled();
  });

  // 恢复面板
  browser.runtime.onStartup.addListener(() => {
    void applySidePanelBehavior();
    void ghostMode.getEnabled();
  });

  // 监听消息
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => (
    handleRuntimeMessage(message, sender, sendResponse, ghostMode)
  ));

  // 清理标签
  browser.tabs.onRemoved.addListener((tabId) => {
    ghostMode.handleTabRemoved(tabId);
  });

  void applySidePanelBehavior();
  void ghostMode.getEnabled();
});
