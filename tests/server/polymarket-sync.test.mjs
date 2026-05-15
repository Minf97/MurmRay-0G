import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncService } from '../../server/services/sync/service';
import { buildEmbedText, marketRowsDifferent } from '../../server/services/sync/db';
import { mapGammaMarket } from '../../server/services/sync/gamma';

const NOW_MS = Date.parse('2026-05-06T00:00:00.000Z');

// 示例市场
function gammaMarket(extra = {}) {
  return {
    id: 101,
    question: 'Will tariffs rise?',
    slug: 'tariff-market',
    conditionId: '0xabc',
    endDate: '2099-01-01T00:00:00.000Z',
    volumeNum: 100,
    liquidityNum: 50,
    tags: [{ label: 'Politics', slug: 'politics' }],
    acceptingOrders: true,
    enableOrderBook: true,
    updatedAt: '2026-05-05T00:00:00.000Z',
    ...extra,
  };
}

// 伪造查询
function createQuery(table, calls, state) {
  const query = {
    select(columns) {
      this.columns = columns;
      return this;
    },
    eq(column, value) {
      this.eqColumn = column;
      this.eqValue = value;
      return this;
    },
    async in(column, values) {
      calls.push({ table, op: 'in', column, values });
      return { data: state.existingRows, error: null };
    },
    async limit(count) {
      calls.push({ table, op: 'limit', count, eqColumn: this.eqColumn, eqValue: this.eqValue });
      return { data: state.watermarkRows, error: null };
    },
    async upsert(rows, options) {
      calls.push({ table, op: 'upsert', rows, options });
      return { data: null, error: null };
    },
  };
  return query;
}

// 伪造客户端
function createFakeSyncClient(state) {
  const calls = [];
  return {
    calls,
    client: {
      database: {
        from: (table) => createQuery(table, calls, state),
        rpc: async (fn, args) => {
          calls.push({ op: 'rpc', fn, args });
          return { data: true, error: null };
        },
      },
    },
  };
}

// 包装响应
function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('mapGammaMarket maps Gamma market rows', () => {
  const mapped = mapGammaMarket(gammaMarket());
  assert.equal(mapped.id, 101);
  assert.equal(mapped.question, 'Will tariffs rise?');
  assert.equal(mapped.url, 'https://polymarket.com/market/tariff-market');
  assert.equal(mapped.tags, 'Politics');
  assert.equal(mapped.tag_slugs, 'politics');
  assert.equal(mapped.acceptingorders, true);
});

test('marketRowsDifferent compares synced columns', () => {
  const row = mapGammaMarket(gammaMarket());
  assert.equal(marketRowsDifferent({ ...row, embed_text: buildEmbedText(row.question, row.tags) }, row), false);
  assert.equal(marketRowsDifferent({ ...row, question: 'Old question', embed_text: '' }, row), true);
});

test('createSyncService runs incremental sync main flow', async () => {
  const state = {
    existingRows: [],
    watermarkRows: [],
  };
  const fake = createFakeSyncClient(state);
  const service = createSyncService({
    insforgeClient: fake.client,
    now: () => NOW_MS,
    sleepImpl: async () => {},
    fetchImpl: async (url) => {
      assert.match(String(url), /gamma-api\.polymarket\.com\/markets/);
      return jsonResponse([gammaMarket()]);
    },
  });

  const result = await service.run({
    action: 'sync_incremental',
    pageLimit: 50,
    maxPages: 1,
  });

  assert.equal(result.action, 'sync_incremental');
  assert.equal(result.finished, true);
  assert.equal(result.totals.fetchedFromPolymarket, 1);
  assert.equal(result.totals.newMarkets, 1);
  assert.equal(result.totals.marketsUpserted, 1);
  assert.equal(result.totals.jobsQueued, 1);

  const marketUpsert = fake.calls.find((call) => call.table === 'polymarket_markets_active' && call.op === 'upsert');
  const jobUpsert = fake.calls.find((call) => call.table === 'polymarket_embedding_jobs' && call.op === 'upsert');
  assert.equal(marketUpsert.rows[0].embed_text, 'Will tariffs rise?\n标签: Politics');
  assert.equal(jobUpsert.rows[0].market_id, 101);
  assert.ok(fake.calls.find((call) => call.fn === 'cleanup_stopped_markets'));
});

test('createSyncService dry run does not write rows', async () => {
  const fake = createFakeSyncClient({ existingRows: [], watermarkRows: [] });
  const service = createSyncService({
    insforgeClient: fake.client,
    now: () => NOW_MS,
    fetchImpl: async () => jsonResponse([]),
  });

  const result = await service.run({
    action: 'sync_incremental',
    dryRun: true,
    pageLimit: 50,
    maxPages: 1,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.finished, true);
  assert.equal(fake.calls.some((call) => call.op === 'upsert'), false);
  assert.equal(fake.calls.some((call) => call.fn === 'cleanup_stopped_markets'), false);
});

test('createSyncService runs cleanup action', async () => {
  const fake = createFakeSyncClient({ existingRows: [], watermarkRows: [] });
  const service = createSyncService({ insforgeClient: fake.client });

  const result = await service.run({ action: 'cleanup_stopped' });
  assert.equal(result.action, 'cleanup_stopped');
  assert.equal(result.success, true);
  assert.equal(fake.calls.at(-1).fn, 'cleanup_stopped_markets');
});
