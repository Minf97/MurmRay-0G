import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, hashCanonicalJson } from '../../server/services/zero-g/canonical';
import { createZeroGProofApp } from '../../server/services/zero-g/app';
import { createZeroGProofService } from '../../server/services/zero-g/service';

const NOW_MS = Date.parse('2026-05-16T08:00:00.000Z');

function sampleRequest(extraSignal = {}) {
  return {
    action: 'publish_signal',
    signal: {
      source: { title: 'Tariff update', url: 'https://example.com/news/tariff' },
      market: { id: '101', question: 'Will tariffs rise before July?', url: 'https://polymarket.com/market/tariff-market', endDate: '2026-06-01T00:00:00.000Z' },
      match: {
        confidence: 87,
        direction: '利好',
        reason: 'The event directly affects the tariff market.',
      },
      ai: {
        summary: 'Trump discussed tariff policy before July.',
        signal: 'Tariff comments increase probability for the market.',
        evidence: ['Direct policy statement', 'Market deadline is before July'],
      },
      metadata: { detector: 'murmray-test' },
      ...extraSignal,
    },
  };
}

function sampleProof(extra = {}) {
  return {
    signalHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    storageUri: '0g://root',
    rootHash: 'root',
    storageTxHash: '0xstorage',
    txHash: '0xchain',
    contractAddress: '0x1111111111111111111111111111111111111111',
    explorerUrl: 'https://chainscan-galileo.0g.ai/tx/0xchain',
    chainId: '16601',
    sourceTitle: 'Tariff update',
    sourceUrl: 'https://example.com/news/tariff',
    marketId: '101',
    marketQuestion: 'Will tariffs rise before July?',
    marketUrl: 'https://polymarket.com/market/tariff-market',
    marketEndDate: '2026-06-01T00:00:00.000Z',
    confidence: 87,
    direction: '利好',
    lifecycleStatus: 'active',
    outcomeStatus: 'pending',
    trackRecordNote: 'Market is still open, so this signal is being tracked.',
    createdAt: '2026-05-16T08:00:00.000Z',
    ...extra,
  };
}

function sampleStoredSignal(extra = {}) {
  return {
    schemaVersion: 1,
    source: { title: 'Tariff update', url: 'https://example.com/news/tariff' },
    market: { id: '101', question: 'Will tariffs rise before July?', url: 'https://polymarket.com/market/tariff-market', endDate: '2026-06-01T00:00:00.000Z' },
    match: {
      confidence: 87,
      direction: '利好',
      reason: 'The event directly affects the tariff market.',
    },
    ai: {
      summary: 'Trump discussed tariff policy before July.',
      signal: 'Tariff comments increase probability for the market.',
      evidence: ['Direct policy statement'],
    },
    generatedAt: '2026-05-16T08:00:00.000Z',
    metadata: {},
    ...extra,
  };
}

test('canonicalize creates stable signal hash', () => {
  const left = canonicalize({ b: 2, a: { d: true, c: 'x' } });
  const right = canonicalize({ a: { c: 'x', d: true }, b: 2 });

  assert.equal(left, right);
  assert.match(hashCanonicalJson(left), /^0x[a-f0-9]{64}$/);
});

test('createZeroGProofService publishes signal through storage and chain', async () => {
  const storageCalls = [];
  const chainCalls = [];
  const service = createZeroGProofService({
    now: () => NOW_MS,
    storageClient: {
      async saveSignal(input) {
        storageCalls.push(input);
        return {
          storageUri: '0g://root-hash',
          rootHash: 'root-hash',
          storageTxHash: '0xstorage',
        };
      },
      async loadSignal() {
        throw new Error('load should not run');
      },
    },
    chainClient: {
      async registerSignalHash(input) {
        chainCalls.push(input);
        return {
          txHash: '0xchain',
          contractAddress: '0x1111111111111111111111111111111111111111',
          explorerUrl: 'https://chainscan-galileo.0g.ai/tx/0xchain',
          chainId: '16601',
        };
      },
      async listSignalAnchors() {
        throw new Error('list should not run');
      },
      async findSignalAnchor() {
        throw new Error('find should not run');
      },
    },
  });

  const proof = await service.publishSignal(sampleRequest({ generatedAt: undefined }));
  const storedPayload = JSON.parse(storageCalls[0].payload);

  assert.match(proof.signalHash, /^0x[a-f0-9]{64}$/);
  assert.equal(storedPayload.schemaVersion, 1);
  assert.equal(storedPayload.generatedAt, '2026-05-16T08:00:00.000Z');
  assert.equal(chainCalls[0].signalHash, proof.signalHash);
  assert.equal(chainCalls[0].storageUri, '0g://root-hash');
  assert.equal(proof.txHash, '0xchain');
  assert.equal(proof.marketQuestion, 'Will tariffs rise before July?');
  assert.equal(proof.lifecycleStatus, 'active');
  assert.equal(proof.outcomeStatus, 'pending');
});

test('createZeroGProofService rejects invalid signal source URL', async () => {
  const service = createZeroGProofService({
    now: () => NOW_MS,
    storageClient: {
      async saveSignal() { throw new Error('storage should not run'); },
      async loadSignal() { throw new Error('load should not run'); },
    },
    chainClient: {
      async registerSignalHash() { throw new Error('chain should not run'); },
      async listSignalAnchors() { return []; },
      async findSignalAnchor() { return null; },
    },
  });

  await assert.rejects(
    () => service.publishSignal(sampleRequest({ source: { title: 'Bad URL', url: 'chrome://settings' } })),
    /signal\.source\.url must be an HTTP URL/,
  );
});

