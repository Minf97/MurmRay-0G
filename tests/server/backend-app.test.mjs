import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackendApp } from '../../server/app';
import worker from '../../worker';
import { createZeroGProofApp } from '../../server/services/zero-g/app';

function createJsonRequest(body) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

test('createBackendApp exposes backend routes', async () => {
  const calls = [];
  const app = createBackendApp({
    analysisService: {
      async analyze(body) {
        calls.push({ service: 'analysis', body });
        return { action: 'analyze_page', matches: [] };
      },
    },
    embeddingWorker: {
      async run(body) {
        calls.push({ service: 'embeddings', body });
        return { action: 'run_embedding_worker', processed: 0 };
      },
    },
    syncService: {
      async run(body) {
        calls.push({ service: 'sync', body });
        return { action: 'sync_incremental', finished: true };
      },
    },
    zeroGApp: createZeroGProofApp({
      service: {
        async publishSignal() {
          return {};
        },
        async listProofs() {
          return [];
        },
        async findProof() {
          return null;
        },
      },
    }),
  });

  const health = await app.request('/health');
  const opportunity = await app.request('/api/polymarket-opportunity', createJsonRequest({ action: 'analyze_page' }));
  const embeddings = await app.request('/api/polymarket-embeddings', createJsonRequest({ action: 'run_embedding_worker' }));
  const sync = await app.request('/api/polymarket-sync', createJsonRequest({ action: 'sync_incremental' }));
  const proofs = await app.request('/api/0g/proofs');

  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'murmray-backend');
  assert.equal(opportunity.status, 200);
  assert.equal(embeddings.status, 200);
  assert.equal(sync.status, 200);
  assert.equal(proofs.status, 200);
  assert.deepEqual(calls.map((call) => call.service), ['analysis', 'embeddings', 'sync']);
});

test('Cloudflare worker passes bindings into app', async () => {
  const response = await worker.fetch(new Request('https://worker.test/health'), {
    OPENROUTER_APP_TITLE: 'MurmRay',
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, 'murmray-backend');
});

test('createBackendApp returns 400 for unsupported actions', async () => {
  const app = createBackendApp({
    analysisService: {
      async analyze() {
        throw new Error('Unsupported action. Use action=analyze_page');
      },
    },
    embeddingWorker: {
      async run() {
        return {};
      },
    },
    syncService: {
      async run() {
        return {};
      },
    },
    zeroGApp: createZeroGProofApp(),
  });

  const response = await app.request('/api/polymarket-opportunity', createJsonRequest({ action: 'bad' }));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Unsupported action/);
});
