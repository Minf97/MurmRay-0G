import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGhostPageKey,
  createGhostModeController,
} from '../../src/background/ghost-mode';
import { ANALYSIS_CACHE_STORAGE_KEY, GHOST_CACHE_TTL_MS, GHOST_MODE_STORAGE_KEY } from '../../src/shared/config';
import { GHOST_MESSAGE_TYPES } from '../../src/shared/messages';

const SAMPLE_PAGE = {
  title: 'Tariff story',
  url: 'https://example.com/news/1#section',
  pageText: 'Tariff news article',
  selectedText: '',
  cacheKeyHint: '',
};

function createBrowserMock(initialStore = {}) {
  const store = { ...initialStore };
  const runtimeMessages = [];

  return {
    store,
    runtimeMessages,
    browser: {
      storage: {
        local: {
          async get(key) {
            if (key == null) return { ...store };
            if (typeof key === 'string') {
              return Object.prototype.hasOwnProperty.call(store, key) ? { [key]: store[key] } : {};
            }
            return {};
          },
          async set(items) {
            Object.assign(store, items);
          },
        },
      },
      runtime: {
        async sendMessage(message) {
          runtimeMessages.push(message);
          return { ok: true };
        },
      },
      tabs: {
        async get(tabId) {
          return { id: tabId, title: SAMPLE_PAGE.title, url: SAMPLE_PAGE.url };
        },
        async query() {
          return [];
        },
        async sendMessage() {
          return null;
        },
      },
    },
  };
}

test('buildGhostPageKey prefers cache hint and strips hash', () => {
  assert.equal(buildGhostPageKey({ ...SAMPLE_PAGE, cacheKeyHint: 'story:1' }), 'https://example.com/news/1');
  assert.equal(buildGhostPageKey(SAMPLE_PAGE), 'https://example.com/news/1');
});

test('ghost mode initializes missing storage value', async () => {
  const mock = createBrowserMock();
  const controller = createGhostModeController({
    browser: mock.browser,
    analyzePage: async () => ({ totalMarkets: 0, matches: [] }),
  });

  assert.equal(await controller.getEnabled(), false);
  assert.equal(mock.store[GHOST_MODE_STORAGE_KEY], false);
});

test('ghost mode blocks blacklisted urls before analysis', async () => {
  const mock = createBrowserMock();
  let analyzeCalls = 0;
  const controller = createGhostModeController({
    browser: mock.browser,
    analyzePage: async () => {
      analyzeCalls += 1;
      return { totalMarkets: 1, matches: [] };
    },
    createRequestId: () => 'req-1',
  });

  const response = await controller.analyzePageContext({
    ...SAMPLE_PAGE,
    url: 'https://polymarket.com/market/example',
  }, {
    tabId: 3,
  });

  assert.equal(response.ok, true);
  assert.equal(response.payload.status, 'blocked');
  assert.equal(analyzeCalls, 0);
  assert.equal(controller.getTabState(3).status, 'blocked');
});

test('ghost mode reuses in-flight analysis for the same page', async () => {
  const mock = createBrowserMock();
  let analyzeCalls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const controller = createGhostModeController({
    browser: mock.browser,
    analyzePage: async () => {
      analyzeCalls += 1;
      await gate;
      return {
        totalMarkets: 9,
        matches: [
          { marketId: 1, question: 'Will tariffs rise?', confidence: 82, direction: 'Yes', reason: '', marketUrl: null },
        ],
      };
    },
    createRequestId: (() => {
      let index = 0;
      return () => `req-${index += 1}`;
    })(),
  });

  const first = controller.analyzePageContext(SAMPLE_PAGE, { tabId: 3 });
  const second = controller.analyzePageContext(SAMPLE_PAGE, { tabId: 3 });
  release();

  const responses = await Promise.all([first, second]);

  assert.equal(analyzeCalls, 1);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[1].ok, true);
  assert.equal(controller.getTabState(3).status, 'opportunity');
  assert.equal(controller.getTabState(3).requestId, 'req-2');
});

