export const DEFAULT_FREE_DAILY_QUOTA = 1000;
export const DEFAULT_USAGE_PACK_CREDITS = 20;

export type MembershipPlan = {
  productType: 'membership';
  code: string;
  name: string;
  dailyQuota: number | null;
  priceAmount: string;
  description: string;
  ctaLabel: string;
  accent: string;
  featured: boolean;
  purchasable: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type UsagePack = {
  productType: 'usage_pack';
  code: string;
  name: string;
  creditCount: number;
  priceAmount: string;
  description: string;
  ctaLabel: string;
  accent: string;
  featured: boolean;
  purchasable: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type PricingCatalog = {
  membershipPlans: MembershipPlan[];
  usagePacks: UsagePack[];
  items: Array<MembershipPlan | UsagePack>;
  source: 'local' | 'backend';
};

export type MembershipStatus = {
  planCode: string;
  planName: string;
  dailyQuota: number | null;
  usedToday: number;
  remainingToday: number | null;
  unlimited: boolean;
  extraCredits: number;
  usedPaidCredit: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  setupRequired: boolean;
  requiresLogin?: boolean;
  bypassed?: boolean;
};

export const MURMRAY_MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    productType: 'membership',
    code: 'free',
    name: '普通用户',
    dailyQuota: DEFAULT_FREE_DAILY_QUOTA,
    priceAmount: '0',
    description: '每日 1000 次免费分析。',
    ctaLabel: '默认',
    accent: 'muted',
    featured: false,
    purchasable: false,
    isActive: true,
    sortOrder: 10,
  },
  {
    productType: 'membership',
    code: 'premium',
    name: '增强权益',
    dailyQuota: null,
    priceAmount: '5',
    description: '1 个月内不限分析。',
    ctaLabel: '启用',
    accent: 'gold',
    featured: true,
    purchasable: true,
    isActive: true,
    sortOrder: 20,
  },
];

export const MURMRAY_USAGE_PACKS: UsagePack[] = [
  {
    productType: 'usage_pack',
    code: 'credit_pack_20',
    name: '补充额度',
    creditCount: DEFAULT_USAGE_PACK_CREDITS,
    priceAmount: '0.1',
    description: '20 次额外分析，用完为止。',
    ctaLabel: '启用',
    accent: 'teal',
    featured: false,
    purchasable: true,
    isActive: true,
    sortOrder: 30,
  },
];

// 复制条目
function cloneItem<T extends object>(item: T): T {
  return { ...item };
}

// 规范布尔
function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

// 规范文本
function normalizeText(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

// 规范价格
function normalizePriceAmount(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim();
  if (!normalized || !/^\d+(\.\d+)?$/.test(normalized)) return fallback;

  return normalized
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '')
    .replace(/\.$/, '');
}

// 规范整数
function normalizeNullableInteger(value: unknown, fallback: number | null = null) {
  if (value == null || value === '') return fallback;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.trunc(numeric));
}

