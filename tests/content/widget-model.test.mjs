import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWidgetView,
  formatWidgetMarketCount,
  getWidgetTierKey,
  normalizeWidgetMatches,
  resolveWidgetStatus,
  truncateWidgetText,
} from '../../src/content/widget-model';

test('widget score tier follows old thresholds', () => {
  assert.equal(getWidgetTierKey(90), 'very-high');
  assert.equal(getWidgetTierKey(70), 'high');
  assert.equal(getWidgetTierKey(55), 'medium');
  assert.equal(getWidgetTierKey(10), 'moderate');
});

test('widget market count formats large totals', () => {
  assert.equal(formatWidgetMarketCount(9999), '9999');
  assert.equal(formatWidgetMarketCount(10000), '1万');
  assert.equal(formatWidgetMarketCount(15500), '1.6万');
});

test('widget payload resolves display status', () => {
  assert.equal(resolveWidgetStatus({ status: 'blocked', matches: [], totalMarkets: 0 }), 'blocked');
  assert.equal(resolveWidgetStatus({ status: 'error', matches: [], totalMarkets: 0 }), 'error');
  assert.equal(resolveWidgetStatus({ status: 'analyzing', matches: [], totalMarkets: 0 }), 'analyzing');
  assert.equal(resolveWidgetStatus({ status: 'opportunity', matches: [{ question: 'A' }], totalMarkets: 1 }), 'opportunity');
  assert.equal(resolveWidgetStatus({ status: 'no_opportunity', matches: [], totalMarkets: 10 }), 'no_opportunity');
});

test('widget matches normalize unsafe payloads', () => {
  const matches = normalizeWidgetMatches([
    { question: 'Will tariffs rise?', confidence: '82' },
    { question: '', confidence: 0 },
    null,
  ]);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].question, 'Will tariffs rise?');
  assert.equal(matches[0].confidence, 82);
});

test('widget text truncates compactly', () => {
  assert.equal(truncateWidgetText(' a   b ', 10), 'a b');
  assert.equal(truncateWidgetText('abcdef', 4), 'abc…');
});

test('widget view renders card disk and pill modes', () => {
  const card = buildWidgetView({
    enabled: true,
    status: 'opportunity',
    matches: [
      { question: 'Will tariffs rise?', confidence: 82 },
      { question: 'Will CPI fall?', confidence: 70 },
      { question: 'Hidden row', confidence: 10 },
    ],
    totalMarkets: 12000,
    collapsedToSparkle: false,
  });

  assert.equal(card.mode, 'card');
  assert.equal(card.rows.length, 2);
  assert.equal(card.scope, '已扫 1.2万 条');

  const disk = buildWidgetView({ ...cardState(), collapsedToSparkle: true });
  assert.equal(disk.mode, 'disk');
  assert.equal(disk.state, 'found');
  assert.equal(disk.countLabel, '1');

  const pill = buildWidgetView({
    enabled: false,
    status: 'error',
    matches: [],
    totalMarkets: 0,
    collapsedToSparkle: false,
  });
  assert.equal(pill.mode, 'pill');
  assert.equal(pill.kind, 'error');
});

function cardState() {
  return {
    enabled: true,
    status: 'opportunity',
    matches: [{ question: 'A', confidence: 80 }],
    totalMarkets: 5,
    collapsedToSparkle: false,
  };
}
