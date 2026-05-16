import test from 'node:test';
import assert from 'node:assert/strict';
import { getContentRuntime, sendContentRuntimeMessage } from '../../src/content/runtime';

test('content runtime prefers provided browser runtime', async () => {
  const source = {
    runtime: {
      async sendMessage(message) {
        return { ok: true, message };
      },
    },
  };

  assert.equal(getContentRuntime(source), source.runtime);
  assert.deepEqual(await sendContentRuntimeMessage(source, { type: 'ping' }), {
    ok: true,
    message: { type: 'ping' },
  });
});

test('content runtime can use chrome global runtime', async () => {
  const previousChrome = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      async sendMessage(message) {
        return { ok: true, message };
      },
    },
  };

  try {
    assert.deepEqual(await sendContentRuntimeMessage({}, { type: 'fallback' }), {
      ok: true,
      message: { type: 'fallback' },
    });
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test('content runtime throws when unavailable', () => {
  const previousChrome = globalThis.chrome;
  delete globalThis.chrome;

  try {
    assert.throws(() => getContentRuntime({}), /Extension runtime unavailable/);
  } finally {
    globalThis.chrome = previousChrome;
  }
});
