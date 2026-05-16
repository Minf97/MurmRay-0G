import { browser } from 'wxt/browser';
import type { ResolvedTheme } from '../../src/shared/theme';

export const SETTINGS_PARTNERS = [
  {
    key: '1024ex',
    name: '1024EX',
    displayPrefix: '1',
    displaySuffix: '24ex',
    websiteUrl: 'https://www.1024ex.com',
    lightLogoSrc: '/brand/1024ex-symbol-dark.svg',
    darkLogoSrc: '/brand/1024ex-symbol-light.svg',
  },
] as const;

const MURMRAY_BRAND = {
  name: 'MurmRay',
  logoSrc: '/brand/murmray-logo.png',
} as const;

// 打开官网
export async function openPartnerSite(url: string) {
  await browser.tabs.create({ url, active: true });
}

type SettingsPartnerMerchantsProps = {
  resolvedTheme: ResolvedTheme;
};

// 合作模块
export function SettingsPartnerMerchants({ resolvedTheme }: SettingsPartnerMerchantsProps) {
  return (
    <div className="mt-auto flex justify-center px-4 pb-5 pt-6">
      <div className="relative flex">
        {SETTINGS_PARTNERS.map((partner) => {
          const logoSrc = resolvedTheme === 'dark' ? partner.darkLogoSrc : partner.lightLogoSrc;
          return (
            <button
              key={partner.key}
              type="button"
              className="flex h-12 cursor-pointer items-center gap-2.5 border-0 bg-transparent py-1.5 pl-2.5 pr-3 text-inherit"
              aria-label={`打开 ${partner.name} 官网，来自 ${MURMRAY_BRAND.name}`}
              onClick={() => void openPartnerSite(partner.websiteUrl)}
            >
              <span className="inline-flex items-center gap-[2px] text-[14px] font-[700] leading-none tracking-normal text-(--ink-1)">
                <span>{partner.displayPrefix}</span>
                <span className="flex size-[22px] items-center justify-center overflow-hidden rounded-[6px] bg-(--surface) [box-shadow:inset_0_0_0_1px_rgb(255_255_255/12%)]" aria-hidden="true">
                  <img
                    className="size-full object-cover"
                    src={logoSrc}
                    alt=""
                  />
                </span>
                <span>{partner.displaySuffix}</span>
              </span>
              <span className="h-5 w-px bg-(--rule-strong)" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5">
                <img
                  className="size-6 rounded-[6px] object-cover"
                  src={MURMRAY_BRAND.logoSrc}
                  alt=""
                />
                <span className="text-[13px] font-[650] leading-none tracking-normal text-(--ink-1)">
                  {MURMRAY_BRAND.name}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
