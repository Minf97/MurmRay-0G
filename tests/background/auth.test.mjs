import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthController } from '../../src/background/auth';
import {
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
} from '../../src/shared/config';
import { AUTH_MESSAGE_TYPES } from '../../src/shared/messages';

function createJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

function createBrowserMock(initialStore = {}) {
  const store = { ...initialStore };
  const runtimeMessages = [];
  const launchedUrls = [];

  return {
    store,
    runtimeMessages,
    launchedUrls,
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
          async set(items) {
            Object.assign(store, items);
          },
          async remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete store[key];
            }
          },
        },
      },
      runtime: {
        async sendMessage(message) {
          runtimeMessages.push(message);
          return { ok: true };
        },
      },
      identity: {
        getRedirectURL() {
          return 'https://ext.chromiumapp.org/';
        },
        async launchWebAuthFlow(details) {
          launchedUrls.push(details.url);
          return 'https://ext.chromiumapp.org/?insforge_code=code-1';
        },
      },
    },
  };
}

test('auth controller stores google oauth session', async () => {
  const mock = createBrowserMock();
  const client = {
    auth: {
      async signInWithOAuth() {
        return { data: { url: 'https://accounts.google.com/oauth', codeVerifier: 'verifier-1' } };
      },
      async exchangeOAuthCode(code, verifier) {
        assert.equal(code, 'code-1');
        assert.equal(verifier, 'verifier-1');
        return {
          data: {
            accessToken: 'access-1',
            refreshToken: 'refresh-1',
            user: { id: 'user-1', email: 'ada@example.com', user_metadata: { name: 'Ada' } },
          },
        };
      },
      async refreshSession() {
        return { data: null };
      },
      async signOut() {
        return { data: null };
      },
      async getCurrentUser() {
        return { data: null };
      },
    },
  };

  const controller = createAuthController({
    browser: mock.browser,
    createAuthClient: () => client,
  });

  const result = await controller.signInWithGoogle();
  assert.equal(result.user.email, 'ada@example.com');
  assert.equal(mock.launchedUrls[0], 'https://accounts.google.com/oauth');
  assert.equal(mock.store[AUTH_TOKEN_STORAGE_KEY], 'access-1');
  assert.equal(mock.store[AUTH_REFRESH_TOKEN_STORAGE_KEY], 'refresh-1');
  assert.equal(mock.store[AUTH_USER_STORAGE_KEY].profile.name, 'Ada');
  assert.equal(mock.runtimeMessages.at(-1).type, AUTH_MESSAGE_TYPES.stateChanged);
});

test('auth controller restores cached user from storage', async () => {
  const token = createJwt({ sub: 'user-2', email: 'ray@example.com', exp: 1_900_000_000 });
  const mock = createBrowserMock({
    [AUTH_TOKEN_STORAGE_KEY]: token,
    [AUTH_USER_STORAGE_KEY]: { id: 'user-2', email: 'ray@example.com' },
  });
  let currentUserCalls = 0;

  const controller = createAuthController({
    browser: mock.browser,
    createAuthClient: () => ({
      auth: {
        async signInWithOAuth() { return { data: null }; },
        async exchangeOAuthCode() { return { data: null }; },
        async refreshSession() { return { data: null }; },
        async signOut() { return { data: null }; },
        async getCurrentUser() {
          currentUserCalls += 1;
          return { data: null };
        },
      },
    }),
  });

  const result = await controller.getUser();
  assert.equal(result.user.email, 'ray@example.com');
  assert.equal(currentUserCalls, 0);
});

test('auth controller clears expired token when refresh fails', async () => {
  const token = createJwt({ sub: 'user-3', email: 'old@example.com', exp: 1 });
  const mock = createBrowserMock({
    [AUTH_TOKEN_STORAGE_KEY]: token,
    [AUTH_REFRESH_TOKEN_STORAGE_KEY]: 'refresh-old',
  });

  const controller = createAuthController({
    browser: mock.browser,
    createAuthClient: () => ({
      auth: {
        async signInWithOAuth() { return { data: null }; },
        async exchangeOAuthCode() { return { data: null }; },
        async refreshSession() {
          return { error: { message: 'refresh token expired', statusCode: 401 } };
        },
        async signOut() { return { data: null }; },
        async getCurrentUser() { return { data: null }; },
      },
    }),
  });

  assert.equal(await controller.getUser(), null);
  assert.equal(AUTH_TOKEN_STORAGE_KEY in mock.store, false);
  assert.equal(AUTH_REFRESH_TOKEN_STORAGE_KEY in mock.store, false);
  assert.equal(mock.runtimeMessages.at(-1).user, null);
});

test('auth controller signs out and broadcasts empty user', async () => {
  const mock = createBrowserMock({
    [AUTH_TOKEN_STORAGE_KEY]: 'access-2',
    [AUTH_REFRESH_TOKEN_STORAGE_KEY]: 'refresh-2',
    [AUTH_USER_STORAGE_KEY]: { id: 'user-4', email: 'bye@example.com' },
  });
  let signOutCalls = 0;

  const controller = createAuthController({
    browser: mock.browser,
    createAuthClient: () => ({
      auth: {
        async signInWithOAuth() { return { data: null }; },
        async exchangeOAuthCode() { return { data: null }; },
        async refreshSession() { return { data: null }; },
        async signOut() {
          signOutCalls += 1;
          return { data: null };
        },
        async getCurrentUser() { return { data: null }; },
      },
    }),
  });

  await controller.logout();
  assert.equal(signOutCalls, 1);
  assert.deepEqual(mock.store, {});
  assert.equal(mock.runtimeMessages.at(-1).type, AUTH_MESSAGE_TYPES.stateChanged);
  assert.equal(mock.runtimeMessages.at(-1).user, null);
});
