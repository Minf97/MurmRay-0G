export type EvmChainConfig = {
  id: number;
  chainId: string;
  chainName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
  txExplorerBaseUrl: string;
};

export const XLAYER_MAINNET: EvmChainConfig = {
  id: 196,
  chainId: '0xc4',
  chainName: 'X Layer Mainnet',
  nativeCurrency: {
    name: 'OKB',
    symbol: 'OKB',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
  blockExplorerUrls: ['https://www.okx.com/web3/explorer/xlayer'],
  txExplorerBaseUrl: 'https://www.okx.com/web3/explorer/xlayer/tx/',
};

export const XLAYER_TESTNET: EvmChainConfig = {
  id: 1952,
  chainId: '0x7a0',
  chainName: 'X Layer Testnet',
  nativeCurrency: {
    name: 'OKB',
    symbol: 'OKB',
    decimals: 18,
  },
  rpcUrls: ['https://testrpc.xlayer.tech/terigon', 'https://xlayertestrpc.okx.com/terigon'],
  blockExplorerUrls: ['https://www.okx.com/web3/explorer/xlayer-test'],
  txExplorerBaseUrl: 'https://www.okx.com/web3/explorer/xlayer-test/tx/',
};

export const XLAYER_NETWORKS = Object.freeze({
  mainnet: XLAYER_MAINNET,
  testnet: XLAYER_TESTNET,
});

export const KNOWN_EVM_CHAINS = Object.freeze({
  '0x1': {
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    txExplorerBaseUrl: 'https://etherscan.io/tx/',
  },
  '0xaa36a7': {
    name: 'Sepolia',
    symbol: 'ETH',
    txExplorerBaseUrl: 'https://sepolia.etherscan.io/tx/',
  },
  '0x89': {
    name: 'Polygon',
    symbol: 'POL',
    txExplorerBaseUrl: 'https://polygonscan.com/tx/',
  },
  '0x38': {
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    txExplorerBaseUrl: 'https://bscscan.com/tx/',
  },
  '0x2105': {
    name: 'Base',
    symbol: 'ETH',
    txExplorerBaseUrl: 'https://basescan.org/tx/',
  },
  [XLAYER_MAINNET.chainId]: {
    name: XLAYER_MAINNET.chainName,
    symbol: XLAYER_MAINNET.nativeCurrency.symbol,
    txExplorerBaseUrl: XLAYER_MAINNET.txExplorerBaseUrl,
  },
  [XLAYER_TESTNET.chainId]: {
    name: XLAYER_TESTNET.chainName,
    symbol: XLAYER_TESTNET.nativeCurrency.symbol,
    txExplorerBaseUrl: XLAYER_TESTNET.txExplorerBaseUrl,
  },
});

// 标准链ID
export function normalizeChainId(chainId: unknown) {
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

  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? `0x${Math.trunc(value).toString(16)}` : null;
}

// 展示链名
export function getChainDisplay(chainId: unknown) {
  const normalizedChainId = normalizeChainId(chainId);
  if (!normalizedChainId) {
    return {
      name: '未识别网络',
      symbol: '原生币',
      txExplorerBaseUrl: '',
    };
  }

  return KNOWN_EVM_CHAINS[normalizedChainId as keyof typeof KNOWN_EVM_CHAINS] || {
    name: `EVM 网络 ${normalizedChainId}`,
    symbol: '原生币',
    txExplorerBaseUrl: '',
  };
}

// 取目标链
export function getXLayerNetwork(networkMode: keyof typeof XLAYER_NETWORKS = 'mainnet') {
  return XLAYER_NETWORKS[networkMode] || XLAYER_MAINNET;
}

// 判断目标链
export function isXLayerChain(chainId: unknown, networkMode: keyof typeof XLAYER_NETWORKS = 'mainnet') {
  return normalizeChainId(chainId) === getXLayerNetwork(networkMode).chainId;
}
