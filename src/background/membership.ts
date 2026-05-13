import { createClient } from '@insforge/sdk';
import {
  AUTH_TOKEN_STORAGE_KEY,
  INSFORGE_ANON_KEY,
  INSFORGE_URL,
} from '../shared/config';
import {
  createDefaultPricingCatalog,
  createFreeMembershipStatus,
  normalizeMembershipStatus,
  normalizePricingCatalogRows,
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

  return {
    consumeAnalysisQuota,
    getMembershipStatus,
    getPricingCatalog,
  };
}
