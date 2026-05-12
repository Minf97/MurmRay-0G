import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFallbackUserFromToken,
  getOAuthCallbackParams,
  isAuthFailure,
  isTokenExpired,
  normalizeAuthUser,
  normalizeGoogleAuthError,
} from '../../src/shared/auth';

function createJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

test('normalizeAuthUser accepts sdk and legacy shapes', () => {
  const now = () => '2026-01-01T00:00:00.000Z';
  const sdkUser = normalizeAuthUser({
    id: 'user-1',
    email: 'ada@example.com',
    user_metadata: { name: 'Ada' },
  }, now);

  assert.equal(sdkUser.id, 'user-1');
  assert.equal(sdkUser.email, 'ada@example.com');
  assert.equal(sdkUser.profile.name, 'Ada');
  assert.equal(sdkUser.emailVerified, true);

  const legacyUser = normalizeAuthUser({ userId: 'legacy-1', email: 'old@example.com' }, now);
  assert.equal(legacyUser.id, 'legacy-1');
});

test('jwt helpers detect expiry and fallback user', () => {
  const token = createJwt({
    sub: 'user-2',
    email: 'ray@example.com',
    name: 'Ray',
    exp: 1_800_000_000,
  });

  assert.equal(isTokenExpired(token, () => 1_700_000_000_000), false);
  assert.equal(isTokenExpired(token, () => 1_900_000_000_000), true);

  const user = createFallbackUserFromToken(token, () => '2026-01-01T00:00:00.000Z');
  assert.equal(user.id, 'user-2');
  assert.equal(user.profile.name, 'Ray');
});

test('oauth callback parser reads query and hash payloads', () => {
  assert.deepEqual(
    getOAuthCallbackParams('https://ext.chromiumapp.org/?insforge_code=abc'),
    {
      code: 'abc',
      error: null,
      errorDescription: null,
      accessToken: null,
      userId: null,
      email: null,
      name: null,
    },
  );

  const hash = getOAuthCallbackParams('https://ext.chromiumapp.org/#access_token=t&user_id=u&email=a%40b.com&name=Ada');
  assert.equal(hash.accessToken, 't');
  assert.equal(hash.userId, 'u');
  assert.equal(hash.email, 'a@b.com');
});

test('auth error helpers keep user-facing copy stable', () => {
  assert.equal(isAuthFailure({ statusCode: 401 }), true);
  assert.equal(isAuthFailure(new Error('refresh token expired')), true);
  assert.equal(isAuthFailure(new Error('network failed')), false);
  assert.equal(normalizeGoogleAuthError(new Error('User closed the window')), '已取消 Google 登录');
});
