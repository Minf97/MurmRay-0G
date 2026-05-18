import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageContext,
  isNoOpportunityAnalysisError,
  isBlacklistedUrl,
  mergeMatches,
  normalizeAnalysisResult,
} from '../../src/shared/analysis';

test('buildPageContext trims and validates input', () => {
  const context = buildPageContext({
    title: '  Sample Page  ',
    url: 'https://example.com/news/1',
    pageText: 'hello world',
    selectedText: 'selection',
  });

  assert.equal(context.title, 'Sample Page');
  assert.equal(context.url, 'https://example.com/news/1');
  assert.equal(context.pageText, 'hello world');
  assert.equal(context.selectedText, 'selection');
  assert.ok(context.cacheKeyHint.length > 0);
});

test('buildPageContext rejects invalid payload', () => {
  assert.throws(() => buildPageContext({
    title: 'x',
    url: 'ftp://example.com',
    pageText: 'hello',
  }));
});

test('isNoOpportunityAnalysisError detects empty analysis pages', () => {
  assert.equal(isNoOpportunityAnalysisError(new Error('Page text is empty.')), true);
  assert.equal(isNoOpportunityAnalysisError(new Error('Summary is empty')), true);
  assert.equal(isNoOpportunityAnalysisError(new Error('无法连接云端分析服务')), false);
});

test('isBlacklistedUrl filters obvious pages', () => {
  assert.equal(isBlacklistedUrl('https://google.com/search?q=test'), true);
  assert.equal(isBlacklistedUrl('https://polymarket.com/market/test'), true);
  assert.equal(isBlacklistedUrl('https://x.com'), true);
  assert.equal(isBlacklistedUrl('https://x.com/a/status/123'), false);
});

test('mergeMatches deduplicates markets', () => {
  const merged = mergeMatches([
    { marketId: 1, question: 'A', confidence: 20, direction: 'yes', reason: 'a', slug: 'a', marketEndDate: '2026-06-01T00:00:00.000Z' },
    { marketId: 1, question: 'A+', confidence: 30, direction: 'yes', reason: 'b', marketUrl: 'https://polymarket.com/market/a' },
    { marketId: 2, question: 'B', confidence: 10, direction: 'no', reason: 'c', url: 'https://polymarket.com/market/b' },
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].marketId, 1);
  assert.equal(merged[0].confidence, 30);
  assert.equal(merged[0].question, 'A+');
  assert.equal(merged[0].marketEndDate, '2026-06-01T00:00:00.000Z');
  assert.equal(merged[1].marketId, 2);
});

test('normalizeAnalysisResult keeps zero-g proof metadata', () => {
  const result = normalizeAnalysisResult({
    totalMarkets: 1,
    matches: [],
    zeroGProofStatus: 'ready',
    zeroGProofPageUrl: 'https://proof.example.com/0g-proof',
    zeroGProofs: [
      {
        signalHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        storageUri: '0g://root',
        txHash: '0xchain',
        lifecycleStatus: 'active',
        outcomeStatus: 'pending',
      },
    ],
  });

  assert.equal(result.zeroGProofStatus, 'ready');
  assert.equal(result.zeroGProofPageUrl, 'https://proof.example.com/0g-proof');
  assert.equal(result.zeroGProofs[0].storageUri, '0g://root');
  assert.equal(result.zeroGProofs[0].lifecycleStatus, 'active');
});
