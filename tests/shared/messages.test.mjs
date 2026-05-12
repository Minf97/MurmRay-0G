import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYSIS_MESSAGE_TYPES,
  AUTH_MESSAGE_TYPES,
  CORE_MESSAGE_TYPES,
  createCorePong,
  GHOST_MESSAGE_TYPES,
  isKnownMessageType,
  isCoreMessageType,
  PAGE_MESSAGE_TYPES,
} from '../../src/shared/messages';

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

  assert.deepEqual(GHOST_MESSAGE_TYPES, {
    getState: 'ghost:get_state',
    setState: 'ghost:set_state',
    getTabState: 'ghost:get_tab_state',
    analyzePage: 'ghost:analyze_page',
    openSidepanel: 'ghost:open_sidepanel',
    modeChanged: 'ghost:mode_changed',
    stateUpdated: 'ghost:state_updated',
  });

  assert.deepEqual(AUTH_MESSAGE_TYPES, {
    getUser: 'auth:me',
    googleSignIn: 'auth:google_sign_in',
    logout: 'auth:logout',
    stateChanged: 'auth:state_changed',
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
  assert.equal(isKnownMessageType(GHOST_MESSAGE_TYPES.stateUpdated), true);
  assert.equal(isKnownMessageType(AUTH_MESSAGE_TYPES.stateChanged), true);
  assert.equal(isKnownMessageType('unknown:type'), false);
});
