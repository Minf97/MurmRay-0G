import { XLAYER_MAINNET, type EvmChainConfig } from '../shared/chains';
import { normalizeWalletProviderKey, type WalletProviderKey, type WalletState } from '../shared/wallet';

type WalletTab = {
  id?: number;
  title?: string;
  url?: string;
};

type WalletBrowser = {
  tabs: {
    query: (query: { active: boolean; currentWindow: boolean }) => Promise<WalletTab[]>;
  };
  scripting: {
    executeScript: (details: {
      target: { tabId: number };
      world: 'MAIN';
      func: typeof walletBridge;
      args: [string, Record<string, unknown>];
    }) => Promise<Array<{ result?: WalletBridgeResult }>>;
  };
};

type WalletProvider = {
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  providers?: WalletProvider[];
  isMetaMask?: boolean;
  isOKXWallet?: boolean;
  isOkxWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
};

type WalletWindow = Window & {
  ethereum?: WalletProvider;
  okxwallet?: WalletProvider & { ethereum?: WalletProvider };
};

type WalletBridgeResult = (WalletState & { ok: true }) | { ok: false; error: string };

type WalletControllerOptions = {
  browser: WalletBrowser;
  runWalletAction?: (action: string, payload?: Record<string, unknown>) => Promise<WalletState>;
};

// 网页校验
function isWebUrl(url: unknown) {
  return /^https?:\/\//i.test(String(url || ''));
}

// 错误文案
function getErrorMessage(error: unknown, fallback = '钱包调用失败') {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

// 钱包桥接
export async function walletBridge(action: unknown, payload: Record<string, unknown> = {}): Promise<WalletBridgeResult> {
  const hostWindow = window as WalletWindow;

  // 延迟等待
  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 规范链ID
  function normalizeChainId(chainId: unknown) {
    if (typeof chainId === 'number' && Number.isFinite(chainId)) {
      return `0x${Math.trunc(chainId).toString(16)}`;
    }

    if (typeof chainId !== 'string') return null;
    const trimmed = chainId.trim().toLowerCase();
    if (!trimmed) return null;
    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
      const normalized = trimmed.replace(/^0x/, '').replace(/^0+/, '');
      return `0x${normalized || '0'}`;
    }

    const value = Number(trimmed);
    return Number.isFinite(value) ? `0x${Math.trunc(value).toString(16)}` : null;
  }

  // 钱包列表
  function getAvailableProviders() {
    const candidates: WalletProvider[] = [];
    const ethereumProvider = hostWindow.ethereum;
    const okxProvider = hostWindow.okxwallet?.ethereum || hostWindow.okxwallet;

    function pushProvider(provider: WalletProvider | undefined) {
      if (!provider || typeof provider.request !== 'function') return;
      if (!candidates.includes(provider)) candidates.push(provider);
    }

    pushProvider(ethereumProvider);
    if (Array.isArray(ethereumProvider?.providers)) {
      ethereumProvider.providers.forEach(pushProvider);
    }
    pushProvider(okxProvider);

    return candidates;
  }

  // 钱包名称
  function getProviderLabel(provider: WalletProvider | null) {
    if (!provider) return '未检测到钱包';
    if (provider === hostWindow.okxwallet || provider === hostWindow.okxwallet?.ethereum) return 'OKX Wallet';
    if (provider.isMetaMask) return 'MetaMask';
    if (provider.isOKXWallet || provider.isOkxWallet) return 'OKX Wallet';
    if (provider.isCoinbaseWallet) return 'Coinbase Wallet';
    if (provider.isTrust) return 'Trust Wallet';
    return '浏览器钱包';
  }

  // 判断MM
  function isMetaMaskProvider(provider: WalletProvider) {
    return Boolean(provider?.isMetaMask);
  }

  // 判断OKX
  function isOkxProvider(provider: WalletProvider) {
    return Boolean(provider?.isOKXWallet || provider?.isOkxWallet);
  }

  // 读取账户
  async function getProviderAccounts(provider: WalletProvider) {
    const accounts = await provider.request?.({ method: 'eth_accounts' }).catch(() => []);
    return Array.isArray(accounts) ? accounts.filter((item) => typeof item === 'string') : [];
  }

  // 选择钱包
  async function pickProvider(providerKey: unknown) {
    const providers = getAvailableProviders();
    if (!providers.length) return null;

    const normalizedKey = providerKey === 'metamask' || providerKey === 'okx' ? providerKey : 'auto';
    if (normalizedKey === 'metamask') return providers.find(isMetaMaskProvider) || null;
    if (normalizedKey === 'okx') return providers.find(isOkxProvider) || null;

    const snapshots = await Promise.all(providers.map(async (provider) => ({
      provider,
      accounts: await getProviderAccounts(provider),
    })));
    const connectedProviders = snapshots.filter((item) => item.accounts.length > 0).map((item) => item.provider);
    const preferredPool = connectedProviders.length ? connectedProviders : providers;

    return preferredPool.find(isMetaMaskProvider)
      || preferredPool.find(isOkxProvider)
      || preferredPool[0]
      || null;
  }

  // 缺链错误
  function isMissingChainError(error: unknown) {
    const record = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
    const code = Number(record.code);
    const message = String(record.message || '').toLowerCase();
    return code === 4902 || message.includes('unrecognized chain') || message.includes('not added');
  }

  // 等待切链
  async function waitForChain(provider: WalletProvider, targetChainId: unknown, attempts = 8, waitMs = 300) {
    const normalizedTarget = normalizeChainId(targetChainId);

    for (let index = 0; index < attempts; index += 1) {
      const currentChainId = normalizeChainId(
        await provider.request?.({ method: 'eth_chainId' }).catch(() => null),
      );

      if (currentChainId && currentChainId === normalizedTarget) return currentChainId;
      if (index < attempts - 1) await delay(waitMs);
    }

    throw new Error('钱包尚未切换到目标网络，请在钱包弹窗中确认切链');
  }

  // 切换网络
  async function switchOrAddChain(provider: WalletProvider, chain: Partial<EvmChainConfig> | undefined) {
    const chainId = normalizeChainId(chain?.chainId);
    if (!chainId) throw new Error('缺少链 ID');

    try {
      await provider.request?.({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }],
      });
      return chainId;
    } catch (error) {
      if (!isMissingChainError(error)) throw error;
    }

    await provider.request?.({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId,
        chainName: chain?.chainName,
        nativeCurrency: chain?.nativeCurrency,
        rpcUrls: Array.isArray(chain?.rpcUrls) ? chain.rpcUrls : [],
        blockExplorerUrls: Array.isArray(chain?.blockExplorerUrls) ? chain.blockExplorerUrls : [],
      }],
    });

    await provider.request?.({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });

    return chainId;
  }

  // 查询状态
  async function getWalletState(providerKey: unknown): Promise<WalletBridgeResult> {
    const provider = await pickProvider(providerKey);
    if (!provider) {
      return {
        ok: true,
        hasProvider: false,
        connected: false,
        walletLabel: '未检测到钱包',
        accounts: [],
        account: null,
        chainId: null,
      };
    }

    const accounts = await getProviderAccounts(provider);
    const chainId = normalizeChainId(await provider.request?.({ method: 'eth_chainId' }).catch(() => null));

    return {
      ok: true,
      hasProvider: true,
      connected: accounts.length > 0,
      walletLabel: getProviderLabel(provider),
      accounts,
      account: accounts[0] || null,
      chainId,
    };
  }

  // 连接钱包
  async function connectWallet(providerKey: unknown): Promise<WalletBridgeResult> {
    const provider = await pickProvider(providerKey);
    if (!provider) throw new Error('当前网页没有注入 EVM 钱包，请打开安装了钱包扩展的普通网页');

    const accounts = await provider.request?.({ method: 'eth_requestAccounts' });
    const normalizedAccounts = Array.isArray(accounts) ? accounts.filter((item) => typeof item === 'string') : [];
    const chainId = normalizeChainId(await provider.request?.({ method: 'eth_chainId' }).catch(() => null));

    return {
      ok: true,
      hasProvider: true,
      connected: normalizedAccounts.length > 0,
      walletLabel: getProviderLabel(provider),
      accounts: normalizedAccounts,
      account: normalizedAccounts[0] || null,
      chainId,
    };
  }

  // 切目标链
  async function switchChain(providerKey: unknown, chain: Partial<EvmChainConfig> | undefined): Promise<WalletBridgeResult> {
    const provider = await pickProvider(providerKey);
    if (!provider) throw new Error('当前网页没有可用的钱包 provider');

    const targetChainId = await switchOrAddChain(provider, chain);
    const chainId = await waitForChain(provider, targetChainId).catch(() => targetChainId);
    const accounts = await getProviderAccounts(provider);

    return {
      ok: true,
      hasProvider: true,
      connected: accounts.length > 0,
      walletLabel: getProviderLabel(provider),
      accounts,
      account: accounts[0] || null,
      chainId,
    };
  }

  return Promise.resolve()
    .then(() => {
      if (action === 'state') return getWalletState(payload.providerKey);
      if (action === 'connect') return connectWallet(payload.providerKey);
      if (action === 'switch_chain') return switchChain(payload.providerKey, payload.chain as Partial<EvmChainConfig>);
      throw new Error('不支持的钱包操作');
    })
    .catch((error) => ({
      ok: false,
      error: getErrorMessage(error),
    }));
}

