import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXTENSION_DESCRIPTION,
  EXTENSION_NAME,
  EXTENSION_PERMISSIONS,
  MINIMUM_CHROME_VERSION,
  WEB_PAGE_MATCHES,
} from '../../src/shared/manifest.ts';

test('manifest constants expose baseline metadata', () => {
  assert.equal(EXTENSION_NAME, 'MURMRAY');
  assert.equal(EXTENSION_DESCRIPTION.length > 0, true);
  assert.equal(MINIMUM_CHROME_VERSION, '114');
});

test('manifest constants keep required page matches', () => {
  assert.deepEqual([...WEB_PAGE_MATCHES], [
    'http://*/*',
    'https://*/*',
  ]);
});

test('manifest constants keep required permissions', () => {
  assert.deepEqual([...EXTENSION_PERMISSIONS], [
    'tabs',
    'scripting',
    'storage',
  ]);
});
