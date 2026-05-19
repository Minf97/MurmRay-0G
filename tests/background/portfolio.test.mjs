import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolymarketPortfolioController } from '../../src/background/portfolio';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const PROXY = '0x2222222222222222222222222222222222222222';

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

test('portfolio controller returns unresolved snapshot without address', async () => {
  let fetchCalls = 0;
  const controller = createPolymarketPortfolioController({
    getWalletState: async () => ({ account: null }),
    fetchImpl: async () => {
      fetchCalls += 1;
      return jsonResponse({});
    },
  });

  const snapshot = await controller.getPolymarketPortfolio();
  assert.equal(snapshot.source, 'none');
  assert.equal(snapshot.mode, 'unresolved');
  assert.equal(snapshot.positions.length, 0);
  assert.equal(fetchCalls, 0);
});

test('portfolio controller reads profile and positions for manual address', async () => {
  const urls = [];
  const controller = createPolymarketPortfolioController({
    getWalletState: async () => ({ account: null }),
    fetchImpl: async (url) => {
      urls.push(url);
      if (url.includes('/public-profile')) {
        return jsonResponse({
          pseudonym: 'Trader',
          proxyWallet: PROXY,
        });
      }

      return jsonResponse([
        {
          slug: 'btc-up',
          title: 'BTC up?',
          outcome: 'Yes',
          currentValue: '12.5',
          cashPnl: '2.5',
        },
      ]);
    },
  });

  const snapshot = await controller.getPolymarketPortfolio({ address: ADDRESS, force: true });
  assert.equal(snapshot.source, 'manual');
  assert.equal(snapshot.requestedAddress, ADDRESS);
  assert.equal(snapshot.profileAddress, PROXY);
  assert.equal(snapshot.profile.pseudonym, 'Trader');
  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.summary.totalCurrentValue, 12.5);
  assert.equal(urls.some((url) => url.includes(`user=${PROXY}`)), true);
});

test('portfolio controller binds service worker fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = function (url) {
    assert.equal(this, globalThis);
    fetchCalls += 1;
    if (String(url).includes('/public-profile')) return Promise.resolve(jsonResponse(null));
    return Promise.resolve(jsonResponse([]));
  };

  try {
    const controller = createPolymarketPortfolioController({
      getWalletState: async () => ({ account: ADDRESS }),
    });

    const snapshot = await controller.getPolymarketPortfolio({ force: true });
    assert.equal(snapshot.source, 'auto');
    assert.equal(fetchCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('portfolio controller caches snapshots by address', async () => {
  let fetchCalls = 0;
  let now = 1000;
  const controller = createPolymarketPortfolioController({
    now: () => now,
    getWalletState: async () => ({ account: ADDRESS }),
    fetchImpl: async (url) => {
      fetchCalls += 1;
      if (url.includes('/public-profile')) return jsonResponse(null);
      return jsonResponse([]);
    },
  });

  const first = await controller.getPolymarketPortfolio();
  const second = await controller.getPolymarketPortfolio();
  now += 91_000;
  const third = await controller.getPolymarketPortfolio();

  assert.equal(first.source, 'auto');
  assert.equal(second, first);
  assert.notEqual(third, first);
  assert.equal(fetchCalls, 4);
});
