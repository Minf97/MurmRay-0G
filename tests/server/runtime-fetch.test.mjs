import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuntimeFetch } from '../../server/runtime/fetch';

test('readRuntimeFetch preserves WorkerGlobalScope binding', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;

  globalThis.fetch = function () {
    called = true;
    assert.equal(this, globalThis);
    return Promise.resolve(new Response('ok'));
  };

  try {
    const response = await readRuntimeFetch()('https://example.com');
    assert.equal(await response.text(), 'ok');
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
