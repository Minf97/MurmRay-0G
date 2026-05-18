import test from 'node:test';
import assert from 'node:assert/strict';
import { createGhostModeController } from '../../src/background/ghost-mode';

const SAMPLE_PAGE = {
  title: 'Tariff story',
  url: 'https://example.com/news/tariff',
  pageText: 'Trump discussed tariff policy before July.',
  selectedText: '',
  cacheKeyHint: 'https://example.com/news/tariff',
};

function createBrowserMock() {
  const store = {};
  return {
    storage: {
      local: {
        async get(key) {
          if (typeof key === 'string') return Object.prototype.hasOwnProperty.call(store, key) ? { [key]: store[key] } : {};
          return {};
        },
        async set(items) {
          Object.assign(store, items);
        },
      },
    },
    runtime: {
      async sendMessage() {
        return { ok: true };
      },
    },
    tabs: {
      async query() {
        return [];
      },
      async sendMessage() {
        return null;
      },
    },
  };
}

test('ghost mode attaches 0G proofs after successful analysis', async () => {
  const publishCalls = [];
  const controller = createGhostModeController({
    browser: createBrowserMock(),
    analyzePage: async () => ({
      totalMarkets: 1,
      matches: [
        {
          marketId: 101,
          question: 'Will tariffs rise before July?',
          confidence: 87,
          direction: '利好',
          reason: '事件直接影响关税市场',
          marketUrl: 'https://polymarket.com/market/tariff-market',
          marketEndDate: '2026-06-01T00:00:00.000Z',
        },
      ],
    }),
    publishZeroGProofs: async (pageContext, result) => {
      publishCalls.push({ pageContext, result });
      return {
        status: 'ready',
        error: '',
        proofPageUrl: 'https://proof.example.com/0g-proof',
        proofs: [
          {
            signalHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            storageUri: '0g://root',
            txHash: '0xchain',
            contractAddress: '0x1111111111111111111111111111111111111111',
            explorerUrl: 'https://chainscan-galileo.0g.ai/tx/0xchain',
            marketId: '101',
            marketQuestion: 'Will tariffs rise before July?',
            marketEndDate: '2026-06-01T00:00:00.000Z',
            lifecycleStatus: 'active',
            outcomeStatus: 'pending',
            trackRecordNote: 'Market is still open, so this signal is being tracked.',
            sourceTitle: 'Tariff story',
            createdAt: '2026-05-17T00:00:00.000Z',
          },
        ],
      };
    },
    createRequestId: () => 'req-1',
  });

  const response = await controller.analyzePageContext(SAMPLE_PAGE, { tabId: 3 });

  assert.equal(response.ok, true);
  assert.equal(publishCalls.length, 1);
  assert.equal(response.payload.zeroGProofStatus, 'ready');
  assert.equal(response.payload.zeroGProofs[0].storageUri, '0g://root');
  assert.equal(response.payload.zeroGProofs[0].lifecycleStatus, 'active');
  assert.equal(controller.getTabState(3).zeroGProofPageUrl, 'https://proof.example.com/0g-proof');
});
