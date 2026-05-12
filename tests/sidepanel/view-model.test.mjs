import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDirectionMeta,
  getScoreTier,
  getTabIndex,
  getVisibleMatches,
  shouldSkipPage,
  SIDE_PANEL_TABS,
  summarizeAnalysis,
} from '../../entrypoints/sidepanel/view-model';

test('sidepanel tabs keep migrated order', () => {
  assert.deepEqual(SIDE_PANEL_TABS.map((tab) => tab.key), ['feed', 'profile', 'settings']);
  assert.equal(getTabIndex('feed'), 0);
  assert.equal(getTabIndex('profile'), 1);
  assert.equal(getTabIndex('settings'), 2);
});

test('score tier follows old sidepanel thresholds', () => {
  assert.deepEqual(getScoreTier(92), { key: 'very-high', label: 'Very High' });
  assert.deepEqual(getScoreTier(72), { key: 'high', label: 'High' });
  assert.deepEqual(getScoreTier(51), { key: 'medium', label: 'Medium' });
  assert.deepEqual(getScoreTier(12), { key: 'moderate', label: 'Moderate' });
});

test('direction meta maps yes no and neutral labels', () => {
  assert.deepEqual(getDirectionMeta('Yes'), { label: 'Yes', tone: 'yes' });
  assert.deepEqual(getDirectionMeta('看跌'), { label: '看跌', tone: 'no' });
  assert.deepEqual(getDirectionMeta('相关'), { label: '相关', tone: 'neutral' });
});

test('summarizeAnalysis formats empty and matched states', () => {
  assert.equal(summarizeAnalysis(null), '等待分析');
  assert.equal(summarizeAnalysis({ totalMarkets: 20, matches: [] }), '扫描 20 个盘口');
  assert.equal(summarizeAnalysis({
    totalMarkets: 20,
    matches: [
      { marketId: 1, question: 'A', confidence: 70, direction: 'Yes', reason: '', marketUrl: null },
      { marketId: 2, question: 'B', confidence: 50, direction: 'No', reason: '', marketUrl: null },
    ],
  }), '2 个匹配 / 20 个盘口');
});

test('getVisibleMatches deduplicates and limits rows', () => {
  const result = {
    totalMarkets: 20,
    matches: [
      { marketId: 1, question: 'A', confidence: 20, direction: 'Yes', reason: '', marketUrl: null },
      { marketId: 1, question: 'A+', confidence: 80, direction: 'Yes', reason: '', marketUrl: null },
      { marketId: 2, question: 'B', confidence: 70, direction: 'No', reason: '', marketUrl: null },
    ],
  };

  const visible = getVisibleMatches(result, 1);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].marketId, 1);
  assert.equal(visible[0].question, 'A+');
});

test('shouldSkipPage blocks unsupported analysis pages', () => {
  const context = {
    title: 'Polymarket',
    url: 'https://polymarket.com/market/example',
    pageText: 'text',
    selectedText: '',
    cacheKeyHint: 'x',
  };

  assert.equal(shouldSkipPage(context), true);
  assert.equal(shouldSkipPage({ ...context, url: 'https://example.com/news' }), false);
});
