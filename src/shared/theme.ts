export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'murmray.theme.preference';

export const THEME_PREFERENCES: readonly ThemePreference[] = Object.freeze([
  'system',
  'light',
  'dark',
]);

// 校验偏好
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

// 规范偏好
export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : 'system';
}

// 解析主题
export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}
