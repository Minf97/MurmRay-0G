// 基础消息
export const CORE_MESSAGE_TYPES = Object.freeze({
  ping: 'core:ping',
  pong: 'core:pong',
  contentReady: 'core:content_ready',
  sidepanelReady: 'core:sidepanel_ready',
} as const);

// 页面消息
export const PAGE_MESSAGE_TYPES = Object.freeze({
  extract: 'page:extract',
} as const);

// 分析消息
export const ANALYSIS_MESSAGE_TYPES = Object.freeze({
  analyzePage: 'analysis:analyze_page',
} as const);

export type CoreMessageType = typeof CORE_MESSAGE_TYPES[keyof typeof CORE_MESSAGE_TYPES];
export type PageMessageType = typeof PAGE_MESSAGE_TYPES[keyof typeof PAGE_MESSAGE_TYPES];
export type AnalysisMessageType = typeof ANALYSIS_MESSAGE_TYPES[keyof typeof ANALYSIS_MESSAGE_TYPES];

type KnownMessageType = CoreMessageType | PageMessageType | AnalysisMessageType;

const KNOWN_MESSAGE_TYPE_SET = new Set<KnownMessageType>([
  ...Object.values(CORE_MESSAGE_TYPES),
  ...Object.values(PAGE_MESSAGE_TYPES),
  ...Object.values(ANALYSIS_MESSAGE_TYPES),
]);

// 创建回包
export function createCorePong() {
  return {
    ok: true,
    type: CORE_MESSAGE_TYPES.pong,
  };
}

// 判定消息
export function isCoreMessageType(value: unknown): value is CoreMessageType {
  return typeof value === 'string' && Object.values(CORE_MESSAGE_TYPES).includes(value as CoreMessageType);
}

// 判定总类
export function isKnownMessageType(value: unknown): value is KnownMessageType {
  return typeof value === 'string' && KNOWN_MESSAGE_TYPE_SET.has(value as KnownMessageType);
}