// 建控制器
export function createWalletController(options: WalletControllerOptions) {
  const { browser, runWalletAction } = options;

  // 当前标签
  async function getActiveTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!Number.isFinite(tab?.id)) throw new Error('未找到当前活动标签页');
    if (!isWebUrl(tab.url)) throw new Error('请先切换到一个普通网页标签页，再使用钱包');
    return tab as WalletTab & { id: number };
  }

  // 执行桥接
  async function executeWalletAction(action: string, payload: Record<string, unknown> = {}) {
    if (runWalletAction) return runWalletAction(action, payload);

    const tab = await getActiveTab();
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: walletBridge,
      args: [action, payload],
    });
    const result = injection?.result;

    if (!result?.ok) throw new Error(result?.error || '钱包调用失败');

    return {
      ...result,
      tabId: tab.id,
      tabTitle: tab.title || '',
      tabUrl: tab.url || '',
    };
  }

  // 查状态
  function getWalletState(providerKey: unknown = 'auto') {
    return executeWalletAction('state', {
      providerKey: normalizeWalletProviderKey(providerKey),
    });
  }

  // 连钱包
  function connectWallet(providerKey: unknown = 'auto') {
    return executeWalletAction('connect', {
      providerKey: normalizeWalletProviderKey(providerKey),
    });
  }

  // 切目标链
  function switchToXLayer(providerKey: unknown = 'auto') {
    return executeWalletAction('switch_chain', {
      providerKey: normalizeWalletProviderKey(providerKey),
      chain: XLAYER_MAINNET,
    });
  }

  return {
    connectWallet,
    getWalletState,
    switchToXLayer,
  };
}
