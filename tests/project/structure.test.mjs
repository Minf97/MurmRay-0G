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
    'src/content/widget/controller.ts',
    'src/content/widget/dom.ts',
    'src/content/widget/template.ts',
    'src/shared/analysis.ts',
    'src/shared/config.ts',
    'src/shared/manifest.ts',
    'src/shared/messages.ts',
    'server/services/opportunity/service.ts',
    'server/services/opportunity/insforge.ts',
    'server/services/opportunity/openrouter.ts',
    'server/services/embeddings/service.ts',
    'server/services/embeddings/insforge.ts',
    'server/services/embeddings/openrouter.ts',
    'server/services/shared/config.ts',
    'server/services/shared/openrouter.ts',
    'server/services/sync/service.ts',
    'server/services/sync/gamma.ts',
    'server/services/sync/db.ts',
    'server/index.ts',
    'scripts/dev.js',
  ];

  await Promise.all(requiredPaths.map(assertPathExists));
  assert.equal(requiredPaths.length, 26);
});
