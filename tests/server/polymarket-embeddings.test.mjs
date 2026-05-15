import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmbeddingWorker } from '../../server/services/embeddings/service';
import { toVectorLiteral } from '../../server/services/embeddings/openrouter';

// 包装响应
function createJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

// 伪造客户端
function createFakeEmbeddingClient(calls) {
  let claimCount = 0;

  return {
    database: {
      rpc: async (fn, args) => {
        calls.push({ fn, args });

        if (fn === 'enqueue_missing_polymarket_embedding_jobs') {
          return { data: 2, error: null };
        }

        if (fn === 'claim_polymarket_embedding_jobs') {
          claimCount += 1;
          if (claimCount > 1) {
            return { data: [], error: null };
          }

          return {
            data: [
              {
                market_id: 101,
                embed_text: 'Will tariffs rise?',
                source_updated_at: '2026-05-06T00:00:00.000Z',
              },
            ],
            error: null,
          };
        }

        if (fn === 'apply_polymarket_embedding_results') {
          return { data: args.payload.length, error: null };
        }

        if (fn === 'finish_polymarket_embedding_jobs_done') {
          return { data: args.job_ids.length, error: null };
        }

        throw new Error(`Unexpected RPC: ${fn}`);
      },
    },
  };
}

test('toVectorLiteral formats pgvector text', () => {
  assert.equal(toVectorLiteral([1, 0.5, -2]), '[1,0.5,-2]');
});

test('createEmbeddingWorker runs embedding worker main flow', async () => {
  const rpcCalls = [];
  const fetchCalls = [];
  const worker = createEmbeddingWorker({
    env: {
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_EMBED_MODEL: 'test-embed',
      OPENROUTER_HTTP_REFERER: 'https://murmray.app',
      OPENROUTER_APP_TITLE: 'MurmRay Test',
    },
    insforgeClient: createFakeEmbeddingClient(rpcCalls),
    now: () => Date.parse('2026-05-06T00:00:00.000Z'),
    sleepImpl: async () => {},
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return createJsonResponse({
        data: [
          {
            embedding: Array.from({ length: 128 }, (_, index) => index / 100),
          },
        ],
      });
    },
  });

  const result = await worker.run({
    action: 'run_embedding_worker',
    concurrency: 3,
    reconcileLimit: 2,
    expectedDimensions: 128,
  });

  assert.equal(result.action, 'run_embedding_worker');
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.concurrency, 3);
  assert.equal(result.embeddingModel, 'test-embed');
  assert.equal(result.expectedDimensions, 128);
  assert.equal(result.totals.jobsReconciled, 2);
  assert.equal(result.totals.jobsClaimed, 1);
  assert.equal(result.totals.jobsMarkedDone, 1);
  assert.equal(result.executionMode, 'continuous_pool');

  assert.deepEqual(
    rpcCalls.map((call) => call.fn),
    [
      'enqueue_missing_polymarket_embedding_jobs',
      'claim_polymarket_embedding_jobs',
      'apply_polymarket_embedding_results',
      'finish_polymarket_embedding_jobs_done',
      'claim_polymarket_embedding_jobs',
    ],
  );

  const payload = JSON.parse(String(fetchCalls[0].init.body));
  assert.equal(payload.model, 'test-embed');
  assert.equal(payload.input, 'Will tariffs rise?');
  assert.match(rpcCalls[2].args.payload[0].embedding_text, /^\[0,0\.01,0\.02/);
});

test('createEmbeddingWorker marks failed embedding jobs', async () => {
  const rpcCalls = [];
  let claimCount = 0;
  const client = {
    database: {
      rpc: async (fn, args) => {
        rpcCalls.push({ fn, args });

        if (fn === 'claim_polymarket_embedding_jobs') {
          claimCount += 1;
          if (claimCount > 1) {
            return { data: [], error: null };
          }

          return {
            data: [
              {
                market_id: 101,
                embed_text: 'Will tariffs rise?',
                source_updated_at: null,
              },
            ],
            error: null,
          };
        }

        if (fn === 'finish_polymarket_embedding_jobs_failed') {
          return { data: args.job_ids.length, error: null };
        }

        throw new Error(`Unexpected RPC: ${fn}`);
      },
    },
  };

  const worker = createEmbeddingWorker({
    env: {
      OPENROUTER_API_KEY: 'test-key',
    },
    insforgeClient: client,
    sleepImpl: async () => {},
    fetchImpl: async () => createJsonResponse({ error: 'rate limit' }, 429),
  });

  const result = await worker.run({
    action: 'run_embedding_worker',
    reconcileLimit: 0,
    expectedDimensions: 2,
  });

  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.totals.jobsReturnedToPending, 1);
  assert.equal(result.totals.embeddingRequests, 6);
  const failedCall = rpcCalls.find((call) => call.fn === 'finish_polymarket_embedding_jobs_failed');
  assert.ok(failedCall);
  assert.match(failedCall.args.error_text, /Embedding request failed/);
});
