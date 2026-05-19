import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSocketHttpRequest,
  parseRawHttpResponse,
  shouldUseSocketHttp,
  withSocketTimeout,
} from '../../server/runtime/socket-http';

const encoder = new TextEncoder();

test('shouldUseSocketHttp only targets plain custom-port HTTP', () => {
  assert.equal(shouldUseSocketHttp('http://35.236.80.213:5678'), true);
  assert.equal(shouldUseSocketHttp('http://example.com'), false);
  assert.equal(shouldUseSocketHttp('https://example.com:5678'), false);
});

test('buildSocketHttpRequest creates HTTP/1.1 POST payload', async () => {
  const bytes = await buildSocketHttpRequest('http://35.236.80.213:5678', {
    body: '{"jsonrpc":"2.0"}',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const text = new TextDecoder().decode(bytes);

  assert.match(text, /^POST \/ HTTP\/1\.1\r\n/);
  assert.match(text, /host: 35\.236\.80\.213:5678\r\n/);
  assert.match(text, /content-length: 17\r\n/);
  assert.match(text, /\r\n\r\n\{"jsonrpc":"2\.0"\}$/);
});

test('parseRawHttpResponse reads fixed-length response bodies', async () => {
  const response = parseRawHttpResponse(encoder.encode(
    'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 11\r\n\r\n{"ok":true}',
  ));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(await response.text(), '{"ok":true}');
});

test('parseRawHttpResponse reads chunked response bodies', async () => {
  const response = parseRawHttpResponse(encoder.encode(
    'HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n',
  ));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'hello world');
});

test('withSocketTimeout surfaces stalled socket reads', async () => {
  await assert.rejects(
    () => withSocketTimeout(new Promise(() => {}), 'read', 1),
    /Socket HTTP read timed out\./,
  );
});
