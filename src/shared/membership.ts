import { getXLayerNetwork } from './chains';

export const DEFAULT_FREE_DAILY_QUOTA = 1000;
export const DEFAULT_USAGE_PACK_CREDITS = 20;
export const MURMRAY_PAYMENT_NETWORK_MODE = 'mainnet';

const activeXLayerNetwork = getXLayerNetwork(MURMRAY_PAYMENT_NETWORK_MODE);

const XLAYER_PAYMENT_TOKENS = {
  mainnet: {
    type: 'erc20',
    name: 'USDt0',
    symbol: 'USDT0',
    decimals: 6,
    address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
  },
} as const;

const activePaymentToken = XLAYER_PAYMENT_TOKENS[MURMRAY_PAYMENT_NETWORK_MODE];

export const MURMRAY_PAYMENT_CONFIG = {
  networkMode: MURMRAY_PAYMENT_NETWORK_MODE,
  recipientAddress: '0xcE39698C17cC53734E86704dfD2F061B318f8B50',
  treasuryAddress: '0x953fdc110a67b1381621ac02c449b8d36681e5f6',
  recipientLabel: 'MurmRay',
  chainId: activeXLayerNetwork.id,
  chainHexId: activeXLayerNetwork.chainId,
  chainName: activeXLayerNetwork.chainName,
  symbol: activeXLayerNetwork.nativeCurrency.symbol,
  nativeCurrency: activeXLayerNetwork.nativeCurrency,
  rpcUrls: activeXLayerNetwork.rpcUrls,
  blockExplorerUrls: activeXLayerNetwork.blockExplorerUrls,
  txExplorerBaseUrl: activeXLayerNetwork.txExplorerBaseUrl,
  paymentType: activePaymentToken?.type || 'native',
  paymentSymbol: activePaymentToken?.symbol || activeXLayerNetwork.nativeCurrency.symbol,
  paymentTokenName: activePaymentToken?.name || activeXLayerNetwork.nativeCurrency.name,
  paymentDecimals: activePaymentToken?.decimals ?? activeXLayerNetwork.nativeCurrency.decimals,
  paymentTokenAddress: activePaymentToken?.address || '',
  setupHint: activePaymentToken ? '功能配置未完成' : '功能暂不可用',
} as const;

// 净化订单段
function sanitizePaymentReferencePart(value: unknown, fallback: string) {
  const normalized = String(value || '')
    .trim()
    .replace(/[|\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ');

  return normalized || fallback;
}

// 构建链上单号
export function buildChainPaymentOrderId({
  orderId,
  productType,
  itemName,
  amount,
  symbol,
}: {
  orderId: unknown;
  productType: unknown;
  itemName: unknown;
  amount: unknown;
  symbol: unknown;
}) {
  const safeProductType = sanitizePaymentReferencePart(productType, 'payment');
  const safeItemName = sanitizePaymentReferencePart(itemName, 'item');
  const safeOrderId = sanitizePaymentReferencePart(orderId, 'unknown-order');
  const safeAmount = sanitizePaymentReferencePart(
    amount && symbol ? `${amount} ${symbol}` : amount,
    symbol ? `0 ${symbol}` : '0',
  );

  return `${safeProductType}|${safeItemName}|${safeAmount}|${safeOrderId}`;
}

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

export type PaymentOrder = {
  orderId: string;
  productType: 'membership' | 'usage_pack';
  planCode?: string;
  planName?: string;
  packCode?: string;
  packName?: string;
  itemName: string;
  creditCount?: number;
  recipientAddress: string;
  amount: string;
  amountNative: string;
  amountBaseUnits: string;
  paymentAmountHex: string;
  paymentType: string;
  paymentSymbol: string;
  paymentTokenAddress: string | null;
  paymentTokenDecimals: number;
  valueHex: string;
  chainId: number;
  chainHexId: string;
  zeroPrice: boolean;
  paymentRequired: boolean;
};

export type PaymentConfirmation = {
  orderId: string;
  productType: 'membership' | 'usage_pack';
  planCode?: string;
  packCode?: string;
  dailyQuota?: number | null;
  creditCount?: number;
  remainingCredits?: number;
  txHash: string;
  status: string;
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

// 取价格值
export function getItemPriceAmount(item: unknown) {
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  return String(record.priceAmount ?? record.price_amount ?? record.priceNative ?? '').trim();
}

// 判断零价
export function isZeroPricedItem(item: unknown) {
  const priceAmount = getItemPriceAmount(item);
  return /^\d+(\.\d+)?$/.test(priceAmount) && Number(priceAmount) === 0;
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

// 次卡文案
export function getUsagePackLabel(creditCount: unknown) {
  return `${Math.max(0, Math.trunc(Number(creditCount) || 0))} 次额度`;
}

// 价格文案
export function getPlanPriceLabel(item: unknown) {
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  if (!record.purchasable || isZeroPricedItem(item)) return '免费';

  const priceAmount = getItemPriceAmount(item);
  if (!priceAmount) return '价格待填写';
  return `${priceAmount} ${MURMRAY_PAYMENT_CONFIG.paymentSymbol}`;
}

// 支付可用
export function isPaymentConfigReady(item: unknown) {
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  if (!record.purchasable) return false;
  if (isZeroPricedItem(item)) return true;

  const hasToken = MURMRAY_PAYMENT_CONFIG.paymentType !== 'erc20'
    || Boolean(String(MURMRAY_PAYMENT_CONFIG.paymentTokenAddress || '').trim());

  return Boolean(
    String(MURMRAY_PAYMENT_CONFIG.recipientAddress || '').trim()
    && getItemPriceAmount(item)
    && hasToken
  );
}

// 金额转基数
export function paymentAmountToBaseUnits(amount: unknown, decimals = MURMRAY_PAYMENT_CONFIG.paymentDecimals) {
  const normalized = String(amount || '').trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('请输入合法金额，例如 0.1');
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  if (fractionPart.length > decimals) {
    throw new Error(`最多支持 ${decimals} 位小数`);
  }

  const base = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(wholePart || '0') * base;
  const fractionUnits = BigInt((fractionPart + '0'.repeat(decimals)).slice(0, decimals) || '0');
  const totalUnits = wholeUnits + fractionUnits;

  if (totalUnits <= 0n) {
    throw new Error('金额必须大于 0');
  }

  return totalUnits.toString();
}

// 金额转十六
export function paymentAmountToHexUnits(amount: unknown, decimals = MURMRAY_PAYMENT_CONFIG.paymentDecimals) {
  return `0x${BigInt(paymentAmountToBaseUnits(amount, decimals)).toString(16)}`;
}

export const nativeAmountToBaseUnits = paymentAmountToBaseUnits;
export const nativeAmountToHexUnits = paymentAmountToHexUnits;
