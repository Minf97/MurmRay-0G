import type { AuthUser } from '../../src/shared/auth';

export type AuthStatus = 'checking' | 'signed_out' | 'signed_in';

type AuthPanelProps = {
  status: AuthStatus;
  error: string;
  onGoogleLogin: () => void;
};

type UserProfileProps = {
  user: AuthUser;
  logoutBusy: boolean;
  onLogout: () => void;
};

// 用户首字
function getUserInitial(user: AuthUser | null) {
  const source = user?.email || user?.profile?.name || 'M';
  return source.trim().charAt(0).toUpperCase() || 'M';
}

// 谷歌标识
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" focusable="false" aria-hidden="true">
      <path fill="#EA4335" stroke="none" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.7 3.6 14.6 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12S6.9 21.2 12 21.2c6.9 0 8.6-6.4 8.6-9.6 0-.6-.1-1-.2-1.4H12Z" />
      <path fill="#34A853" stroke="none" d="M2.8 12c0 5.1 4.1 9.2 9.2 9.2 3.8 0 6.7-1.3 8.6-3.5l-3.3-2.6c-.9.6-2.2 1-3.9 1-3.3 0-6-2.2-7-5.2l-3.4 2.6C2.9 10.9 2.8 11.4 2.8 12Z" />
      <path fill="#4A90E2" stroke="none" d="M21.8 12.4c0-.8-.1-1.4-.2-2H12v3.9h5.4c-.3 1.4-1.1 2.5-2.3 3.3l3.3 2.6c2-1.8 3.4-4.6 3.4-8.1Z" />
      <path fill="#FBBC05" stroke="none" d="M5 8.4C5.8 6.1 8.2 4.5 12 4.5c1.9 0 3.4.6 4.4 1.5l2.7-2.7C17.5 1.8 15.1 1 12 1 8.2 1 4.8 3.1 3 6.3l2 2.1Z" />
    </svg>
  );
}

// 加载认证
export function AuthLoading() {
  return (
    <main className="sidepanel-shell auth-shell">
      <div className="auth-loading" aria-label="正在读取登录态">
        <span className="auth-spinner" aria-hidden="true" />
      </div>
    </main>
  );
}

// 登录入口
export function AuthPanel({ status, error, onGoogleLogin }: AuthPanelProps) {
  const busy = status === 'checking';

  return (
    <main className="sidepanel-shell auth-shell">
      <section className="auth-box" aria-label="登录">
        <p className="auth-eyebrow">MurmRay</p>
        <h1>把日常浏览变成交易线索</h1>
        <p className="auth-subtitle">为你扫描 Polymarket，标出值得下注的盘口。</p>

        <button
          type="button"
          className="btn btn-google"
          onClick={onGoogleLogin}
          disabled={busy}
        >
          <span className="google-mark"><GoogleMark /></span>
          <span>{busy ? '登录中' : '使用 Google 继续'}</span>
        </button>

        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </main>
  );
}

// 用户资料
export function UserProfile({ user, logoutBusy, onLogout }: UserProfileProps) {
  return (
    <div className="profile-block">
      <span className="profile-avatar" aria-hidden="true">{getUserInitial(user)}</span>
      <div className="profile-copy">
        <h2>{user.email || user.profile.name || '用户'}</h2>
        <p>{user.profile.name || 'Google 登录'}</p>
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onLogout}
        disabled={logoutBusy}
      >
        {logoutBusy ? '退出中' : '退出'}
      </button>
    </div>
  );
}
