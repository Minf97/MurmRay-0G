import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolymarketOutcomeClient } from '../../server/services/zero-g/outcome';

function sampleSignal(extra = {}) {
  return {
    schemaVersion: 1,
    source: { title: 'News', url: 'https://example.com/news' },
    market: { id: '101', question: 'Will tariffs rise?', url: 'https://polymarket.com/market/tariff', endDate: '2026-06-01T00:00:00.000Z' },
    match: { confidence: 90, direction: '利好', reason: 'Direct policy impact.' },
    ai: { summary: 'Tariff news', signal: 'Tariff signal', evidence: ['News'] },
    generatedAt: '2026-05-16T00:00:00.000Z',
    metadata: {},
    ...extra,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('polymarket outcome client keeps open markets pending', async () => {
  const calls = [];
  const client = createPolymarketOutcomeClient(async (url) => {
    calls.push(String(url));
    return jsonResponse({ id: '101', closed: false, outcomes: '["Yes","No"]', outcomePrices: '["0.4","0.6"]' });
  });

  const outcome = await client.resolve(sampleSignal(), Date.parse('2026-05-19T00:00:00.000Z'));

  assert.match(calls[0], /gamma-api\.polymarket\.com\/markets\/101/);
  assert.equal(outcome.closed, false);
  assert.equal(outcome.outcomeStatus, 'pending');
});

test('polymarket outcome client scores yes direction hit', async () => {
  const client = createPolymarketOutcomeClient(async () => (
    jsonResponse({ id: '101', closed: true, outcomes: '["Yes","No"]', outcomePrices: '["1","0"]' })
  ));

  const outcome = await client.resolve(sampleSignal(), Date.parse('2026-07-01T00:00:00.000Z'));

  assert.equal(outcome.closed, true);
  assert.equal(outcome.winningOutcome, 'Yes');
  assert.equal(outcome.outcomeStatus, 'hit');
});

test('polymarket outcome client scores no direction miss', async () => {
  const client = createPolymarketOutcomeClient(async () => (
    jsonResponse({ id: '101', closed: true, outcomes: ['Yes', 'No'], outcomePrices: ['1', '0'] })
  ));

  const outcome = await client.resolve(
    sampleSignal({ match: { confidence: 90, direction: '利空', reason: 'Negative event.' } }),
    Date.parse('2026-07-01T00:00:00.000Z'),
  );

  assert.equal(outcome.winningOutcome, 'Yes');
  assert.equal(outcome.outcomeStatus, 'miss');
});

test('polymarket outcome client leaves unknown direction unscored', async () => {
  const client = createPolymarketOutcomeClient(async () => (
    jsonResponse({ id: '101', closed: true, winnerOutcome: 'Yes' })
  ));

  const outcome = await client.resolve(
    sampleSignal({ match: { confidence: 90, direction: '不确定', reason: 'Ambiguous event.' } }),
    Date.parse('2026-07-01T00:00:00.000Z'),
  );

  assert.equal(outcome.winningOutcome, 'Yes');
  assert.equal(outcome.outcomeStatus, 'unknown');
});