test('ghost mode returns cached result after first analysis', async () => {
  const mock = createBrowserMock();
  let analyzeCalls = 0;
  let quotaCalls = 0;
  const controller = createGhostModeController({
    browser: mock.browser,
    consumeAnalysisQuota: async () => {
      quotaCalls += 1;
    },
    analyzePage: async () => {
      analyzeCalls += 1;
      return { totalMarkets: 3, matches: [] };
    },
    createRequestId: (() => {
      let index = 0;
      return () => `req-${index += 1}`;
    })(),
  });

  const first = await controller.analyzePageContext(SAMPLE_PAGE, { tabId: 3 });
  const second = await controller.analyzePageContext(SAMPLE_PAGE, { tabId: 3 });

  assert.equal(analyzeCalls, 1);
  assert.equal(quotaCalls, 1);
  assert.equal(first.payload.cached, false);
  assert.equal(second.payload.cached, true);
  assert.equal(second.payload.status, 'no_opportunity');
  assert.equal(mock.runtimeMessages.some((message) => message.type === GHOST_MESSAGE_TYPES.stateUpdated), true);
});

test('ghost mode restores cached tab state by url', async () => {
  const nowMs = Date.parse('2026-05-16T00:00:00.000Z');
  const pageKey = 'https://example.com/news/1';
  const mock = createBrowserMock({
    [ANALYSIS_CACHE_STORAGE_KEY]: {
      [pageKey]: {
        result: {
          totalMarkets: 7,
          matches: [
            { marketId: 1, question: 'A', confidence: 80, direction: 'Yes', reason: '', marketUrl: null },
          ],
        },
        expiresAt: nowMs + GHOST_CACHE_TTL_MS,
        updatedAt: nowMs,
      },
    },
  });
  const controller = createGhostModeController({
    browser: mock.browser,
    now: () => nowMs,
    analyzePage: async () => ({ totalMarkets: 0, matches: [] }),
  });

  const restored = await controller.syncTabStateFromCache({
    id: 3,
    title: SAMPLE_PAGE.title,
    url: SAMPLE_PAGE.url,
  });

  assert.equal(restored.status, 'opportunity');
  assert.equal(restored.cached, true);
  assert.equal(restored.totalMarkets, 7);
  assert.equal(controller.getTabState(3).pageKey, pageKey);
});

test('ghost mode ignores expired cached tab state', async () => {
  const nowMs = Date.parse('2026-05-16T00:00:00.000Z');
  const pageKey = 'https://example.com/news/1';
  const mock = createBrowserMock({
    [ANALYSIS_CACHE_STORAGE_KEY]: {
      [pageKey]: {
        result: { totalMarkets: 7, matches: [] },
        expiresAt: nowMs - 1,
        updatedAt: nowMs - GHOST_CACHE_TTL_MS,
      },
    },
  });
  const controller = createGhostModeController({
    browser: mock.browser,
    now: () => nowMs,
    analyzePage: async () => ({ totalMarkets: 0, matches: [] }),
  });

  const payload = await controller.syncTabStateFromCache({
    id: 3,
    title: SAMPLE_PAGE.title,
    url: SAMPLE_PAGE.url,
  });

  assert.equal(payload.status, 'idle');
  assert.equal(payload.cached, false);
  assert.equal(payload.totalMarkets, 0);
});

test('ghost mode stops analysis when quota check fails', async () => {
  const mock = createBrowserMock();
  let analyzeCalls = 0;
  const controller = createGhostModeController({
    browser: mock.browser,
    consumeAnalysisQuota: async () => {
      throw new Error('额度已用完');
    },
    analyzePage: async () => {
      analyzeCalls += 1;
      return { totalMarkets: 3, matches: [] };
    },
    createRequestId: () => 'req-1',
  });

  const response = await controller.analyzePageContext(SAMPLE_PAGE, { tabId: 3 });
  assert.equal(response.ok, false);
  assert.equal(response.error, '额度已用完');
  assert.equal(analyzeCalls, 0);
  assert.equal(controller.getTabState(3).status, 'error');
});
