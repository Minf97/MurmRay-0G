import { XLAYER_MAINNET, type EvmChainConfig } from '../shared/chains';
import { MURMRAY_PAYMENT_CONFIG } from '../shared/membership';
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

type WalletPaymentResult = {
  ok: true;
  walletLabel: string;
  account: string;
  chainId: string | null;
  txHash: unknown;
  approvalTxHash?: unknown;
};

type WalletBridgeResult = (WalletState & { ok: true }) | WalletPaymentResult | { ok: false; error: string };

type WalletControllerOptions = {
  browser: WalletBrowser;
  runWalletAction?: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;
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

  const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

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

  // 规范十六
  function normalizeHexValue(value: unknown) {
    if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) return null;
    const normalized = value.toLowerCase().replace(/^0x/, '').replace(/^0+/, '');
    return `0x${normalized || '0'}`;
  }

  // 补齐字长
  function padHex32(value: unknown) {
    const normalized = normalizeHexValue(value);
    if (!normalized) throw new Error('十六进制参数格式不正确');
    return normalized.slice(2).padStart(64, '0');
  }

  // 编码地址
  function encodeAddressArgument(address: unknown) {
    const normalized = String(address || '').trim();
    if (!ADDRESS_PATTERN.test(normalized)) throw new Error('地址格式不正确');
    return normalized.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  }

  // 读数值
  function decodeUint256Result(result: unknown) {
    const normalized = normalizeHexValue(result);
    if (!normalized) return 0n;

    try {
      return BigInt(normalized);
    } catch {
      return 0n;
    }
  }

  // UTF8转码
  function utf8ToHex(value: unknown) {
    const bytes = new TextEncoder().encode(String(value || ''));
    return Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('');
  }

  // 右补字长
  function padHexToWord(hexBody: string) {
    if (!hexBody) return '';
    const remainder = hexBody.length % 64;
    return remainder === 0 ? hexBody : hexBody.padEnd(hexBody.length + (64 - remainder), '0');
  }

  // 编码授权
  function encodeErc20ApproveData(spender: unknown, amountHex: unknown) {
    return `0x095ea7b3${encodeAddressArgument(spender)}${padHex32(amountHex)}`;
  }

  // 编码额度
  function encodeErc20AllowanceData(owner: unknown, spender: unknown) {
    return `0xdd62ed3e${encodeAddressArgument(owner)}${encodeAddressArgument(spender)}`;
  }

  // 编码余额
  function encodeErc20BalanceOfData(owner: unknown) {
    return `0x70a08231${encodeAddressArgument(owner)}`;
  }

  // 编码付款
  function encodePaymentContractData(orderId: unknown, amountHex: unknown) {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) throw new Error('链上订单标识不能为空');

    const orderHex = utf8ToHex(normalizedOrderId);
    const orderLengthHex = padHex32(`0x${new TextEncoder().encode(normalizedOrderId).length.toString(16)}`);
    return `0x901c5953${padHex32('0x40')}${padHex32(amountHex)}${orderLengthHex}${padHexToWord(orderHex)}`;
  }

  // 读合约
  async function readContract(provider: WalletProvider, to: unknown, data: string, from?: unknown) {
    return provider.request?.({
      method: 'eth_call',
      params: [{
        to: String(to).trim(),
        data,
        ...(from ? { from: String(from).trim() } : {}),
      }, 'latest'],
    });
  }

  // 等待回执
  async function waitForTransactionReceipt(provider: WalletProvider, txHash: unknown, attempts = 40, waitMs = 1500) {
    for (let index = 0; index < attempts; index += 1) {
      const receipt = await provider.request?.({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }).catch(() => null) as { blockNumber?: unknown; status?: unknown } | null;

      if (receipt?.blockNumber) {
        const status = typeof receipt.status === 'string' ? receipt.status.toLowerCase() : receipt.status;
        if (status === '0x0' || status === 0) {
          throw new Error('链上交易执行失败，请在区块浏览器中查看详情');
        }
        return receipt;
      }

      if (index < attempts - 1) await delay(waitMs);
    }

    throw new Error('等待交易确认超时，请稍后在区块浏览器中确认交易状态');
  }

  // 读授权额
  async function readErc20Allowance(provider: WalletProvider, tokenAddress: unknown, owner: unknown, spender: unknown) {
    const result = await readContract(provider, tokenAddress, encodeErc20AllowanceData(owner, spender));
    return decodeUint256Result(result);
  }

  // 读余额
  async function readErc20Balance(provider: WalletProvider, tokenAddress: unknown, owner: unknown) {
    const result = await readContract(provider, tokenAddress, encodeErc20BalanceOfData(owner));
    return decodeUint256Result(result);
  }

  // 保证授权
  async function ensureErc20Allowance({
    provider,
    account,
    tokenAddress,
    spender,
    amountHex,
  }: {
    provider: WalletProvider;
    account: string;
    tokenAddress: unknown;
    spender: unknown;
    amountHex: unknown;
  }) {
    const requiredAmount = decodeUint256Result(amountHex);
    let currentAllowance = 0n;

    try {
      currentAllowance = await readErc20Allowance(provider, tokenAddress, account, spender);
    } catch {
      currentAllowance = 0n;
    }

    if (currentAllowance >= requiredAmount) return null;

    if (currentAllowance > 0n) {
      const resetTxHash = await provider.request?.({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: String(tokenAddress).trim(),
          value: '0x0',
          data: encodeErc20ApproveData(spender, '0x0'),
        }],
      });
      await waitForTransactionReceipt(provider, resetTxHash);
    }

    const approveTxHash = await provider.request?.({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        to: String(tokenAddress).trim(),
        value: '0x0',
        data: encodeErc20ApproveData(spender, amountHex),
      }],
    });

    await waitForTransactionReceipt(provider, approveTxHash);
    return approveTxHash;
  }

  // 编码转账
  function encodeErc20TransferData(to: unknown, amountHex: unknown) {
    const normalizedAddress = String(to || '').trim().toLowerCase().replace(/^0x/, '');
    const normalizedAmount = String(amountHex || '').trim().toLowerCase().replace(/^0x/, '');
    if (!ADDRESS_PATTERN.test(`0x${normalizedAddress}`)) throw new Error('收款地址格式不正确');
    return `0xa9059cbb${normalizedAddress.padStart(64, '0')}${normalizedAmount.padStart(64, '0')}`;
  }

  // 原生支付
  async function sendNativePayment(payload: Record<string, unknown>) {
    const provider = await pickProvider(payload.providerKey);
    if (!provider) throw new Error('当前网页没有可用的钱包 provider');

    const to = String(payload.to || '').trim();
    if (!ADDRESS_PATTERN.test(to)) throw new Error('收款地址格式不正确');

    const normalizedValueHex = normalizeHexValue(payload.valueHex);
    if (!normalizedValueHex) throw new Error('支付金额格式不正确');

    const chain = payload.chain as Partial<EvmChainConfig> | undefined;
    if (payload.ensureChain && chain?.chainId) {
      const targetChainId = await switchOrAddChain(provider, chain);
      await waitForChain(provider, targetChainId);
    }

    const accounts = await provider.request?.({ method: 'eth_requestAccounts' });
    const normalizedAccounts = Array.isArray(accounts) ? accounts.filter((item) => typeof item === 'string') : [];
    if (!normalizedAccounts.length) throw new Error('钱包未返回可用账户');

    const chainId = normalizeChainId(await provider.request?.({ method: 'eth_chainId' }).catch(() => normalizeChainId(chain?.chainId)));
    const txHash = await provider.request?.({
      method: 'eth_sendTransaction',
      params: [{
        from: normalizedAccounts[0],
        to,
        value: normalizedValueHex,
      }],
    });

    return {
      ok: true,
      walletLabel: getProviderLabel(provider),
      account: normalizedAccounts[0],
      chainId,
      txHash,
    };
  }

  // 代币支付
  async function sendErc20Payment(payload: Record<string, unknown>) {
    const provider = await pickProvider(payload.providerKey);
    if (!provider) throw new Error('当前网页没有可用的钱包 provider');

    const to = String(payload.to || '').trim();
    const tokenAddress = String(payload.tokenAddress || '').trim();
    if (!ADDRESS_PATTERN.test(to)) throw new Error('收款地址格式不正确');
    if (!ADDRESS_PATTERN.test(tokenAddress)) throw new Error('代币合约地址格式不正确');

    const normalizedAmountHex = normalizeHexValue(payload.tokenAmountHex);
    if (!normalizedAmountHex || normalizedAmountHex === '0x0') throw new Error('代币金额格式不正确');

    const chain = payload.chain as Partial<EvmChainConfig> | undefined;
    if (payload.ensureChain && chain?.chainId) {
      const targetChainId = await switchOrAddChain(provider, chain);
      await waitForChain(provider, targetChainId);
    }

    const accounts = await provider.request?.({ method: 'eth_requestAccounts' });
    const normalizedAccounts = Array.isArray(accounts) ? accounts.filter((item) => typeof item === 'string') : [];
    if (!normalizedAccounts.length) throw new Error('钱包未返回可用账户');

    const balance = await readErc20Balance(provider, tokenAddress, normalizedAccounts[0]).catch(() => null);
    if (balance !== null && balance < decodeUint256Result(normalizedAmountHex)) {
      throw new Error('代币余额不足');
    }

    const chainId = normalizeChainId(await provider.request?.({ method: 'eth_chainId' }).catch(() => normalizeChainId(chain?.chainId)));
    const txHash = await provider.request?.({
      method: 'eth_sendTransaction',
      params: [{
        from: normalizedAccounts[0],
        to: tokenAddress,
        value: '0x0',
        data: encodeErc20TransferData(to, normalizedAmountHex),
      }],
    });

    return {
      ok: true,
      walletLabel: getProviderLabel(provider),
      account: normalizedAccounts[0],
      chainId,
      txHash,
    };
  }

  // 合约支付
  async function sendContractPayment(payload: Record<string, unknown>) {
    const provider = await pickProvider(payload.providerKey);
    if (!provider) throw new Error('当前网页没有可用的钱包 provider');

    const to = String(payload.to || '').trim();
    const tokenAddress = String(payload.tokenAddress || '').trim();
    if (!ADDRESS_PATTERN.test(to)) throw new Error('支付合约地址格式不正确');
    if (!ADDRESS_PATTERN.test(tokenAddress)) throw new Error('代币合约地址格式不正确');

    const normalizedAmountHex = normalizeHexValue(payload.tokenAmountHex);
    if (!normalizedAmountHex || normalizedAmountHex === '0x0') throw new Error('代币金额格式不正确');
    if (!String(payload.orderId || '').trim()) throw new Error('缺少链上订单信息');

    const chain = payload.chain as Partial<EvmChainConfig> | undefined;
    if (payload.ensureChain && chain?.chainId) {
      const targetChainId = await switchOrAddChain(provider, chain);
      await waitForChain(provider, targetChainId);
    }

    const accounts = await provider.request?.({ method: 'eth_requestAccounts' });
    const normalizedAccounts = Array.isArray(accounts) ? accounts.filter((item) => typeof item === 'string') : [];
    if (!normalizedAccounts.length) throw new Error('钱包未返回可用账户');
    const account = normalizedAccounts[0];

    const balance = await readErc20Balance(provider, tokenAddress, account).catch(() => null);
    if (balance !== null && balance < decodeUint256Result(normalizedAmountHex)) {
      throw new Error('代币余额不足');
    }

    const approvalTxHash = await ensureErc20Allowance({
      provider,
      account,
      tokenAddress,
      spender: to,
      amountHex: normalizedAmountHex,
    });
    const chainId = normalizeChainId(await provider.request?.({ method: 'eth_chainId' }).catch(() => normalizeChainId(chain?.chainId)));
    const txHash = await provider.request?.({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        to,
        value: '0x0',
        data: encodePaymentContractData(payload.orderId, normalizedAmountHex),
      }],
    });

    return {
      ok: true,
      walletLabel: getProviderLabel(provider),
      account,
      chainId,
      txHash,
      approvalTxHash,
    };
  }

  return Promise.resolve()
    .then(() => {
      if (action === 'state') return getWalletState(payload.providerKey);
      if (action === 'connect') return connectWallet(payload.providerKey);
      if (action === 'switch_chain') return switchChain(payload.providerKey, payload.chain as Partial<EvmChainConfig>);
      if (action === 'send_native_payment') return sendNativePayment(payload);
      if (action === 'send_erc20_payment') return sendErc20Payment(payload);
      if (action === 'send_contract_payment') return sendContractPayment(payload);
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

  // 发原生款
  function sendEvmNativePayment({
    providerKey = 'auto',
    to,
    valueHex,
  }: {
    providerKey?: unknown;
    to?: unknown;
    valueHex?: unknown;
  }) {
    return executeWalletAction('send_native_payment', {
      providerKey: normalizeWalletProviderKey(providerKey),
      to,
      valueHex,
      ensureChain: false,
    });
  }

  // 发链上款
  function sendXLayerPayment({
    providerKey = 'auto',
    to,
    valueHex,
    tokenAddress,
    tokenAmountHex,
    orderId,
    tokenDecimals,
    tokenSymbol,
  }: {
    providerKey?: unknown;
    to?: unknown;
    valueHex?: unknown;
    tokenAddress?: unknown;
    tokenAmountHex?: unknown;
    orderId?: unknown;
    tokenDecimals?: unknown;
    tokenSymbol?: unknown;
  }) {
    const action = tokenAddress && tokenAmountHex && orderId
      ? 'send_contract_payment'
      : tokenAddress && tokenAmountHex
        ? 'send_erc20_payment'
        : 'send_native_payment';

    return executeWalletAction(action, {
      providerKey: normalizeWalletProviderKey(providerKey),
      to,
      valueHex,
      tokenAddress,
      tokenAmountHex,
      orderId,
      tokenDecimals,
      tokenSymbol,
      ensureChain: true,
      chain: MURMRAY_PAYMENT_CONFIG,
    });
  }

  return {
    connectWallet,
    getWalletState,
    sendEvmNativePayment,
    sendXLayerPayment,
    switchToXLayer,
  };
}
