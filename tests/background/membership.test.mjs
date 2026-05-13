import test from 'node:test';
import assert from 'node:assert/strict';
import { createMembershipController } from '../../src/background/membership';
import { AUTH_TOKEN_STORAGE_KEY } from '../../src/shared/config';
import { DEFAULT_FREE_DAILY_QUOTA } from '../../src/shared/membership';

function createBrowserMock(initialStore = {}) {
  const store = { ...initialStore };

  return {
    store,
    browser: {
      storage: {
        local: {
          async get(key) {
            if (key == null) return { ...store };
            if (typeof key === 'string') {
              return Object.prototype.hasOwnProperty.call(store, key) ? { [key]: store[key] } : {};
            }
            return Object.fromEntries(key.filter((item) => item in store).map((item) => [item, store[item]]));
          },
        },
      },
    },
  };
}

test('membership controller returns login-required free status', async () => {
  const mock = createBrowserMock();
  let rpcCalls = 0;
  const controller = createMembershipController({
    browser: mock.browser,
    getAuthUser: async () => null,
    createMembershipClient: () => ({
      database: {
        async rpc() {
          rpcCalls += 1;
          return { data: null };
        },
      },
    }),
  });

  const status = await controller.getMembershipStatus();
  assert.equal(status.requiresLogin, true);
  assert.equal(status.remainingToday, DEFAULT_FREE_DAILY_QUOTA);
  assert.equal(rpcCalls, 0);
});

test('membership controller reads catalog and access status', async () => {
  const mock = createBrowserMock({ [AUTH_TOKEN_STORAGE_KEY]: 'access-1' });
  const calls = [];
  const controller = createMembershipController({
    browser: mock.browser,
    getAuthUser: async () => ({ user: { id: 'user-1', email: 'ada@example.com', profile: { name: 'Ada' } } }),
    createMembershipClient: (token) => ({
      database: {
        async rpc(fn, args) {
          calls.push({ fn, args, token });
          if (fn === 'murmray_get_pricing_catalog') {
            return {
              data: [
                { product_type: 'membership', code: 'premium', name: 'Pro', daily_quota: null, sort_order: 1 },
              ],
            };
          }

          return {
            data: [{
              plan_code: 'premium',
              used_today: 7,
              extra_credits: 2,
            }],
          };
        },
      },
    }),
  });

  const status = await controller.getMembershipStatus();
  assert.equal(status.planCode, 'premium');
  assert.equal(status.planName, 'Pro');
  assert.equal(status.unlimited, true);
  assert.equal(status.extraCredits, 2);
  assert.deepEqual(calls.map((call) => call.fn), ['murmray_get_pricing_catalog', 'murmray_get_access_status']);
  assert.equal(calls[1].args.p_user_id, 'user-1');
  assert.equal(calls[1].token, 'access-1');
});

test('membership controller consumes quota before analysis', async () => {
  const mock = createBrowserMock({ [AUTH_TOKEN_STORAGE_KEY]: 'access-1' });
  const calls = [];
  const controller = createMembershipController({
    browser: mock.browser,
    getAuthUser: async () => ({ user: { id: 'user-1', email: 'ada@example.com', profile: { name: 'Ada' } } }),
    createMembershipClient: (token) => ({
      database: {
        async rpc(fn, args) {
          calls.push({ fn, args, token });
          if (fn === 'murmray_get_pricing_catalog') {
            return { data: [] };
          }

          return {
            data: [{
              allowed: true,
              plan_code: 'free',
              used_today: 8,
              remaining_today: 992,
            }],
          };
        },
      },
    }),
  });

  const status = await controller.consumeAnalysisQuota();
  assert.equal(status.planCode, 'free');
  assert.equal(status.usedToday, 8);
  assert.equal(status.remainingToday, 992);
  assert.deepEqual(calls.map((call) => call.fn), ['murmray_get_pricing_catalog', 'murmray_consume_daily_usage']);
  assert.equal(calls[1].args.p_user_id, 'user-1');
  assert.equal(calls[1].token, 'access-1');
});

test('membership controller blocks quota consumption without login', async () => {
  const mock = createBrowserMock();
  const controller = createMembershipController({
    browser: mock.browser,
    getAuthUser: async () => null,
    createMembershipClient: () => ({
      database: {
        async rpc() {
          return { data: null };
        },
      },
    }),
  });

  await assert.rejects(
    controller.consumeAnalysisQuota(),
    /请先登录 MurmRay/,
  );
});

test('membership controller surfaces exhausted quota message', async () => {
  const mock = createBrowserMock({ [AUTH_TOKEN_STORAGE_KEY]: 'access-1' });
  const controller = createMembershipController({
    browser: mock.browser,
    getAuthUser: async () => ({ user: { id: 'user-1', email: 'ada@example.com', profile: { name: 'Ada' } } }),
    createMembershipClient: () => ({
      database: {
        async rpc(fn) {
          if (fn === 'murmray_get_pricing_catalog') {
            return { data: [] };
          }

          return { data: [{ allowed: false, message: '额度已用完' }] };
        },
      },
    }),
  });

  await assert.rejects(
    controller.consumeAnalysisQuota(),
    /额度已用完/,
  );
});

test('membership controller falls back when setup is missing', async () => {
  const mock = createBrowserMock({ [AUTH_TOKEN_STORAGE_KEY]: 'access-1' });
  const controller = createMembershipController({
    browser: mock.browser,
    getAuthUser: async () => ({ user: { id: 'user-1', email: 'ada@example.com', profile: { name: '' } } }),
    createMembershipClient: () => ({
      database: {
        async rpc(fn) {
          if (fn === 'murmray_get_pricing_catalog') {
            return { error: { message: 'function murmray_get_pricing_catalog does not exist' } };
          }
          return { error: { message: 'function murmray_get_access_status does not exist' } };
        },
      },
    }),
  });

  const catalog = await controller.getPricingCatalog({ force: true });
  const status = await controller.getMembershipStatus();
  assert.equal(catalog.source, 'local');
  assert.equal(status.setupRequired, true);
  assert.equal(status.planCode, 'free');
});

test('membership controller bypasses quota when setup is missing', async () => {
  const mock = createBrowserMock({ [AUTH_TOKEN_STORAGE_KEY]: 'access-1' });
  const controller = createMembershipController({
    browser: mock.browser,
    getAuthUser: async () => ({ user: { id: 'user-1', email: 'ada@example.com', profile: { name: '' } } }),
    createMembershipClient: () => ({
      database: {
        async rpc(fn) {
          if (fn === 'murmray_get_pricing_catalog') {
            return { error: { message: 'function murmray_get_pricing_catalog does not exist' } };
          }
          return { error: { message: 'function murmray_consume_daily_usage does not exist' } };
        },
      },
    }),
  });

  const status = await controller.consumeAnalysisQuota();
  assert.equal(status.setupRequired, true);
  assert.equal(status.bypassed, true);
  assert.equal(status.planCode, 'free');
});
