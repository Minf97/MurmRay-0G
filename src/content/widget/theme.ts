import {
  normalizeThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
} from '../../shared/theme';
import type { WidgetElements } from './dom';

export type WidgetThemeStorage = {
  local: { get(key: string): Promise<Record<string, unknown>> };
  onChanged?: {
    addListener(listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void): void;
  };
};

// 系统主题
function getSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// 应用主题
export function applyWidgetThemePreference(elements: WidgetElements, value: unknown) {
  const preference = normalizeThemePreference(value);
  if (preference === 'system') {
    elements.host.removeAttribute('data-theme');
    return;
  }

  elements.host.dataset.theme = resolveThemePreference(preference, getSystemPrefersDark());
}

// 读取主题
export async function loadWidgetThemePreference(
  elements: WidgetElements,
  storage: WidgetThemeStorage,
) {
  const result = await storage.local.get(THEME_STORAGE_KEY);
  applyWidgetThemePreference(elements, result[THEME_STORAGE_KEY]);
}

// 监听主题
export function installWidgetThemeSync(
  elements: WidgetElements,
  storage: WidgetThemeStorage,
) {
  storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local' || !(THEME_STORAGE_KEY in changes)) return;
    applyWidgetThemePreference(elements, changes[THEME_STORAGE_KEY].newValue);
  });
}
