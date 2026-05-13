export type WalletProviderKey = 'auto' | 'metamask' | 'okx';

export type WalletState = {
  hasProvider: boolean;
  connected: boolean;
  walletLabel: string;
  accounts: string[];
  account: string | null;
  chainId: string | null;
  tabId?: number;
  tabTitle?: string;
  tabUrl?: string;
};

export const WALLET_PROVIDER_OPTIONS: Array<{ key: WalletProviderKey; label: string }> = [
  { key: 'auto', label: '自动' },
  { key: 'metamask', label: 'MetaMask' },
  { key: 'okx', label: 'OKX' },
];

// 规范来源
export function normalizeWalletProviderKey(value: unknown): WalletProviderKey {
  if (value === 'metamask' || value === 'okx') return value;
  return 'auto';
}

// 缩短地址
export function shortenWalletAddress(address: unknown) {
  const normalized = String(address || '').trim();
  if (!/^0x[a-f0-9]{40}$/i.test(normalized)) return '';
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}
