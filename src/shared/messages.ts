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

// 幽灵消息
export const GHOST_MESSAGE_TYPES = Object.freeze({
  getState: 'ghost:get_state',
  setState: 'ghost:set_state',
  getTabState: 'ghost:get_tab_state',
  analyzePage: 'ghost:analyze_page',
  openSidepanel: 'ghost:open_sidepanel',
  modeChanged: 'ghost:mode_changed',
  stateUpdated: 'ghost:state_updated',
} as const);

// 认证消息
export const AUTH_MESSAGE_TYPES = Object.freeze({
  getUser: 'auth:me',
  googleSignIn: 'auth:google_sign_in',
  logout: 'auth:logout',
  stateChanged: 'auth:state_changed',
} as const);

// 会员消息
export const MEMBERSHIP_MESSAGE_TYPES = Object.freeze({
  getStatus: 'membership:get_status',
  getCatalog: 'membership:get_catalog',
  createOrder: 'membership:create_order',
  confirmOrder: 'membership:confirm_order',
} as const);

// 次卡消息
export const USAGE_PACK_MESSAGE_TYPES = Object.freeze({
  createOrder: 'usage_pack:create_order',
  confirmOrder: 'usage_pack:confirm_order',
} as const);

// 钱包消息
export const WALLET_MESSAGE_TYPES = Object.freeze({
  getState: 'wallet:get_state',
  connect: 'wallet:connect',
  switchXLayer: 'wallet:switch_xlayer',
  sendPayment: 'wallet:send_payment',
} as const);

// 持仓消息
export const POLYMARKET_MESSAGE_TYPES = Object.freeze({
  getPortfolio: 'polymarket:get_portfolio',
} as const);

export type CoreMessageType = typeof CORE_MESSAGE_TYPES[keyof typeof CORE_MESSAGE_TYPES];
export type PageMessageType = typeof PAGE_MESSAGE_TYPES[keyof typeof PAGE_MESSAGE_TYPES];
export type AnalysisMessageType = typeof ANALYSIS_MESSAGE_TYPES[keyof typeof ANALYSIS_MESSAGE_TYPES];
export type GhostMessageType = typeof GHOST_MESSAGE_TYPES[keyof typeof GHOST_MESSAGE_TYPES];
export type AuthMessageType = typeof AUTH_MESSAGE_TYPES[keyof typeof AUTH_MESSAGE_TYPES];
export type MembershipMessageType = typeof MEMBERSHIP_MESSAGE_TYPES[keyof typeof MEMBERSHIP_MESSAGE_TYPES];
export type UsagePackMessageType = typeof USAGE_PACK_MESSAGE_TYPES[keyof typeof USAGE_PACK_MESSAGE_TYPES];
export type WalletMessageType = typeof WALLET_MESSAGE_TYPES[keyof typeof WALLET_MESSAGE_TYPES];
export type PolymarketMessageType = typeof POLYMARKET_MESSAGE_TYPES[keyof typeof POLYMARKET_MESSAGE_TYPES];

type KnownMessageType = CoreMessageType | PageMessageType | AnalysisMessageType | GhostMessageType | AuthMessageType | MembershipMessageType | UsagePackMessageType | WalletMessageType | PolymarketMessageType;

const KNOWN_MESSAGE_TYPE_SET = new Set<KnownMessageType>([
  ...Object.values(CORE_MESSAGE_TYPES),
  ...Object.values(PAGE_MESSAGE_TYPES),
  ...Object.values(ANALYSIS_MESSAGE_TYPES),
  ...Object.values(GHOST_MESSAGE_TYPES),
  ...Object.values(AUTH_MESSAGE_TYPES),
  ...Object.values(MEMBERSHIP_MESSAGE_TYPES),
  ...Object.values(USAGE_PACK_MESSAGE_TYPES),
  ...Object.values(WALLET_MESSAGE_TYPES),
  ...Object.values(POLYMARKET_MESSAGE_TYPES),
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