test('createZeroGProofService clamps proof list limit', async () => {
  const limits = [];
  const service = createZeroGProofService({
    storageClient: {
      async saveSignal() { throw new Error('storage should not run'); },
      async loadSignal() { return sampleStoredSignal(); },
    },
    chainClient: {
      async registerSignalHash() { throw new Error('chain should not run'); },
      async listSignalAnchors(limit) {
        limits.push(limit);
        return [];
      },
      async findSignalAnchor() { return null; },
    },
  });

  await service.listProofs(999);
  assert.equal(limits[0], 200);
});

test('createZeroGProofService rebuilds proofs from chain anchors and 0G storage', async () => {
  const service = createZeroGProofService({
    storageClient: {
      async saveSignal() { throw new Error('storage should not run'); },
      async loadSignal(storageUri) {
        assert.equal(storageUri, '0g://root');
        return sampleStoredSignal();
      },
    },
    chainClient: {
      async registerSignalHash() { throw new Error('chain should not run'); },
      async listSignalAnchors() {
        return [sampleProof({
          blockNumber: 100,
          logIndex: 0,
        })];
      },
      async findSignalAnchor(signalHash) {
        return sampleProof({
          signalHash,
          blockNumber: 100,
          logIndex: 0,
        });
      },
    },
  });

  const list = await service.listProofs(10);
  const detail = await service.findProof('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

  assert.equal(list[0].storageUri, '0g://root');
  assert.equal(list[0].rootHash, 'root');
  assert.equal(list[0].marketQuestion, 'Will tariffs rise before July?');
  assert.equal(list[0].lifecycleStatus, 'active');
  assert.equal(detail.txHash, '0xchain');
});

test('createZeroGProofService marks expired signals for track record', async () => {
  const service = createZeroGProofService({
    now: () => Date.parse('2026-07-01T00:00:00.000Z'),
    storageClient: {
      async saveSignal() { throw new Error('storage should not run'); },
      async loadSignal() { return sampleStoredSignal(); },
    },
    chainClient: {
      async registerSignalHash() { throw new Error('chain should not run'); },
      async listSignalAnchors() {
        return [sampleProof({ blockNumber: 100, logIndex: 0 })];
      },
      async findSignalAnchor() { return null; },
    },
  });

  const list = await service.listProofs(10);
  assert.equal(list[0].lifecycleStatus, 'expired');
  assert.equal(list[0].outcomeStatus, 'unknown');
});

test('createZeroGProofService marks scored signals as resolved', async () => {
  const service = createZeroGProofService({
    now: () => Date.parse('2026-07-01T00:00:00.000Z'),
    storageClient: {
      async saveSignal() { throw new Error('storage should not run'); },
      async loadSignal() { return sampleStoredSignal({ metadata: { outcomeStatus: 'hit' } }); },
    },
    chainClient: {
      async registerSignalHash() { throw new Error('chain should not run'); },
      async listSignalAnchors() {
        return [sampleProof({ blockNumber: 100, logIndex: 0 })];
      },
      async findSignalAnchor() { return null; },
    },
  });

  const list = await service.listProofs(10);
  assert.equal(list[0].lifecycleStatus, 'resolved');
  assert.equal(list[0].outcomeStatus, 'hit');
});

test('createZeroGProofApp exposes health and proof page', async () => {
  const app = createZeroGProofApp({
    proofKey: 'test-key',
    service: {
      async publishSignal() {
        return sampleProof();
      },
      async listProofs() {
        return [sampleProof()];
      },
      async findProof() {
        return sampleProof();
      },
    },
  });

  const health = await app.request('/health');
  const page = await app.request('/0g-proof');

  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'zero-g-proof');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Signal Ledger/);
});

test('createZeroGProofApp protects publish endpoint', async () => {
  let called = false;
  const app = createZeroGProofApp({
    proofKey: 'test-key',
    service: {
      async publishSignal() {
        called = true;
        return sampleProof();
      },
      async listProofs() {
        return [];
      },
      async findProof() {
        return null;
      },
    },
  });

  const unauthorized = await app.request('/api/0g/signals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sampleRequest()),
  });
  const authorized = await app.request('/api/0g/signals', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-key',
    },
    body: JSON.stringify(sampleRequest()),
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(authorized.status, 201);
  assert.equal((await authorized.json()).proof.txHash, '0xchain');
  assert.equal(called, true);
});

test('createZeroGProofApp reads proof list and detail', async () => {
  const proof = sampleProof();
  const app = createZeroGProofApp({
    proofKey: 'test-key',
    service: {
      async publishSignal() {
        return proof;
      },
      async listProofs(limit) {
        assert.equal(limit, '3');
        return [proof];
      },
      async findProof(signalHash) {
        return signalHash === proof.signalHash ? proof : null;
      },
    },
  });

  const list = await app.request('/api/0g/proofs?limit=3');
  const detail = await app.request(`/api/0g/proofs/${proof.signalHash}`);
  const missing = await app.request('/api/0g/proofs/0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

  assert.equal(list.status, 200);
  assert.equal((await list.json()).proofs.length, 1);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).proof.storageUri, '0g://root');
  assert.equal(missing.status, 404);
});
