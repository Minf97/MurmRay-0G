import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

const PROJECT_ROOT = new URL('../../', import.meta.url);

async function assertPathExists(relativePath) {
  await access(new URL(relativePath, PROJECT_ROOT));
}

test('phase0 baseline files exist', async () => {
  const requiredPaths = [
    'entrypoints/background.ts',
    'entrypoints/content.ts',
    'entrypoints/sidepanel/index.html',
    'entrypoints/sidepanel/main.tsx',
    'entrypoints/sidepanel/App.tsx',
    'src/background/api.ts',
    'src/shared/analysis.ts',
    'src/shared/config.ts',
    'src/shared/manifest.ts',
    'src/shared/messages.ts',
    'server/analysis-service.js',
    'server/index.js',
    'scripts/dev.js',
  ];

  await Promise.all(requiredPaths.map(assertPathExists));
  assert.equal(requiredPaths.length, 13);
});
