import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORE_MESSAGE_TYPES,
  createCorePong,
  isCoreMessageType,
} from '../../src/shared/messages.ts';

test('message constants expose baseline channels', () => {
  assert.deepEqual(CORE_MESSAGE_TYPES, {
    ping: 'core:ping',
    pong: 'core:pong',
    contentReady: 'core:content_ready',
    sidepanelReady: 'core:sidepanel_ready',
  });
});

test('createCorePong returns pong payload', () => {
  assert.deepEqual(createCorePong(), {
    ok: true,
    type: CORE_MESSAGE_TYPES.pong,
  });
});

test('isCoreMessageType validates known values', () => {
  assert.equal(isCoreMessageType(CORE_MESSAGE_TYPES.ping), true);
  assert.equal(isCoreMessageType(CORE_MESSAGE_TYPES.sidepanelReady), true);
  assert.equal(isCoreMessageType('ghost:ping'), false);
});
