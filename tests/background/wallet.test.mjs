import test from 'node:test';
import assert from 'node:assert/strict';
import { walletBridge } from '../../src/background/wallet';
import { XLAYER_MAINNET } from '../../src/shared/chains';

const ACCOUNT = '0x1111111111111111111111111111111111111111';

function createProvider({
  accounts = [],
  chainId = '0x1',
  flags = {},
  failSwitchOnce = false,
  failSwitchCode = null,
  allowanceHex = '0x0',
  balanceHex = '0xffffffffffff',
} = {}) {
  const calls = [];
  let currentChainId = chainId;
  let missingChain = failSwitchOnce;

  return {
    calls,
    provider: {
      ...flags,
      async request({ method, params }) {
        calls.push({ method, params });

        if (method === 'eth_accounts') return accounts;
        if (method === 'eth_requestAccounts') return accounts.length ? accounts : [ACCOUNT];
        if (method === 'eth_chainId') return currentChainId;
        if (method === 'eth_call') {
          const data = String(params?.[0]?.data || '');
          if (data.startsWith('0xdd62ed3e')) return allowanceHex;
          if (data.startsWith('0x70a08231')) return balanceHex;
          return '0x0';
        }
        if (method === 'eth_sendTransaction') return `0xtx${calls.length}`;
        if (method === 'eth_getTransactionReceipt') return { blockNumber: '0x1', status: '0x1' };
        if (method === 'wallet_addEthereumChain') {
          currentChainId = params?.[0]?.chainId || currentChainId;
          return null;
        }
        if (method === 'wallet_switchEthereumChain') {
          if (failSwitchCode !== null) {
            const error = new Error('user rejected');
            error.code = failSwitchCode;
            throw error;
          }

          if (missingChain) {
            missingChain = false;
            const error = new Error('Unrecognized chain');
            error.code = 4902;
            throw error;
          }

          currentChainId = params?.[0]?.chainId || currentChainId;
          return null;
        }

        throw new Error(`unexpected method ${method}`);
      },
    },
  };
}

async function withWindow(windowValue, callback) {
  const previousWindow = globalThis.window;
  globalThis.window = windowValue;

  try {
    return await callback();
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
}

test('wallet bridge returns empty state without providers', async () => {
  const result = await withWindow({}, () => walletBridge('state', { providerKey: 'auto' }));

  assert.equal(result.ok, true);
  assert.equal(result.hasProvider, false);
  assert.equal(result.connected, false);
  assert.equal(result.walletLabel, '未检测到钱包');
});

test('wallet bridge auto picks connected metamask provider', async () => {
  const okx = createProvider({ accounts: [], flags: { isOKXWallet: true } });
  const metamask = createProvider({ accounts: [ACCOUNT], flags: { isMetaMask: true } });
  const ethereum = { providers: [okx.provider, metamask.provider] };

  const result = await withWindow({ ethereum }, () => walletBridge('state', { providerKey: 'auto' }));

  assert.equal(result.ok, true);
  assert.equal(result.walletLabel, 'MetaMask');
  assert.equal(result.account, ACCOUNT);
});

test('wallet bridge can add missing x layer before switching', async () => {
  const wallet = createProvider({
    accounts: [ACCOUNT],
    flags: { isOKXWallet: true },
    failSwitchOnce: true,
  });

  const result = await withWindow(
    { okxwallet: { ethereum: wallet.provider } },
    () => walletBridge('switch_chain', { providerKey: 'okx', chain: XLAYER_MAINNET }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.chainId, XLAYER_MAINNET.chainId);
  assert.deepEqual(wallet.calls.map((call) => call.method), [
    'wallet_switchEthereumChain',
    'wallet_addEthereumChain',
    'wallet_switchEthereumChain',
    'eth_chainId',
    'eth_accounts',
  ]);
});

test('wallet bridge surfaces switch rejection', async () => {
  const wallet = createProvider({
    accounts: [ACCOUNT],
    flags: { isMetaMask: true },
    failSwitchCode: 4001,
  });

  const result = await withWindow(
    { ethereum: wallet.provider },
    () => walletBridge('switch_chain', { providerKey: 'metamask', chain: XLAYER_MAINNET }),
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /user rejected/);
});

test('wallet bridge sends x layer erc20 contract payment', async () => {
  const wallet = createProvider({
    accounts: [ACCOUNT],
    chainId: XLAYER_MAINNET.chainId,
    flags: { isMetaMask: true },
  });

  const result = await withWindow(
    { ethereum: wallet.provider },
    () => walletBridge('send_contract_payment', {
      providerKey: 'metamask',
      to: '0x2222222222222222222222222222222222222222',
      tokenAddress: '0x3333333333333333333333333333333333333333',
      tokenAmountHex: '0x186a0',
      orderId: 'membership|Pro|5 USDT0|order-1',
      ensureChain: true,
      chain: XLAYER_MAINNET,
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.account, ACCOUNT);
  assert.equal(result.chainId, XLAYER_MAINNET.chainId);
  assert.equal(wallet.calls.some((call) => call.method === 'eth_call'), true);
  assert.equal(wallet.calls.filter((call) => call.method === 'eth_sendTransaction').length, 2);
});