// 标准时间
function normalizeDateTime(value: unknown) {
  if (!value) return null;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// 默认目录
export function createDefaultPricingCatalog(): PricingCatalog {
  const membershipPlans = MURMRAY_MEMBERSHIP_PLANS.map(cloneItem);
  const usagePacks = MURMRAY_USAGE_PACKS.map(cloneItem);

  return {
    membershipPlans,
    usagePacks,
    items: [...membershipPlans, ...usagePacks],
    source: 'local',
  };
}

// 查会员档
export function getMembershipPlan(planCode: unknown, plans = MURMRAY_MEMBERSHIP_PLANS) {
  const source = Array.isArray(plans) && plans.length ? plans : MURMRAY_MEMBERSHIP_PLANS;
  const code = normalizeText(planCode, 'free');
  return source.find((plan) => plan.code === code) || source[0];
}

// 查次卡档
export function getUsagePack(packCode: unknown, packs = MURMRAY_USAGE_PACKS) {
  const source = Array.isArray(packs) && packs.length ? packs : MURMRAY_USAGE_PACKS;
  const code = normalizeText(packCode, '');
  return source.find((pack) => pack.code === code) || source[0] || null;
}

// 建会员行
function buildMembershipPlanRow(raw: Record<string, unknown>, fallback: MembershipPlan): MembershipPlan {
  return {
    ...fallback,
    productType: 'membership',
    code: normalizeText(raw.code, fallback.code),
    name: normalizeText(raw.name, fallback.name),
    dailyQuota: normalizeNullableInteger(raw.daily_quota ?? raw.dailyQuota, fallback.dailyQuota),
    priceAmount: normalizePriceAmount(raw.price_amount ?? raw.priceAmount, fallback.priceAmount),
    description: normalizeText(raw.description, fallback.description),
    ctaLabel: normalizeText(raw.cta_label ?? raw.ctaLabel, fallback.ctaLabel),
    accent: normalizeText(raw.accent, fallback.accent),
    featured: normalizeBoolean(raw.featured, fallback.featured),
    purchasable: normalizeBoolean(raw.purchasable, fallback.purchasable),
    isActive: normalizeBoolean(raw.is_active ?? raw.isActive, fallback.isActive),
    sortOrder: normalizeNullableInteger(raw.sort_order ?? raw.sortOrder, fallback.sortOrder) ?? fallback.sortOrder,
  };
}

// 建次卡行
function buildUsagePackRow(raw: Record<string, unknown>, fallback: UsagePack): UsagePack {
  return {
    ...fallback,
    productType: 'usage_pack',
    code: normalizeText(raw.code, fallback.code),
    name: normalizeText(raw.name, fallback.name),
    creditCount: normalizeNullableInteger(raw.credit_count ?? raw.creditCount, fallback.creditCount) ?? fallback.creditCount,
    priceAmount: normalizePriceAmount(raw.price_amount ?? raw.priceAmount, fallback.priceAmount),
    description: normalizeText(raw.description, fallback.description),
    ctaLabel: normalizeText(raw.cta_label ?? raw.ctaLabel, fallback.ctaLabel),
    accent: normalizeText(raw.accent, fallback.accent),
    featured: normalizeBoolean(raw.featured, fallback.featured),
    purchasable: normalizeBoolean(raw.purchasable, fallback.purchasable),
    isActive: normalizeBoolean(raw.is_active ?? raw.isActive, fallback.isActive),
    sortOrder: normalizeNullableInteger(raw.sort_order ?? raw.sortOrder, fallback.sortOrder) ?? fallback.sortOrder,
  };
}

// 规范目录
export function normalizePricingCatalogRows(rows: unknown[]): PricingCatalog {
  const hasBackendRows = Array.isArray(rows) && rows.length > 0;
  const membershipPlans = MURMRAY_MEMBERSHIP_PLANS.map(cloneItem);
  const usagePacks = MURMRAY_USAGE_PACKS.map(cloneItem);
  const membershipIndex = new Map(membershipPlans.map((item, index) => [item.code, index]));
  const usagePackIndex = new Map(usagePacks.map((item, index) => [item.code, index]));
  const seenMembershipCodes = new Set<string>();
  const seenUsagePackCodes = new Set<string>();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const raw = row as Record<string, unknown>;
    const productType = normalizeText(raw.product_type ?? raw.productType, '');
    const code = normalizeText(raw.code, '');
    if (!productType || !code) continue;

    if (productType === 'membership') {
      const fallback = getMembershipPlan(code, membershipPlans);
      const next = buildMembershipPlanRow(raw, fallback);
      const index = membershipIndex.get(code);
      seenMembershipCodes.add(code);
      if (index !== undefined) {
        membershipPlans[index] = next;
      } else {
        membershipIndex.set(code, membershipPlans.length);
        membershipPlans.push(next);
      }
      continue;
    }

    if (productType === 'usage_pack') {
      const fallback = getUsagePack(code, usagePacks);
      if (!fallback) continue;
      const next = buildUsagePackRow(raw, fallback);
      const index = usagePackIndex.get(code);
      seenUsagePackCodes.add(code);
      if (index !== undefined) {
        usagePacks[index] = next;
      } else {
        usagePackIndex.set(code, usagePacks.length);
        usagePacks.push(next);
      }
    }
  }

  if (hasBackendRows) {
    for (const plan of membershipPlans) {
      if (!seenMembershipCodes.has(plan.code)) plan.isActive = false;
    }
    for (const pack of usagePacks) {
      if (!seenUsagePackCodes.has(pack.code)) pack.isActive = false;
    }
  }

  membershipPlans.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  usagePacks.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  return {
    membershipPlans,
    usagePacks,
    items: [...membershipPlans, ...usagePacks],
    source: hasBackendRows ? 'backend' : 'local',
  };
}

// 默认权益
export function createFreeMembershipStatus(extra: Partial<MembershipStatus> = {}): MembershipStatus {
  return {
    planCode: 'free',
    planName: '普通用户',
    dailyQuota: DEFAULT_FREE_DAILY_QUOTA,
    usedToday: 0,
    remainingToday: DEFAULT_FREE_DAILY_QUOTA,
    unlimited: false,
    extraCredits: 0,
    usedPaidCredit: false,
    startsAt: null,
    expiresAt: null,
    setupRequired: false,
    ...extra,
  };
}

// 规范权益
export function normalizeMembershipStatus(raw: unknown, catalog = createDefaultPricingCatalog()): MembershipStatus {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const plan = getMembershipPlan(data.plan_code ?? data.planCode ?? 'free', catalog.membershipPlans);
  const normalizedQuota = Number(data.daily_quota ?? data.dailyQuota);
  const dailyQuota = Number.isFinite(normalizedQuota) ? normalizedQuota : plan.dailyQuota;
  const usedToday = Math.max(0, Number(data.used_today ?? data.usedToday ?? 0) || 0);
  const unlimited = dailyQuota == null;
  const remainingToday = unlimited
    ? null
    : Math.max(0, Number(data.remaining_today ?? data.remainingToday ?? Number(dailyQuota) - usedToday) || 0);
  const extraCreditsRaw = Number(data.extra_credits ?? data.extraCredits ?? 0);

  return {
    planCode: plan.code,
    planName: plan.name,
    dailyQuota,
    usedToday,
    remainingToday,
    unlimited,
    extraCredits: Number.isFinite(extraCreditsRaw) ? Math.max(0, extraCreditsRaw) : 0,
    usedPaidCredit: Boolean(data.used_paid_credit ?? data.usedPaidCredit ?? false),
    startsAt: normalizeDateTime(data.starts_at ?? data.startsAt),
    expiresAt: normalizeDateTime(data.expires_at ?? data.expiresAt),
    setupRequired: false,
  };
}

// 额度文案
export function getQuotaLabel(dailyQuota: number | null | undefined) {
  if (dailyQuota == null) return '不限次数 / 日';
  return `${Math.max(0, Math.trunc(Number(dailyQuota) || 0))} 次 / 日`;
}
