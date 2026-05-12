export type AuthUser = {
  id: string;
  email: string;
  profile: { name: string };
  metadata: unknown | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type OAuthCallbackParams = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  accessToken: string | null;
  userId: string | null;
  email: string | null;
  name: string | null;
};

type UnknownRecord = Record<string, unknown>;

// 安全复制
function safeClone<T>(value: T): T | null {
  if (value == null) return null;

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

// 取字符串
function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

// 判定对象
function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null;
}

// 规范用户
export function normalizeAuthUser(user: unknown, nowIso = () => new Date().toISOString()): AuthUser | null {
  const record = asRecord(user);
  if (!record) return null;

  const nestedUser = asRecord(record.user);
  const profile = asRecord(record.profile);
  const userMetadata = asRecord(record.user_metadata);
  const metadata = asRecord(record.metadata);
  const email = pickString(record.email, nestedUser?.email);
  const name = pickString(profile?.name, userMetadata?.name, metadata?.name);
  const id = pickString(record.id, record.userId, record.sub, email);

  if (!id) return null;

  return {
    ...(safeClone(record) || {}),
    id,
    email,
    profile: { name },
    metadata: null,
    emailVerified: Boolean(record.emailVerified ?? record.email_verified ?? true),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : nowIso(),
    updatedAt: nowIso(),
  };
}

// 解 Base64
function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? `${normalized}${'='.repeat(4 - padding)}` : normalized;

  return atob(padded);
}

// 解令牌
export function decodeJwtPayload(token: string): UnknownRecord | null {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(decodeBase64Url(parts[1])) as UnknownRecord;
  } catch {
    return null;
  }
}

// 判定过期
export function isTokenExpired(token: string | null | undefined, nowMs = () => Date.now()) {
  const payload = decodeJwtPayload(String(token || ''));
  const exp = typeof payload?.exp === 'number' ? payload.exp : Number(payload?.exp || 0);

  if (!Number.isFinite(exp) || exp <= 0) return false;
  return nowMs() >= exp * 1000;
}

// 令牌用户
export function createFallbackUserFromToken(token: string, nowIso = () => new Date().toISOString()) {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const email = pickString(payload.email);
  const name = pickString(payload.name, payload.full_name);
  const id = pickString(payload.sub, email);

  return normalizeAuthUser({
    id,
    email,
    profile: { name },
    metadata: null,
    emailVerified: Boolean(payload.email_verified ?? true),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }, nowIso);
}

// 判定用户
export function hasUsableUser(user: unknown): user is AuthUser {
  const normalized = normalizeAuthUser(user);
  return Boolean(normalized?.id);
}

// 解析回调
export function getOAuthCallbackParams(callbackUrl: string): OAuthCallbackParams {
  const url = new URL(callbackUrl);
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const pick = (key: string) => url.searchParams.get(key) || hashParams.get(key) || null;

  return {
    code: pick('insforge_code'),
    error: pick('error'),
    errorDescription: pick('error_description'),
    accessToken: pick('access_token'),
    userId: pick('user_id'),
    email: pick('email'),
    name: pick('name'),
  };
}

// 旧版用户
export function createLegacyUserFromCallback(callback: OAuthCallbackParams, nowIso = () => new Date().toISOString()) {
  return normalizeAuthUser({
    id: callback.userId,
    email: callback.email,
    profile: { name: callback.name || '' },
    metadata: null,
    emailVerified: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }, nowIso);
}

// 认证失败
export function isAuthFailure(error: unknown) {
  const record = asRecord(error);
  const statusCode = Number(record?.statusCode ?? record?.status ?? 0);
  const message = error instanceof Error ? error.message : String(error || '');

  return statusCode === 401
    || statusCode === 403
    || /invalid token|expired|unauthorized|forbidden|refresh token|session/i.test(message);
}

// 谷歌报错
export function normalizeGoogleAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (/cancel|closed|abort|denied|did not approve/i.test(message)) {
    return '已取消 Google 登录';
  }

  return message ? `Google 登录失败: ${message}` : 'Google 登录失败，请稍后重试';
}
