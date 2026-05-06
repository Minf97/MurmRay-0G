// 基础消息
export const CORE_MESSAGE_TYPES = Object.freeze({
  ping: 'core:ping',
  pong: 'core:pong',
  contentReady: 'core:content_ready',
  sidepanelReady: 'core:sidepanel_ready',
} as const);

export type CoreMessageType = typeof CORE_MESSAGE_TYPES[keyof typeof CORE_MESSAGE_TYPES];

const CORE_MESSAGE_TYPE_SET = new Set<CoreMessageType>(Object.values(CORE_MESSAGE_TYPES));

// 创建回包
export function createCorePong() {
  return {
    ok: true,
    type: CORE_MESSAGE_TYPES.pong,
  };
}

// 判定消息
export function isCoreMessageType(value: unknown): value is CoreMessageType {
  return typeof value === 'string' && CORE_MESSAGE_TYPE_SET.has(value as CoreMessageType);
}
