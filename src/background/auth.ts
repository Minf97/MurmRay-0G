import { createClient } from '@insforge/sdk';
import { AUTH_REFRESH_TOKEN_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY, INSFORGE_ANON_KEY, INSFORGE_URL } from '../shared/config';
import { AUTH_MESSAGE_TYPES } from '../shared/messages';
import {
  createFallbackUserFromToken,
  createLegacyUserFromCallback,
  getOAuthCallbackParams,
  hasUsableUser,
  isAuthFailure,
  isTokenExpired,
  normalizeAuthUser,
  normalizeGoogleAuthError,
  type AuthUser,
} from '../shared/auth';

type StorageArea = {
  get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

type AuthBrowser = {
  storage: { local: StorageArea };
  runtime: { sendMessage: (message: unknown) => Promise<unknown> };
  identity?: {
    getRedirectURL: () => string;
    launchWebAuthFlow: (details: { url: string; interactive: boolean }) => Promise<string | undefined>;
  };
};

type AuthResponse<T> = Promise<{ data?: T | null; error?: { message?: string; status?: number; statusCode?: number } | null }>;
type AuthPayload = { accessToken?: string; refreshToken?: string; user?: unknown };
type OAuthInitPayload = { url?: string; codeVerifier?: string };

type AuthSdkClient = {
  auth: {
    signInWithOAuth: (options: { provider: 'google'; redirectTo: string; skipBrowserRedirect: true }) => AuthResponse<OAuthInitPayload>;
    exchangeOAuthCode: (code: string, codeVerifier: string) => AuthResponse<AuthPayload>;
    refreshSession: (options: { refreshToken: string }) => AuthResponse<AuthPayload>;
    signOut: () => AuthResponse<unknown>;
    getCurrentUser: () => AuthResponse<{ user?: unknown }>;
  };
};

type AuthControllerOptions = {
  browser: AuthBrowser;
  createAuthClient?: (accessToken?: string | null) => AuthSdkClient;
};

// 建认证端
function createDefaultAuthClient(accessToken: string | null = null): AuthSdkClient {
  return createClient({
    baseUrl: INSFORGE_URL,
    anonKey: INSFORGE_ANON_KEY,
    edgeFunctionToken: accessToken || undefined,
    autoRefreshToken: false,
    isServerMode: true,
  }) as unknown as AuthSdkClient;
}

// 建控制器
export function createAuthController(options: AuthControllerOptions) {
  const { browser, createAuthClient = createDefaultAuthClient } = options;
  const storage = browser.storage.local;

  // 读存储
  async function readStorageValue<T>(key: string) {
    const result = await storage.get(key);
    return result[key] as T | undefined;
  }

  // 读令牌
  async function getToken() {
    const token = await readStorageValue<string>(AUTH_TOKEN_STORAGE_KEY);
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  }

  // 读刷新令牌
  async function getRefreshToken() {
    const token = await readStorageValue<string>(AUTH_REFRESH_TOKEN_STORAGE_KEY);
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  }

  // 存用户
  async function setAuthUser(user: unknown) {
    const normalized = normalizeAuthUser(user);

    if (!normalized) {
      await storage.remove(AUTH_USER_STORAGE_KEY);
      return null;
    }

    await storage.set({ [AUTH_USER_STORAGE_KEY]: normalized });
    return normalized;
  }

  // 读用户
  async function getStoredUser() {
    const user = normalizeAuthUser(await readStorageValue(AUTH_USER_STORAGE_KEY));

    if (!user) {
      await storage.remove(AUTH_USER_STORAGE_KEY);
      return null;
    }

    return user;
  }

  // 广播认证
  async function broadcastAuthState(user: AuthUser | null) {
    try {
      await browser.runtime.sendMessage({
        type: AUTH_MESSAGE_TYPES.stateChanged,
        user,
      });
    } catch {
      // 忽略无人监听
    }
  }

  // 清理会话
  async function clearAuthSessionAndBroadcast() {
    await storage.remove([
      AUTH_TOKEN_STORAGE_KEY,
      AUTH_REFRESH_TOKEN_STORAGE_KEY,
      AUTH_USER_STORAGE_KEY,
    ]);
    await broadcastAuthState(null);
  }

  // 存刷新令牌
  async function persistRefreshToken(refreshToken: unknown) {
    if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
      return null;
    }

    const token = refreshToken.trim();
    await storage.set({ [AUTH_REFRESH_TOKEN_STORAGE_KEY]: token });
    return token;
  }

  // 存认证态
  async function persistAuthSession(accessToken: string, user: unknown) {
    await storage.set({ [AUTH_TOKEN_STORAGE_KEY]: accessToken });

    const storedUser = await setAuthUser(user);
    const fallbackUser = storedUser || createFallbackUserFromToken(accessToken);
    const nextUser = fallbackUser ? await setAuthUser(fallbackUser) : null;
    await broadcastAuthState(nextUser);

    return nextUser;
  }

  // 存回包
  async function persistAuthPayload(data: AuthPayload | null | undefined) {
    if (!data?.accessToken) return { user: null, refreshToken: null };

    const refreshToken = await persistRefreshToken(data.refreshToken);
    const user = await persistAuthSession(data.accessToken, data.user);

    return { user, refreshToken };
  }

  // 刷新令牌
  async function refreshAccessToken() {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const { data, error } = await createAuthClient().auth.refreshSession({ refreshToken });

    if (error || !data?.accessToken) {
      await clearAuthSessionAndBroadcast();
      return null;
    }

    const persisted = await persistAuthPayload(data);
    return {
      accessToken: data.accessToken,
      user: persisted.user || normalizeAuthUser(data.user),
    };
  }

  // 谷歌登录
  async function signInWithGoogle() {
    if (!browser.identity?.getRedirectURL || !browser.identity.launchWebAuthFlow) {
      throw new Error('Google 登录不可用：缺少 identity 权限');
    }

    const redirectTo = browser.identity.getRedirectURL();
    const client = createAuthClient();
    const { data: initData, error: initError } = await client.auth.signInWithOAuth({
      provider: 'google',
      redirectTo,
      skipBrowserRedirect: true,
    });

    if (initError) {
      throw new Error(`Google 登录初始化失败: ${initError.message}`);
    }

    if (!initData?.url || !initData.codeVerifier) {
      throw new Error('Google 登录初始化失败：未拿到授权地址');
    }

    let callbackUrl: string | undefined;
    try {
      callbackUrl = await browser.identity.launchWebAuthFlow({
        url: initData.url,
        interactive: true,
      });
    } catch (error) {
      throw new Error(normalizeGoogleAuthError(error));
    }

    if (!callbackUrl) {
      throw new Error('Google 登录失败：未收到回调地址');
    }

    const callback = getOAuthCallbackParams(callbackUrl);
    if (callback.error) {
      throw new Error(callback.errorDescription || 'Google 登录失败');
    }

    if (callback.code) {
      const { data, error } = await client.auth.exchangeOAuthCode(callback.code, initData.codeVerifier);
      if (error) throw new Error(`Google 登录失败: ${error.message}`);
      if (!data?.accessToken || !data.user) throw new Error('Google 登录失败：未获取到登录凭证');

      const persisted = await persistAuthPayload(data);
      return { user: persisted.user || normalizeAuthUser(data.user) };
    }

    if (callback.accessToken && callback.userId && callback.email) {
      const user = createLegacyUserFromCallback(callback);
      return { user: await persistAuthSession(callback.accessToken, user) };
    }

    throw new Error('Google 登录失败：未收到授权码');
  }

  // 退出登录
  async function logout() {
    const token = await getToken();
    const refreshToken = await getRefreshToken();

    if (token || refreshToken) {
      try {
        await createAuthClient(token).auth.signOut();
      } catch {
        // 忽略异常
      }
    }

    await clearAuthSessionAndBroadcast();
  }

  // 读取用户
  async function getUser() {
    let token = await getToken();
    if (!token) return null;

    if (isTokenExpired(token)) {
      const refreshed = await refreshAccessToken();
      if (!refreshed?.accessToken) return null;
      token = refreshed.accessToken;
      if (refreshed.user) return { user: refreshed.user };
    }

    const fallbackUser = await getStoredUser() || createFallbackUserFromToken(token);
    if (hasUsableUser(fallbackUser)) {
      return { user: await setAuthUser(fallbackUser) };
    }

    try {
      const { data, error } = await createAuthClient(token).auth.getCurrentUser();
      if (error || !hasUsableUser(data?.user)) {
        const refreshed = await refreshAccessToken();
        if (refreshed?.user) return { user: refreshed.user };

        if (isAuthFailure(error)) await clearAuthSessionAndBroadcast();
        return null;
      }

      return { user: await setAuthUser(data.user) };
    } catch (error) {
      const refreshed = await refreshAccessToken();
      if (refreshed?.user) return { user: refreshed.user };

      if (isAuthFailure(error)) await clearAuthSessionAndBroadcast();
      return null;
    }
  }

  return {
    getUser,
    signInWithGoogle,
    logout,
  };
}
