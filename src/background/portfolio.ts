import { type WalletState } from '../shared/wallet';
import {
  buildPortfolioSummary,
  createEmptyPortfolioSnapshot,
  normalizeEvmAddress,
  normalizePolymarketProfile,
  normalizePortfolioPosition,
  type PortfolioSnapshot,
} from '../shared/portfolio';
import { readRuntimeFetch } from '../shared/runtime-fetch';

const PROFILE_API_BASE_URL = 'https://profile-api.polymarket.com';
const DATA_API_BASE_URL = 'https://data-api.polymarket.com';
const REQUEST_TIMEOUT_MS = 12_000;
const POSITIONS_PAGE_LIMIT = 200;
const MAX_POSITION_PAGES = 10;
const CACHE_TTL_MS = 90_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type PortfolioControllerOptions = {
  getWalletState: (providerKey?: unknown) => Promise<WalletState>;
  fetchImpl?: FetchLike;
  now?: () => number;
};

type PortfolioRequest = {
  address?: unknown;
  providerKey?: unknown;
  force?: boolean;
};

type CachedPortfolio = {
  cachedAt: number;
  snapshot: PortfolioSnapshot;
};

// 错误文案
function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return String(error || 'Unknown error');
}

// 建控制器
export function createPolymarketPortfolioController(options: PortfolioControllerOptions) {
  const {
    getWalletState,
    fetchImpl = readRuntimeFetch(),
    now = () => Date.now(),
  } = options;
  const portfolioCache = new Map<string, CachedPortfolio>();

  // 拉 JSON
  async function fetchJson(url: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      if (response.status === 404) return null;
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  // 自动地址
  async function resolveAutoWalletAddress(providerKey: unknown) {
    try {
      const walletState = await getWalletState(providerKey);
      return normalizeEvmAddress(walletState?.account);
    } catch {
      return null;
    }
  }

  // 拉资料
  async function fetchPublicProfile(address: string) {
    const normalized = normalizeEvmAddress(address);
    if (!normalized) return null;

    const url = new URL(`${PROFILE_API_BASE_URL}/public-profile`);
    url.searchParams.set('address', normalized);
    return normalizePolymarketProfile(await fetchJson(url.toString()));
  }

  // 拉仓位
  async function fetchPositions(profileAddress: string) {
    const normalized = normalizeEvmAddress(profileAddress);
    if (!normalized) return [];

    const rows: unknown[] = [];

    for (let pageIndex = 0; pageIndex < MAX_POSITION_PAGES; pageIndex += 1) {
      const offset = pageIndex * POSITIONS_PAGE_LIMIT;
      const url = new URL(`${DATA_API_BASE_URL}/positions`);
      url.searchParams.set('user', normalized);
      url.searchParams.set('limit', String(POSITIONS_PAGE_LIMIT));
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('sizeThreshold', '0');
      url.searchParams.set('sortBy', 'CURRENT');

      const json = await fetchJson(url.toString());
      if (!Array.isArray(json) || json.length === 0) break;

      rows.push(...json);
      if (json.length < POSITIONS_PAGE_LIMIT) break;
    }

    return rows.map(normalizePortfolioPosition).filter((item) => item !== null);
  }

  // 读缓存
  function getCachedSnapshot(cacheKey: string, force: boolean) {
    if (force) return null;
    const cached = portfolioCache.get(cacheKey);
    if (!cached) return null;
    if (now() - cached.cachedAt > CACHE_TTL_MS) {
      portfolioCache.delete(cacheKey);
      return null;
    }
    return cached.snapshot;
  }

  // 写缓存
  function setCachedSnapshot(cacheKey: string, snapshot: PortfolioSnapshot) {
    portfolioCache.set(cacheKey, {
      cachedAt: now(),
      snapshot,
    });
  }

  // 查持仓
  async function getPolymarketPortfolio(request: PortfolioRequest = {}) {
    const manualAddress = normalizeEvmAddress(request.address);
    const autoAddress = manualAddress ? null : await resolveAutoWalletAddress(request.providerKey);
    const requestedAddress = manualAddress || autoAddress;
    const source = manualAddress ? 'manual' : autoAddress ? 'auto' : 'none';

    if (!requestedAddress) {
      return createEmptyPortfolioSnapshot({
        source,
        mode: 'unresolved',
        message: '未检测到可用地址。你可以连接钱包，或手动填写 Polymarket 地址。',
      });
    }

    const cacheKey = `${source}:${requestedAddress}`;
    const cached = getCachedSnapshot(cacheKey, Boolean(request.force));
    if (cached) return cached;

    try {
      const profile = await fetchPublicProfile(requestedAddress).catch(() => null);
      const profileAddress = profile?.proxyWallet || requestedAddress;
      const positions = await fetchPositions(profileAddress);
      const summary = buildPortfolioSummary(positions);
      const snapshot = createEmptyPortfolioSnapshot({
        source,
        mode: 'resolved',
        requestedAddress,
        accountAddress: autoAddress,
        profileAddress,
        fetchedAt: new Date().toISOString(),
        profile,
        positions: positions
          .slice()
          .sort((a, b) => Math.abs(Number(b.currentValue || 0)) - Math.abs(Number(a.currentValue || 0))),
        summary,
      });

      setCachedSnapshot(cacheKey, snapshot);
      return snapshot;
    } catch (error) {
      throw new Error(`读取 Polymarket 持仓失败: ${getErrorMessage(error)}`);
    }
  }

  return {
    getPolymarketPortfolio,
  };
}
