import test from 'node:test';
import assert from 'node:assert/strict';
import { renderZeroGProofPage } from '../../server/services/zero-g/page';

test('renderZeroGProofPage loads a bounded proof list', () => {
  const html = renderZeroGProofPage();

  assert.match(html, /const DEFAULT_PROOF_LIST_LIMIT = 5;/);
  assert.match(html, /function readListLimit/);
  assert.match(html, /\/api\/0g\/proofs\?limit=/);
});

test('renderZeroGProofPage shows API error details', () => {
  const html = renderZeroGProofPage();

  assert.match(html, /function readErrorMessage/);
  assert.match(html, /payload\.error/);
});
