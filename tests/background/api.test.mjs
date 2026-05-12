import test from 'node:test';
import assert from 'node:assert/strict';
import { invokePolymarketAnalysis } from '../../src/background/api';
import { ANALYSIS_FUNCTION_NAME, INSFORGE_URL } from '../../src/shared/config';

const SAMPLE_PAGE = {
  title: 'Sample page',
  url: 'https://example.com/news/1',
  pageText: 'Tariff news article',
  selectedText: '',
  cacheKeyHint: 'https://example.com/news/1',
};

// 推导函数域名
function deriveFunctionsUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  const hostMatch = parsed.hostname.match(/^([^.]+)\.[^.]+\.insforge\.app$/);
  if (!hostMatch) {
    throw new Error('Unexpected insforge hostname');
  }

  return `${parsed.protocol}//${hostMatch[1]}.functions.insforge.app`;
}

test('invokePolymarketAnalysis posts to insforge sdk', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      totalMarkets: 12,
      matches: [
        {
          marketId: 7,
          question: 'Will tariffs rise?',
          confidence: 81,
          direction: '利好',
          reason: '事件直接相关',
          slug: 'tariff-market',
        },
      ],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  try {
    const result = await invokePolymarketAnalysis(SAMPLE_PAGE);
    assert.equal(calls.length, 1);
    assert.equal(String(calls[0].url), `${deriveFunctionsUrl(INSFORGE_URL)}/${ANALYSIS_FUNCTION_NAME}`);

    const payload = JSON.parse(String(calls[0].init?.body || '{}'));
    assert.equal(payload.action, 'analyze_page');
    assert.equal(payload.topK, 100);
    assert.equal(payload.pageContext.title, SAMPLE_PAGE.title);
    assert.equal(result.totalMarkets, 12);
    assert.equal(result.matches[0].marketId, 7);
    assert.equal(result.matches[0].marketUrl, 'https://polymarket.com/market/tariff-market');
  } finally {
    global.fetch = originalFetch;
  }
});

test('invokePolymarketAnalysis surfaces backend error', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => new Response('backend exploded', {
    status: 500,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  try {
    await assert.rejects(
      () => invokePolymarketAnalysis(SAMPLE_PAGE),
      /backend exploded/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
