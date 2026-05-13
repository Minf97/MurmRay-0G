import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('sidepanel uses inline tailwind classes in components', async () => {
  const app = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/App.tsx'), 'utf8');
  const authPanel = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/auth-panel.tsx'), 'utf8');
  const source = `${app}\n${authPanel}`;

  assert.doesNotMatch(source, /from '\.\/styles'/);
  assert.doesNotMatch(source, /sidePanelClass|get[A-Z][A-Za-z]+Class|cx\(/);
  assert.doesNotMatch(source, /\[[a-z]*var\(--[a-z0-9-]+\)\]/i);
  assert.match(source, /bg-\(--paper\)/);
  assert.match(source, /className="[^"]*rounded-full[^"]*border/);
  assert.match(source, /className=\{`[^`]*translate-x-\[200%\]/);
  assert.match(source, /className="[^"]*grid-cols-\[minmax\(0,1fr\)_52px_16px\]/);
});

test('sidepanel css only keeps tailwind entry and global rules', async () => {
  const css = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/style.css'), 'utf8');
  assert.match(css, /@import "tailwindcss";/);

  for (const selector of ['.tab-bar', '.btn', '.auth-shell', '.opportunity-item', '.ghost-mode-toggle']) {
    assert.doesNotMatch(css, new RegExp(`\\n\\s*\\${selector}`));
  }
});

test('sidepanel does not keep a separate style map module', async () => {
  await assert.rejects(
    access(resolve(repoRoot, 'entrypoints/sidepanel/styles.ts')),
    /ENOENT/,
  );
});
