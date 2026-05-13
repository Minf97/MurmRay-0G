import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortfolioIndex,
  buildPortfolioSummary,
  createEmptyPortfolioSnapshot,
  decorateMatchesWithPortfolio,
  normalizeEvmAddress,
  normalizePortfolioPosition,
} from '../../src/shared/portfolio';

const ADDRESS = '0x1111111111111111111111111111111111111111';

test('portfolio helpers normalize evm addresses', () => {
  assert.equal(normalizeEvmAddress(ADDRESS.toUpperCase()), ADDRESS);
  assert.equal(normalizeEvmAddress('0xabc'), null);
  assert.equal(normalizeEvmAddress(null), null);
});

test('portfolio position normalizes polymarket rows', () => {
  const position = normalizePortfolioPosition({
    marketSlug: 'btc-up',
    marketQuestion: 'BTC up?',
    side: 'Yes',
    size: '2',
    currentValue: '3.5',
    cashPnl: '-0.2',
  });

  assert.equal(position.slug, 'btc-up');
  assert.equal(position.title, 'BTC up?');
  assert.equal(position.outcome, 'Yes');
  assert.equal(position.size, 2);
  assert.equal(position.currentValue, 3.5);
  assert.equal(position.cashPnl, -0.2);
});

test('portfolio summary and index aggregate positions', () => {
  const positions = [
    normalizePortfolioPosition({ slug: 'btc-up', title: 'BTC up?', outcome: 'Yes', currentValue: 3, cashPnl: 1 }),
    normalizePortfolioPosition({ slug: 'btc-up', title: 'BTC up?', outcome: 'No', currentValue: 4, cashPnl: -2 }),
  ];
  const snapshot = createEmptyPortfolioSnapshot({ positions, summary: buildPortfolioSummary(positions) });
  const index = buildPortfolioIndex(snapshot);
  const entry = index.bySlug.get('btc-up');

  assert.equal(snapshot.summary.positionCount, 2);
  assert.equal(snapshot.summary.totalCurrentValue, 7);
  assert.equal(entry.positionCount, 2);
  assert.equal(entry.currentValue, 7);
  assert.deepEqual(Array.from(entry.outcomes).sort(), ['No', 'Yes']);
});

test('portfolio decorator marks matching analysis rows', () => {
  const position = normalizePortfolioPosition({ slug: 'btc-up', title: 'BTC up?', outcome: 'Yes', currentValue: 3, cashPnl: 1 });
  const snapshot = createEmptyPortfolioSnapshot({ positions: [position] });
  const matches = decorateMatchesWithPortfolio([
    { marketId: 1, question: 'BTC up?', confidence: 80, direction: 'Yes', reason: '', marketUrl: 'https://polymarket.com/market/btc-up' },
    { marketId: 2, question: 'ETH up?', confidence: 70, direction: 'No', reason: '', marketUrl: null },
  ], snapshot);

  assert.equal(matches[0].isHeld, true);
  assert.equal(matches[0].heldOutcomeLabel, 'Yes');
  assert.equal(matches[0].heldCurrentValue, 3);
  assert.equal(matches[1].isHeld, undefined);
});
