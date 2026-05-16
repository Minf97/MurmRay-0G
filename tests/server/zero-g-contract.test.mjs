import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { id } from 'ethers';
import {
  SIGNAL_REGISTERED_TOPIC,
  SIGNAL_REGISTRY_ABI,
} from '../../server/services/zero-g/chain';

const PROJECT_ROOT = new URL('../../', import.meta.url);

test('zero-g registry contract matches server ABI', async () => {
  const source = await readFile(
    new URL('contracts/zero-g/MurmRaySignalRegistry.sol', PROJECT_ROOT),
    'utf8',
  );

  assert.match(source, /contract MurmRaySignalRegistry/);
  assert.match(source, /function registerSignal\(bytes32 signalHash, string calldata storageUri\) external/);
  assert.match(source, /event SignalRegistered\(bytes32 indexed signalHash, string storageUri, address indexed submitter\);/);
  assert.ok(SIGNAL_REGISTRY_ABI.includes('function registerSignal(bytes32 signalHash,string storageUri) external'));
  assert.ok(SIGNAL_REGISTRY_ABI.includes('event SignalRegistered(bytes32 indexed signalHash,string storageUri,address indexed submitter)'));
  assert.equal(SIGNAL_REGISTERED_TOPIC, id('SignalRegistered(bytes32,string,address)'));
});

test('zero-g registry contract rejects invalid duplicate anchors', async () => {
  const source = await readFile(
    new URL('contracts/zero-g/MurmRaySignalRegistry.sol', PROJECT_ROOT),
    'utf8',
  );

  assert.match(source, /error InvalidSignalHash\(\);/);
  assert.match(source, /error EmptyStorageUri\(\);/);
  assert.match(source, /error SignalAlreadyRegistered\(bytes32 signalHash\);/);
  assert.match(source, /revert SignalAlreadyRegistered\(signalHash\);/);
});
