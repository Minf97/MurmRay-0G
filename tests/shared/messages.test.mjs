import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYSIS_MESSAGE_TYPES,
  CORE_MESSAGE_TYPES,
  createCorePong,
  isKnownMessageType,
  isCoreMessageType,
  PAGE_MESSAGE_TYPES,
} from '../../src/shared/messages.ts';

test('message constants expose baseline channels', () => {
  assert.deepEqual(CORE_MESSAGE_TYPES, {
    ping: 'core:ping',
    pong: 'core:pong',
    contentReady: 'core:content_ready',
    sidepanelReady: 'core:sidepanel_ready',
  });
});

test('message constants expose app channels', () => {
  assert.deepEqual(PAGE_MESSAGE_TYPES, {
    extract: 'page:extract',
  });

  assert.deepEqual(ANALYSIS_MESSAGE_TYPES, {
    analyzePage: 'analysis:analyze_page',
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

test('isKnownMessageType validates all values', () => {
  assert.equal(isKnownMessageType(PAGE_MESSAGE_TYPES.extract), true);
  assert.equal(isKnownMessageType(ANALYSIS_MESSAGE_TYPES.analyzePage), true);
  assert.equal(isKnownMessageType('unknown:type'), false);
});
