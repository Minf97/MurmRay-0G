import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQueryTexts,
  createAnalysisService,
  mergeCandidateLists,
  pickTopMarkets,
} from '../../server/services/opportunity/service';
import { mapInsforgeMarket } from '../../server/services/opportunity/market';

// 包装响应
function createJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

test('buildQueryTexts keeps compact unique prompts', () => {
  const queryTexts = buildQueryTexts(
    {
      title: 'Trump tariff update',
      pageText: 'Trump discussed a new tariff timeline.',
      selectedText: '',
    },
    {
      summary: 'Trump discussed tariffs affecting import policy.',
      entities: ['Trump', 'Tariffs'],
    },
  );

  assert.equal(queryTexts.length, 3);
  assert.match(queryTexts[0], /Key entities/);
  assert.equal(new Set(queryTexts).size, queryTexts.length);
});

test('pickTopMarkets ranks by best similarity', () => {
  const candidates = pickTopMarkets(
    [
      { id: 1, question: 'Tariff market' },
      { id: 2, question: 'Bitcoin market' },
    ],
    new Map([
      [1, [1, 0]],
      [2, [0, 1]],
    ]),
    [[0.9, 0.1]],
    2,
  );

  assert.equal(candidates[0].id, 1);
  assert.equal(candidates[1].id, 2);
  assert.ok(candidates[0].vectorScore > candidates[1].vectorScore);
});

test('mergeCandidateLists keeps nearest vector candidate', () => {
  const merged = mergeCandidateLists(
    [
      [
        { id: 1, question: 'First market', distance: 0.4 },
        { id: 2, question: 'Second market', distance: 0.2 },
      ],
      [
        { id: 1, question: 'First market', distance: 0.1 },
      ],
    ],
    2,
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 1);
  assert.equal(merged[0].distance, 0.1);
  assert.equal(merged[1].id, 2);
});

test('mapInsforgeMarket rejects invalid vector rows', () => {
  assert.throws(
    () => mapInsforgeMarket({
      id: 1,
      question: 'Will tariffs rise?',
      url: 'https://polymarket.com/market/tariff-market',
      slug: 'tariff-market',
      endDate: '2099-01-01T00:00:00.000Z',
      tags: 'Politics|Tariffs',
      tagSlugs: 'politics|tariffs',
      categories: 'Politics',
      liquidityNum: 100,
      volumeNum: 200,
      updatedAt: '2026-05-06T00:00:00.000Z',
      distance: '0.1',
    }),
    /Invalid market distance/,
  );
});

// 伪造客户端
function createFakeInsforgeClient(rpcCalls) {
  return {
    database: {
      rpc: async (fn, args) => {
        rpcCalls.push({ fn, args });
        return {
          data: [
            {
              id: 1,
              question: 'Will Trump tariffs increase before July?',
              url: 'https://polymarket.com/market/tariff-market',
              slug: 'tariff-market',
              endDate: '2099-01-01T00:00:00.000Z',
              tags: 'Politics|Tariffs',
              tagSlugs: 'politics|tariffs',
              categories: 'Politics',
              liquidityNum: 100,
              volumeNum: 200,
              updatedAt: '2026-05-06T00:00:00.000Z',
              distance: String(args.query_embedding).includes('1,0') ? 0.1 : 0.6,
            },
            {
              id: 2,
              question: 'Will Bitcoin hit $150k this year?',
              url: 'https://polymarket.com/market/bitcoin-market',
              slug: 'bitcoin-market',
              endDate: '2099-01-01T00:00:00.000Z',
              tags: 'Crypto|BTC',
              tagSlugs: 'crypto|btc',
              categories: 'Crypto',
              liquidityNum: 100,
              volumeNum: 200,
              updatedAt: '2026-05-06T00:00:00.000Z',
              distance: 0.8,
            },
          ],
          error: null,
        };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            gt: async () => ({ count: 2, error: null }),
          }),
        }),
      }),
    },
  };
}

test('createAnalysisService runs analyze_page with insforge vector search', async () => {
  const rpcCalls = [];
  const service = createAnalysisService({
    env: {
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_MODEL: 'test-chat',
      OPENROUTER_EMBED_MODEL: 'test-embed',
      OPENROUTER_EMBED_DIMENSIONS: '2',
      OPENROUTER_HTTP_REFERER: 'http://127.0.0.1:8789',
      OPENROUTER_APP_TITLE: 'MurmRay Test',
    },
    insforgeClient: createFakeInsforgeClient(rpcCalls),
    fetchImpl: async (url, init) => {
      if (String(url).endsWith('/chat/completions')) {
        const payload = JSON.parse(String(init?.body || '{}'));
        const systemPrompt = String(payload?.messages?.[0]?.content || '');

        if (systemPrompt.includes('prediction-market event summarization assistant')) {
          assert.match(systemPrompt, /market-style question/);
          return createJsonResponse({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: 'Trump discussed new tariff plans that could affect import policy before July.',
                    reliability: 'high',
                    reliability_reason: 'Direct news report.',
                    entities: ['Trump', 'Tariffs'],
                  }),
                },
              },
            ],
          });
        }

        return createJsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  matches: [
                    {
                      market_id: 1,
                      confidence: 86,
                      direction: '利好',
                      reason: '事件直接影响关税市场',
                    },
                  ],
                }),
              },
            },
          ],
        });
      }

      if (String(url).endsWith('/embeddings')) {
        const payload = JSON.parse(String(init?.body || '{}'));
        const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];

        return createJsonResponse({
          data: inputs.map((text) => ({
            embedding: /trump|tariff/i.test(String(text)) ? [1, 0] : [0, 1],
          })),
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const result = await service.analyze({
    action: 'analyze_page',
    pageContext: {
      title: 'Tariff update',
      url: 'https://example.com/news/1',
      pageText: 'Trump discussed tariff policy before July.',
      selectedText: '',
    },
    topK: 2,
    prefetchCount: 20,
  });

  assert.equal(result.action, 'analyze_page');
  assert.equal(result.totalMarkets, 2);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.prefetchCount, 500);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].marketId, 1);
  assert.equal(result.topVectorCandidates[0].marketId, 1);
  assert.equal(result.topVectorCandidates[0].distance, 0.1);
  assert.equal(rpcCalls[0].fn, 'match_polymarket_market_embeddings');
  assert.equal(rpcCalls[0].args.match_count, 2);
});
