import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildZeroGSignalRequest,
  publishZeroGProofsForAnalysis,
} from '../../src/background/zero-g-proof';

const SAMPLE_PAGE = {
  title: 'Tariff story',
  url: 'https://example.com/news/tariff',
  pageText: 'Trump discussed tariff policy before July.',
  selectedText: '',
  cacheKeyHint: 'https://example.com/news/tariff',
};

const SAMPLE_MATCH = {
  marketId: 101,
  question: 'Will tariffs rise before July?',
  confidence: 87,
  direction: '利好',
  reason: '事件直接影响关税市场',
  marketUrl: 'https://polymarket.com/market/tariff-market',
  marketEndDate: '2026-06-01T00:00:00.000Z',
};

function sampleResult() {
  return {
    totalMarkets: 1,
    matches: [SAMPLE_MATCH],
  };
}

test('buildZeroGSignalRequest maps analysis match into proof payload', () => {
  const request = buildZeroGSignalRequest(SAMPLE_PAGE, SAMPLE_MATCH, '2026-05-17T00:00:00.000Z');

  assert.equal(request.action, 'publish_signal');
  assert.equal(request.signal.source.title, 'Tariff story');
  assert.equal(request.signal.market.id, '101');
  assert.equal(request.signal.market.endDate, '2026-06-01T00:00:00.000Z');
  assert.equal(request.signal.match.confidence, 87);
  assert.equal(request.signal.ai.evidence[0], '事件直接影响关税市场');
  assert.equal(request.signal.generatedAt, '2026-05-17T00:00:00.000Z');
});

test('publishZeroGProofsForAnalysis posts proofs with service key', async () => {
  const calls = [];
  const proof = {
    signalHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    storageUri: '0g://root',
    txHash: '0xchain',
    contractAddress: '0x1111111111111111111111111111111111111111',
    explorerUrl: 'https://chainscan-galileo.0g.ai/tx/0xchain',
    marketId: '101',
    marketQuestion: SAMPLE_MATCH.question,
    marketEndDate: '2026-06-01T00:00:00.000Z',
    lifecycleStatus: 'active',
    outcomeStatus: 'pending',
    trackRecordNote: 'Market is still open, so this signal is being tracked.',
    sourceTitle: SAMPLE_PAGE.title,
    createdAt: '2026-05-17T00:00:00.000Z',
  };

  const state = await publishZeroGProofsForAnalysis(SAMPLE_PAGE, sampleResult(), {
    baseUrl: 'https://proof.example.com/',
    apiKey: 'proof-key',
    now: () => Date.parse('2026-05-17T00:00:00.000Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ proof }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].url), 'https://proof.example.com/api/0g/signals');
  assert.equal(calls[0].init.headers.authorization, 'Bearer proof-key');
  assert.equal(JSON.parse(calls[0].init.body).signal.market.id, '101');
  assert.equal(state.status, 'ready');
  assert.equal(state.proofs[0].storageUri, '0g://root');
  assert.equal(state.proofs[0].lifecycleStatus, 'active');
  assert.equal(state.proofPageUrl, 'https://proof.example.com/0g-proof');
});

test('publishZeroGProofsForAnalysis binds service worker fetch', async () => {
  const originalFetch = globalThis.fetch;
  const proof = {
    signalHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    storageUri: '0g://root',
    txHash: '0xchain',
  };

  globalThis.fetch = function () {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response(JSON.stringify({ proof }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }));
  };

  try {
    const state = await publishZeroGProofsForAnalysis(SAMPLE_PAGE, sampleResult(), {
      baseUrl: 'https://proof.example.com',
      apiKey: 'proof-key',
      now: () => Date.parse('2026-05-17T00:00:00.000Z'),
    });

    assert.equal(state.status, 'ready');
    assert.equal(state.proofs[0].txHash, '0xchain');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('publishZeroGProofsForAnalysis surfaces missing publish config', async () => {
  const state = await publishZeroGProofsForAnalysis(SAMPLE_PAGE, sampleResult(), {
    baseUrl: 'https://proof.example.com',
    apiKey: '',
    fetchImpl: async () => {
      throw new Error('fetch should not run');
    },
  });

  assert.equal(state.status, 'skipped');
  assert.equal(state.proofs.length, 0);
  assert.match(state.error, /not configured/);
});
