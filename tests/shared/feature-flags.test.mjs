import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOW_PAYMENT_SURFACE,
  SHOW_WALLET_SURFACE,
} from '../../src/shared/feature-flags';

test('wallet and payment surfaces are enabled for main parity', () => {
  assert.equal(SHOW_WALLET_SURFACE, true);
  assert.equal(SHOW_PAYMENT_SURFACE, true);
});
