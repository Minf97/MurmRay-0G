import test from 'node:test';
import assert from 'node:assert/strict';
import { installFetchXMLHttpRequest } from '../../server/runtime/fetch-xhr';

test('FetchXMLHttpRequest calls bound runtime fetch', async () => {
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;

  globalThis.fetch = function () {
    assert.equal(this, globalThis);
    return Promise.resolve(new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
  };

  try {
    installFetchXMLHttpRequest();
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onloadend = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new Error('xhr failed'));
      xhr.open('GET', 'https://example.com/data');
      xhr.send();
    });

    assert.deepEqual(result, { status: 200, text: '{"ok":true}' });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXhr;
  }
});
