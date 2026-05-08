import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PROJECT_ROOT = new URL('../../', import.meta.url);

test('analysis service keeps source default model', async () => {
  const text = await readFile(new URL('server/analysis-service.js', PROJECT_ROOT), 'utf8');
  assert.match(text, /const DEFAULT_OPENROUTER_MODEL = 'x-ai\/grok-4\.20';/);
});
