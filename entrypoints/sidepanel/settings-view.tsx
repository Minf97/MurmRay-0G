import type { ResolvedTheme, ThemePreference } from '../../src/shared/theme';
import { SettingsPartnerMerchants } from './settings-partners';

const THEME_COPY: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

type SettingsViewProps = {
  ghostEnabled: boolean;
  ghostBusy: boolean;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  onToggleGhost: (enabled: boolean) => void;
  onThemePreferenceChange: (preference: ThemePreference) => void;
};

// 设置视图
export function SettingsView({
  ghostEnabled,
  ghostBusy,
  themePreference,
  resolvedTheme,
  onToggleGhost,
  onThemePreferenceChange,
}: SettingsViewProps) {
  return (
    <section className="flex min-h-[calc(100vh-64px)] flex-col" id="view-settings" role="tabpanel" aria-labelledby="tab-settings">
      <div className="border-b border-(--rule) px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-sm font-semibold text-(--ink-1)">外观</span>
            <span className="mt-0.5 block text-[11px] leading-[1.45] text-(--ink-3)">默认跟随 Chrome 当前亮暗偏好</span>
          </div>
          <span className="inline-flex min-h-[22px] shrink-0 items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2)">
            {resolvedTheme === 'dark' ? '深色中' : '浅色中'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-(--rule) bg-(--surface-strong) p-1" role="group" aria-label="外观模式">
          {(['system', 'light', 'dark'] satisfies ThemePreference[]).map((preference) => {
            const active = themePreference === preference;
            return (
              <button
                key={preference}
                type="button"
                className={`min-h-9 cursor-pointer rounded-lg border border-transparent px-2 text-[12px] font-semibold transition-colors duration-160 ${
                  active
                    ? 'bg-(--paper) text-(--ink-1) [box-shadow:0_1px_2px_rgb(17_24_39/10%)]'
                    : 'bg-transparent text-(--ink-3) hover:text-(--ink-1)'
                }`}
                aria-pressed={active}
                onClick={() => onThemePreferenceChange(preference)}
              >
                {THEME_COPY[preference]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-[60px] items-center justify-between gap-3 border-b border-(--rule) px-4">
        <div className="inline-flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold text-(--ink-1)">幽灵模式</span>
          <span className="inline-flex min-h-[22px] items-center rounded-full border border-(--rule) bg-(--surface) px-2 text-[11px] font-semibold text-(--ink-2)">{ghostEnabled ? '已开启' : '已关闭'}</span>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center" aria-label="幽灵模式">
          <input
            className="peer sr-only"
            type="checkbox"
            checked={ghostEnabled}
            disabled={ghostBusy}
            onChange={(event) => onToggleGhost(event.currentTarget.checked)}
          />
          <span className="relative h-5 w-[34px] rounded-full bg-(--rule-strong) transition-colors duration-160 peer-checked:bg-(--ink-1) peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--accent) peer-checked:[&>span]:translate-x-3.5" aria-hidden="true">
            <span className="absolute left-[3px] top-[3px] size-3.5 rounded-full bg-(--paper) transition-transform duration-160 [box-shadow:0_1px_2px_rgb(17_24_39/18%)]" />
          </span>
        </label>
      </div>
      {/* <SettingsPartnerMerchants resolvedTheme={resolvedTheme} /> */}
    </section>
  );
}
