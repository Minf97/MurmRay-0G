import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOW_PAYMENT_SURFACE,
  SHOW_WALLET_SURFACE,
} from '../../src/shared/feature-flags';

test('temporary wallet and payment surfaces stay hidden', () => {
  assert.equal(SHOW_WALLET_SURFACE, false);
  assert.equal(SHOW_PAYMENT_SURFACE, false);
});
