import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PROJECT_ROOT = new URL('../../', import.meta.url);

test('analysis service keeps source default model', async () => {
  const text = await readFile(new URL('server/services/shared/config.ts', PROJECT_ROOT), 'utf8');
  const opportunityText = await readFile(new URL('server/services/opportunity/config.ts', PROJECT_ROOT), 'utf8');
  assert.match(text, /DEFAULT_OPENROUTER_MODEL = 'x-ai\/grok-4\.20';/);
  assert.match(text, /DEFAULT_OPENROUTER_EMBED_MODEL = 'google\/gemini-embedding-2-preview';/);
  assert.match(text, /DEFAULT_OPENROUTER_EMBED_DIMENSIONS = 3072;/);
  assert.match(text, /DEFAULT_OPENROUTER_HTTP_REFERER = 'https:\/\/murmray\.app';/);
  assert.match(opportunityText, /DEFAULT_PREFETCH_COUNT = 1200;/);
});
