import { createClient } from '@insforge/sdk';
import {
  AUTH_TOKEN_STORAGE_KEY,
  INSFORGE_ANON_KEY,
  INSFORGE_URL,
} from '../shared/config';
import {
  createDefaultPricingCatalog,
  createFreeMembershipStatus,
  DEFAULT_FREE_DAILY_QUOTA,
  getItemPriceAmount,
  getMembershipPlan,
  getUsagePack,
  isZeroPricedItem,
  MURMRAY_PAYMENT_CONFIG,
  nativeAmountToBaseUnits,
  nativeAmountToHexUnits,
  normalizeMembershipStatus,
  normalizePricingCatalogRows,
  type PaymentConfirmation,
  type PaymentOrder,
  type MembershipStatus,
  type PricingCatalog,
} from '../shared/membership';
import type { AuthUser } from '../shared/auth';

const PRICING_CATALOG_CACHE_TTL_MS = 60 * 1000;

type StorageArea = {
  get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>;
};

type MembershipBrowser = {
  storage: { local: StorageArea };
};

type MembershipRpcResult = Promise<{ data?: unknown; error?: unknown }>;

type MembershipSdkClient = {
  database: {
    rpc: (fn: string, args?: Record<string, unknown>) => MembershipRpcResult;
    from: (table: string) => {
      insert: (rows: Array<Record<string, unknown>>) => {
        select: (columns?: string) => {
          single: () => MembershipRpcResult;
        };
      };
    };
  };
};

type MembershipControllerOptions = {
  browser: MembershipBrowser;
  getAuthUser: () => Promise<{ user?: AuthUser | null } | null>;
  createMembershipClient?: (accessToken?: string | null) => MembershipSdkClient;
};

// 建客户端
function createDefaultMembershipClient(accessToken: string | null = null): MembershipSdkClient {
  return createClient({
    baseUrl: INSFORGE_URL,
    anonKey: INSFORGE_ANON_KEY,
    edgeFunctionToken: accessToken || undefined,
    autoRefreshToken: false,
    isServerMode: true,
  }) as unknown as MembershipSdkClient;
}

// 取错误文案
function getErrorMessage(error: unknown) {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const candidates = [record.message, record.details, record.hint, record.code]
      .filter((item) => typeof item === 'string' && item.trim());
    if (candidates.length) return candidates.join(' | ');
  }

  return String(error || 'Unknown error');
}

// 缺表判断
function isMembershipSetupMissing(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('murmray_')
    && (
      message.includes('does not exist')
      || message.includes('not exist')
      || message.includes('not found')
      || message.includes('schema cache')
      || message.includes('undefined function')
    );
}

// 缺目录判断
function isPricingCatalogMissing(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return isMembershipSetupMissing(error) || message.includes('murmray_get_pricing_catalog');
}

// 取单行
function normalizeRpcRow(data: unknown) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

// 构建金额
function buildPaymentAmount(item: unknown) {
  const priceAmount = getItemPriceAmount(item);
  const zeroPrice = isZeroPricedItem(item);

  if (!priceAmount) throw new Error('当前项目暂不可用，请稍后再试');

  const amountBaseUnits = zeroPrice
    ? '0'
    : nativeAmountToBaseUnits(priceAmount, MURMRAY_PAYMENT_CONFIG.paymentDecimals);
  const amountHex = zeroPrice
    ? '0x0'
    : nativeAmountToHexUnits(priceAmount, MURMRAY_PAYMENT_CONFIG.paymentDecimals);

  return {
    priceAmount,
    zeroPrice,
    amountBaseUnits,
    amountHex,
    valueHex: !zeroPrice && MURMRAY_PAYMENT_CONFIG.paymentType === 'native' ? amountHex : '0x0',
  };
}

