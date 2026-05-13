import test from 'node:test';
import assert from 'node:assert/strict';
import {
  XLAYER_MAINNET,
  getChainDisplay,
  getXLayerNetwork,
  isXLayerChain,
  normalizeChainId,
} from '../../src/shared/chains';

test('chain id normalizes decimal and hex values', () => {
  assert.equal(normalizeChainId(196), '0xc4');
  assert.equal(normalizeChainId('196'), '0xc4');
  assert.equal(normalizeChainId('0x00C4'), '0xc4');
  assert.equal(normalizeChainId(''), null);
  assert.equal(normalizeChainId('abc'), null);
});

test('chain display recognizes x layer and unknown evm chains', () => {
  assert.equal(getXLayerNetwork('mainnet').chainId, XLAYER_MAINNET.chainId);
  assert.equal(getChainDisplay('0xc4').name, 'X Layer Mainnet');
  assert.equal(getChainDisplay('0x123').name, 'EVM 网络 0x123');
  assert.equal(isXLayerChain('196'), true);
  assert.equal(isXLayerChain('0x1'), false);
});
