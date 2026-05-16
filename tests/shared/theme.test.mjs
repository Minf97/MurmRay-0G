import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isThemePreference,
  normalizeThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
} from '../../src/shared/theme';

test('theme preference validates stored values', () => {
  assert.equal(THEME_STORAGE_KEY, 'murmray.theme.preference');
  assert.equal(isThemePreference('system'), true);
  assert.equal(isThemePreference('light'), true);
  assert.equal(isThemePreference('dark'), true);
  assert.equal(isThemePreference('auto'), false);
});

test('theme preference normalizes unknown input', () => {
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('system'), 'system');
  assert.equal(normalizeThemePreference(''), 'system');
});

test('theme preference resolves system and manual modes', () => {
  assert.equal(resolveThemePreference('system', true), 'dark');
  assert.equal(resolveThemePreference('system', false), 'light');
  assert.equal(resolveThemePreference('dark', false), 'dark');
  assert.equal(resolveThemePreference('light', true), 'light');
});