// 建控制器
export function createMembershipController(options: MembershipControllerOptions) {
  const {
    browser,
    getAuthUser,
    createMembershipClient = createDefaultMembershipClient,
  } = options;
  const storage = browser.storage.local;
  let pricingCatalogCache: PricingCatalog = createDefaultPricingCatalog();
  let pricingCatalogFetchedAt = 0;

  // 读令牌
  async function getToken() {
    const result = await storage.get(AUTH_TOKEN_STORAGE_KEY);
    const token = result[AUTH_TOKEN_STORAGE_KEY];
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  }

  // 查目录
  async function getPricingCatalog(options: { force?: boolean } = {}) {
    const force = Boolean(options.force);
    const now = Date.now();

    if (!force && pricingCatalogCache && now - pricingCatalogFetchedAt < PRICING_CATALOG_CACHE_TTL_MS) {
      return pricingCatalogCache;
    }

    try {
      const token = await getToken();
      const { data, error } = await createMembershipClient(token).database.rpc('murmray_get_pricing_catalog');

      if (error) {
        if (isPricingCatalogMissing(error)) {
          pricingCatalogCache = createDefaultPricingCatalog();
          pricingCatalogFetchedAt = now;
          return pricingCatalogCache;
        }

        throw new Error(`读取定价失败: ${getErrorMessage(error)}`);
      }

      pricingCatalogCache = normalizePricingCatalogRows(Array.isArray(data) ? data : []);
      pricingCatalogFetchedAt = now;
      return pricingCatalogCache;
    } catch (error) {
      if (pricingCatalogCache) return pricingCatalogCache;
      throw error;
    }
  }

  // 要求登录
  async function requireAuthenticatedUser() {
    const authData = await getAuthUser().catch(() => null);
    const user = authData?.user || null;
    if (!user?.id) throw new Error('请先登录 MurmRay');
    return user;
  }

  // 取会员档
  async function resolveMembershipPlan(planCode: unknown) {
    const catalog = await getPricingCatalog({ force: true });
    return getMembershipPlan(planCode, catalog.membershipPlans);
  }

  // 取次卡档
  async function resolveUsagePack(packCode: unknown) {
    const catalog = await getPricingCatalog({ force: true });
    return getUsagePack(packCode, catalog.usagePacks);
  }

  // 查权益
  async function getMembershipStatus(): Promise<MembershipStatus> {
    const authData = await getAuthUser().catch(() => null);
    const user = authData?.user || null;
    if (!user?.id) return createFreeMembershipStatus({ requiresLogin: true });

    const token = await getToken();
    const catalog = await getPricingCatalog();
    const { data, error } = await createMembershipClient(token).database.rpc('murmray_get_access_status', {
      p_user_id: String(user.id),
    });

    if (error) {
      if (isMembershipSetupMissing(error)) {
        return createFreeMembershipStatus({ setupRequired: true });
      }

      throw new Error(`读取会员状态失败: ${getErrorMessage(error)}`);
    }

    return normalizeMembershipStatus(normalizeRpcRow(data), catalog);
  }

  // 扣分析额
  async function consumeAnalysisQuota(): Promise<MembershipStatus> {
    const authData = await getAuthUser().catch(() => null);
    const user = authData?.user || null;
    if (!user?.id) {
      throw new Error('请先登录 MurmRay，再使用分析功能');
    }

    const token = await getToken();
    const catalog = await getPricingCatalog();
    const { data, error } = await createMembershipClient(token).database.rpc('murmray_consume_daily_usage', {
      p_user_id: String(user.id),
    });

    if (error) {
      if (isMembershipSetupMissing(error)) {
        return createFreeMembershipStatus({ setupRequired: true, bypassed: true });
      }

      throw new Error(`校验分析额度失败: ${getErrorMessage(error)}`);
    }

    const payload = normalizeRpcRow(data) as Record<string, unknown> | null;
    if (payload?.allowed === false) {
      throw new Error(String(payload.message || '今日免费额度已用完。普通用户每天 1000 次。'));
    }

    return normalizeMembershipStatus(payload, catalog);
  }

  // 建会员单
  async function createMembershipOrder(planCode: unknown): Promise<PaymentOrder> {
    const user = await requireAuthenticatedUser();
    const plan = await resolveMembershipPlan(planCode);
    const recipientAddress = String(MURMRAY_PAYMENT_CONFIG.recipientAddress || '').trim();
    const payment = buildPaymentAmount(plan);

    if (!plan?.isActive || !plan?.purchasable) {
      throw new Error('当前权益已启用');
    }

    if (!payment.zeroPrice && !recipientAddress) {
      throw new Error(MURMRAY_PAYMENT_CONFIG.setupHint);
    }

    const token = await getToken();
    const payload = {
      user_id: String(user.id),
      plan_code: plan.code,
      plan_name: plan.name,
      quota_per_day: plan.dailyQuota,
      price_amount: payment.priceAmount,
      price_wei: payment.amountBaseUnits,
      chain: 'xlayer',
      chain_id: MURMRAY_PAYMENT_CONFIG.chainId,
      recipient_address: recipientAddress || null,
      payment_type: MURMRAY_PAYMENT_CONFIG.paymentType,
      payment_symbol: MURMRAY_PAYMENT_CONFIG.paymentSymbol,
      payment_token_address: MURMRAY_PAYMENT_CONFIG.paymentTokenAddress || null,
      payment_token_decimals: MURMRAY_PAYMENT_CONFIG.paymentDecimals,
      status: 'pending',
    };

    // 写会员订单
    const { data, error } = await createMembershipClient(token).database
      .from('murmray_membership_orders')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      if (isMembershipSetupMissing(error)) throw new Error('权益系统正在初始化，请稍后再试');
      throw new Error(`创建订单失败: ${getErrorMessage(error)}`);
    }

    const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    return {
      orderId: String(row.id || ''),
      productType: 'membership',
      planCode: plan.code,
      planName: plan.name,
      itemName: plan.name,
      recipientAddress,
      amount: payment.priceAmount,
      amountNative: payment.priceAmount,
      amountBaseUnits: payment.amountBaseUnits,
      paymentAmountHex: payment.amountHex,
      paymentType: MURMRAY_PAYMENT_CONFIG.paymentType,
      paymentSymbol: MURMRAY_PAYMENT_CONFIG.paymentSymbol,
      paymentTokenAddress: MURMRAY_PAYMENT_CONFIG.paymentTokenAddress || null,
      paymentTokenDecimals: MURMRAY_PAYMENT_CONFIG.paymentDecimals,
      valueHex: payment.valueHex,
      chainId: MURMRAY_PAYMENT_CONFIG.chainId,
      chainHexId: MURMRAY_PAYMENT_CONFIG.chainHexId,
      zeroPrice: payment.zeroPrice,
      paymentRequired: !payment.zeroPrice,
    };
  }

  // 建次卡单
  async function createUsagePackOrder(packCode: unknown): Promise<PaymentOrder> {
    const user = await requireAuthenticatedUser();
    const pack = await resolveUsagePack(packCode);
    const recipientAddress = String(MURMRAY_PAYMENT_CONFIG.recipientAddress || '').trim();
    const payment = buildPaymentAmount(pack);

    if (!pack?.isActive || !pack?.purchasable) {
      throw new Error('当前补充额度暂不可用');
    }

    if (!payment.zeroPrice && !recipientAddress) {
      throw new Error(MURMRAY_PAYMENT_CONFIG.setupHint);
    }

    const token = await getToken();
    const payload = {
      user_id: String(user.id),
      pack_code: pack.code,
      pack_name: pack.name,
      credit_count: pack.creditCount,
      price_amount: payment.priceAmount,
      price_wei: payment.amountBaseUnits,
      chain: 'xlayer',
      chain_id: MURMRAY_PAYMENT_CONFIG.chainId,
      recipient_address: recipientAddress || null,
      payment_type: MURMRAY_PAYMENT_CONFIG.paymentType,
      payment_symbol: MURMRAY_PAYMENT_CONFIG.paymentSymbol,
      payment_token_address: MURMRAY_PAYMENT_CONFIG.paymentTokenAddress || null,
      payment_token_decimals: MURMRAY_PAYMENT_CONFIG.paymentDecimals,
      status: 'pending',
    };

    // 写次卡订单
    const { data, error } = await createMembershipClient(token).database
      .from('murmray_usage_credit_orders')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      if (isMembershipSetupMissing(error)) throw new Error('额度系统正在初始化，请稍后再试');
      throw new Error(`创建额度记录失败: ${getErrorMessage(error)}`);
    }

    const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    return {
      orderId: String(row.id || ''),
      productType: 'usage_pack',
      packCode: pack.code,
      packName: pack.name,
      itemName: pack.name,
      creditCount: pack.creditCount,
      recipientAddress,
      amount: payment.priceAmount,
      amountNative: payment.priceAmount,
      amountBaseUnits: payment.amountBaseUnits,
      paymentAmountHex: payment.amountHex,
      paymentType: MURMRAY_PAYMENT_CONFIG.paymentType,
      paymentSymbol: MURMRAY_PAYMENT_CONFIG.paymentSymbol,
      paymentTokenAddress: MURMRAY_PAYMENT_CONFIG.paymentTokenAddress || null,
      paymentTokenDecimals: MURMRAY_PAYMENT_CONFIG.paymentDecimals,
      valueHex: payment.valueHex,
      chainId: MURMRAY_PAYMENT_CONFIG.chainId,
      chainHexId: MURMRAY_PAYMENT_CONFIG.chainHexId,
      zeroPrice: payment.zeroPrice,
      paymentRequired: !payment.zeroPrice,
    };
  }

  // 确认会员单
  async function confirmMembershipOrder({
    orderId,
    txHash,
    senderAddress,
    chainId,
  }: {
    orderId: unknown;
    txHash: unknown;
    senderAddress?: unknown;
    chainId?: unknown;
  }): Promise<PaymentConfirmation> {
    const user = await requireAuthenticatedUser();
    const token = await getToken();
    const { data, error } = await createMembershipClient(token).database.rpc('murmray_activate_membership_order', {
      p_order_id: orderId,
      p_user_id: String(user.id),
      p_tx_hash: txHash,
      p_sender_address: senderAddress || null,
      p_chain_id: Number.isFinite(Number(chainId)) ? Number(chainId) : MURMRAY_PAYMENT_CONFIG.chainId,
    });

    if (error) {
      if (isMembershipSetupMissing(error)) throw new Error('权益系统正在初始化，请稍后再试');
      throw new Error(`确认订单失败: ${getErrorMessage(error)}`);
    }

    const payload = normalizeRpcRow(data) as Record<string, unknown> | null;
    return {
      orderId: String(payload?.order_id || orderId || ''),
      productType: 'membership',
      planCode: String(payload?.plan_code || 'premium'),
      dailyQuota: normalizeNullableResult(payload?.daily_quota, DEFAULT_FREE_DAILY_QUOTA),
      txHash: String(payload?.tx_hash || txHash || ''),
      status: String(payload?.status || 'paid'),
    };
  }

  // 确认次卡单
  async function confirmUsagePackOrder({
    orderId,
    txHash,
    senderAddress,
    chainId,
  }: {
    orderId: unknown;
    txHash: unknown;
    senderAddress?: unknown;
    chainId?: unknown;
  }): Promise<PaymentConfirmation> {
    const user = await requireAuthenticatedUser();
    const token = await getToken();
    const { data, error } = await createMembershipClient(token).database.rpc('murmray_activate_usage_credit_order', {
      p_order_id: orderId,
      p_user_id: String(user.id),
      p_tx_hash: txHash,
      p_sender_address: senderAddress || null,
      p_chain_id: Number.isFinite(Number(chainId)) ? Number(chainId) : MURMRAY_PAYMENT_CONFIG.chainId,
    });

    if (error) {
      if (isMembershipSetupMissing(error)) throw new Error('额度系统正在初始化，请稍后再试');
      throw new Error(`确认额度记录失败: ${getErrorMessage(error)}`);
    }

    const payload = normalizeRpcRow(data) as Record<string, unknown> | null;
    return {
      orderId: String(payload?.order_id || orderId || ''),
      productType: 'usage_pack',
      packCode: String(payload?.pack_code || 'credit_pack_20'),
      creditCount: Math.max(0, Number(payload?.credit_count ?? 0) || 0),
      remainingCredits: Math.max(0, Number(payload?.remaining_credits ?? 0) || 0),
      txHash: String(payload?.tx_hash || txHash || ''),
      status: String(payload?.status || 'paid'),
    };
  }

  return {
    confirmMembershipOrder,
    confirmUsagePackOrder,
    consumeAnalysisQuota,
    createMembershipOrder,
    createUsagePackOrder,
    getMembershipStatus,
    getPricingCatalog,
  };
}

// 规范可空数
function normalizeNullableResult(value: unknown, fallback: number | null) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
