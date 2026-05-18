import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildZeroGSignalRequest,
  publishZeroGProofs,
} from '../../server/services/opportunity/zero-g-proof';

const SAMPLE_PAGE = {
  title: 'Tariff update',
  url: 'https://example.com/news/tariff',
  pageText: 'Trump discussed tariff policy before July.',
  selectedText: '',
};

const SAMPLE_SUMMARY = {
  summary: 'Trump discussed tariffs affecting import policy before July.',
  reliability: 'high',
  reliabilityReason: 'Direct news report.',
  entities: ['Trump', 'Tariffs'],
};

const SAMPLE_MATCH = {
  marketId: 101,
  question: 'Will tariffs rise before July?',
  confidence: 86,
  direction: '利好',
  reason: '事件直接影响关税市场',
  marketUrl: 'https://polymarket.com/market/tariff-market',
  marketEndDate: '2026-06-01T00:00:00.000Z',
};

test('buildZeroGSignalRequest maps backend analysis into proof payload', () => {
  const request = buildZeroGSignalRequest(SAMPLE_PAGE, SAMPLE_SUMMARY, SAMPLE_MATCH, '2026-05-17T00:00:00.000Z');

  assert.equal(request.action, 'publish_signal');
  assert.equal(request.signal.source.url, SAMPLE_PAGE.url);
  assert.equal(request.signal.market.id, '101');
  assert.equal(request.signal.market.endDate, '2026-06-01T00:00:00.000Z');
  assert.equal(request.signal.ai.summary, SAMPLE_SUMMARY.summary);
  assert.equal(request.signal.metadata.reliability, 'high');
});

test('publishZeroGProofs posts backend proof requests when configured', async () => {
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

  const state = await publishZeroGProofs(SAMPLE_PAGE, SAMPLE_SUMMARY, [SAMPLE_MATCH], {
    env: {
      ZERO_G_PROOF_API_BASE_URL: 'https://proof.example.com',
      MURMRAY_PROOF_API_KEY: 'proof-key',
    },
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
  assert.equal(state.status, 'ready');
  assert.equal(state.proofPageUrl, 'https://proof.example.com/0g-proof');
  assert.equal(state.proofs[0].signalHash, proof.signalHash);
  assert.equal(state.proofs[0].lifecycleStatus, 'active');
});

test('publishZeroGProofs skips when backend proof config is missing', async () => {
  const state = await publishZeroGProofs(SAMPLE_PAGE, SAMPLE_SUMMARY, [SAMPLE_MATCH], {
    env: {},
    now: () => Date.now(),
    fetchImpl: async () => {
      throw new Error('fetch should not run');
    },
  });

  assert.equal(state.status, 'skipped');
  assert.equal(state.proofs.length, 0);
});
