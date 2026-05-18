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

// 品牌图形
function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <img
      src="/brand/murmray-logo.png"
      alt="MURMRAY"
      className={compact
        ? 'size-10 rounded-md border border-(--rule) object-cover'
        : 'mb-5 aspect-square w-[118px] rounded-md object-cover [box-shadow:0_18px_42px_rgb(17_24_39_/_18%)]'}
    />
  );
}

// 加载认证
export function AuthLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-(--paper) px-[18px] py-6 text-(--ink-1)">
      <div className="inline-flex size-12 items-center justify-center" aria-label="正在读取登录态">
        <span className="size-7 animate-spin rounded-full border-2 border-(--rule) border-t-(--ink-1)" aria-hidden="true" />
      </div>
    </main>
  );
}

// 登录入口
export function AuthPanel({ status, error, onGoogleLogin }: AuthPanelProps) {
  const busy = status === 'checking';

  return (
    <main className="grid min-h-screen place-items-center bg-(--paper) px-[18px] py-6 text-(--ink-1)">
      <section className="w-[min(100%,320px)]" aria-label="登录">
        {/* <BrandMark /> */}
        <p className="m-0 mb-2 text-xs font-extrabold uppercase tracking-normal text-(--accent)">MURMRAY</p>
        <h1 className="m-0 text-[28px] font-bold leading-[1.12] text-(--ink-1)">把日常浏览变成交易线索</h1>
        <p className="mb-[22px] mt-3 text-sm leading-[1.55] text-(--ink-3)">为你扫描 Polymarket，标出值得下注的盘口。</p>

        <button
          type="button"
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-[9px] whitespace-nowrap rounded-lg border border-(--rule) bg-(--paper) px-[13px] text-[13px] font-semibold text-(--ink-1) transition-colors duration-[160ms] hover:bg-(--surface) disabled:cursor-progress disabled:text-(--ink-4) [box-shadow:0_1px_2px_rgb(17_24_39_/_8%)]"
          onClick={onGoogleLogin}
          disabled={busy}
        >
          <span className="size-[18px] [&_svg]:size-[18px]"><GoogleMark /></span>
          <span>{busy ? '登录中' : '使用 Google 继续'}</span>
        </button>

        {error ? <p className="mb-0 mt-3 min-h-5 text-xs leading-normal text-(--bad)">{error}</p> : null}
      </section>
    </main>
  );
}

// 用户资料
export function UserProfile({ user, logoutBusy, onLogout }: UserProfileProps) {
  return (
    <div className="flex items-center gap-3 border-b border-(--rule) px-4 py-6">
      {/* <BrandMark compact /> */}
      <div className="min-w-0 flex-1">
        <h2 className="m-0 truncate text-base font-[650] text-(--ink-1)">{user.email || user.profile.name || '用户'}</h2>
        <p className="mb-0 mt-1 truncate text-[13px] text-(--ink-3)">{user.profile.name || `MURMRAY · ${getUserInitial(user)}`}</p>
      </div>
      <button
        type="button"
        className="inline-flex min-h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-(--rule) bg-(--paper) px-[13px] text-[13px] font-semibold text-(--ink-2) transition-colors duration-[160ms] hover:border-(--rule-strong) hover:bg-(--surface) hover:text-(--ink-1) disabled:cursor-progress disabled:text-(--ink-4)"
        onClick={onLogout}
        disabled={logoutBusy}
      >
        {logoutBusy ? '退出中' : '退出'}
      </button>
    </div>
  );
}
