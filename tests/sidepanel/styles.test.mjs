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

test('sidepanel exposes light and dark theme tokens', async () => {
  const app = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/App.tsx'), 'utf8');
  const settingsView = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/settings-view.tsx'), 'utf8');
  const css = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/style.css'), 'utf8');
  const widgetTemplate = await readFile(resolve(repoRoot, 'src/content/widget/template.ts'), 'utf8');
  const widgetController = await readFile(resolve(repoRoot, 'src/content/widget/controller.ts'), 'utf8');
  const widgetTheme = await readFile(resolve(repoRoot, 'src/content/widget/theme.ts'), 'utf8');

  assert.match(app, /THEME_STORAGE_KEY/);
  assert.match(app, /dataset\.theme/);
  assert.match(settingsView, /跟随系统/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(widgetTemplate, /:host\(\[data-theme="dark"\]\)/);
  assert.match(widgetTemplate, /prefers-color-scheme: dark/);
  assert.match(widgetController, /installWidgetThemeSync/);
  assert.match(widgetTheme, /storage\.onChanged/);
});

test('sidepanel animates tab panel transitions', async () => {
  const app = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/App.tsx'), 'utf8');
  const css = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/style.css'), 'utf8');

  assert.match(app, /className="tab-panel-shell" hidden=\{activeTab !== 'feed'\}/);
  assert.match(app, /className="tab-panel-shell" hidden=\{activeTab !== 'profile'\}/);
  assert.match(app, /className="tab-panel-shell" hidden=\{activeTab !== 'settings'\}/);
  assert.match(css, /@keyframes tab-panel-rise/);
  assert.match(css, /\.tab-panel-shell:not\(\[hidden\]\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('sidepanel references migrated brand logo', async () => {
  const app = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/App.tsx'), 'utf8');
  const authPanel = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/auth-panel.tsx'), 'utf8');
  const source = `${app}\n${authPanel}`;

  assert.match(source, /\/brand\/murmray-logo\.png/);
});

test('settings exposes 1024ex partner link', async () => {
  const app = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/App.tsx'), 'utf8');
  const settingsView = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/settings-view.tsx'), 'utf8');
  const partners = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/settings-partners.tsx'), 'utf8');
  const darkLogoPath = resolve(repoRoot, 'public/brand/1024ex-symbol-dark.svg');
  const lightLogoPath = resolve(repoRoot, 'public/brand/1024ex-symbol-light.svg');

  await access(darkLogoPath);
  await access(lightLogoPath);
  assert.match(app, /<SettingsView/);
  assert.match(settingsView, /<SettingsPartnerMerchants resolvedTheme=\{resolvedTheme\} \/>/);
  assert.match(partners, /https:\/\/www\.1024ex\.com/);
  assert.match(partners, /\/brand\/1024ex-symbol-dark\.svg/);
  assert.match(partners, /\/brand\/1024ex-symbol-light\.svg/);
  assert.match(partners, /\/brand\/murmray-logo\.png/);
  assert.match(partners, /resolvedTheme === 'dark'/);
  assert.match(partners, /displayPrefix: '1'/);
  assert.match(partners, /displaySuffix: '24ex'/);
  assert.match(partners, /MurmRay/);
  assert.match(partners, /\{partner\.name\}/);
  assert.doesNotMatch(partners, /hover:/);
  assert.doesNotMatch(partners, /transition-/);
  assert.doesNotMatch(partners, />合作友商</);
  assert.doesNotMatch(partners, />Partner</);
});

test('sidepanel does not keep a separate style map module', async () => {
  await assert.rejects(
    access(resolve(repoRoot, 'entrypoints/sidepanel/styles.ts')),
    /ENOENT/,
  );
});

test('sidepanel hides wallet and payment surfaces but keeps portfolio', async () => {
  const app = await readFile(resolve(repoRoot, 'entrypoints/sidepanel/App.tsx'), 'utf8');

  assert.match(app, /SHOW_PAYMENT_SURFACE \? \(/);
  assert.match(app, /SHOW_WALLET_SURFACE \? \(/);
  assert.match(app, /<PortfolioBlock/);
  assert.match(app, /walletLookupEnabled=\{SHOW_WALLET_SURFACE\}/);
});
