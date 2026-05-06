import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { EXTENSION_NAME } from '../../src/shared/manifest';
import { CORE_MESSAGE_TYPES } from '../../src/shared/messages';

type ChannelStatus = 'checking' | 'ready' | 'error';

const STATUS_COPY: Record<ChannelStatus, string> = {
  checking: '正在检测消息通道',
  ready: '消息通道已就绪',
  error: '消息通道异常',
};

// 检测通道
async function detectChannelStatus() {
  try {
    const response = await browser.runtime.sendMessage({
      type: CORE_MESSAGE_TYPES.ping,
    });

    if (response?.ok && response.type === CORE_MESSAGE_TYPES.pong) {
      return 'ready' satisfies ChannelStatus;
    }
  } catch {
    return 'error' satisfies ChannelStatus;
  }

  return 'error' satisfies ChannelStatus;
}

// 状态样式
function getStatusTone(status: ChannelStatus) {
  if (status === 'ready') return 'text-emerald-600';
  if (status === 'error') return 'text-rose-600';
  return 'text-amber-600';
}

export function App() {
  const [status, setStatus] = useState<ChannelStatus>('checking');

  useEffect(() => {
    let alive = true;

    // 广播就绪
    void browser.runtime
      .sendMessage({ type: CORE_MESSAGE_TYPES.sidepanelReady })
      .catch(() => undefined);

    // 读取状态
    void detectChannelStatus().then((nextStatus) => {
      if (!alive) return;
      setStatus(nextStatus);
    });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-5 py-6 text-slate-950">
      <section className="mx-auto max-w-md rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">
          Phase 0
        </p>
        <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.04em] text-slate-950">
          {EXTENSION_NAME}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          基线已切到 React + Tailwind，后续功能迁移会继续沿这套结构推进。
        </p>

        <div className="mt-6 grid gap-3">
          <article className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Channel
            </span>
            <p className={`mt-2 text-sm font-medium ${getStatusTone(status)}`}>
              {STATUS_COPY[status]}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Stack
            </span>
            <p className="mt-2 text-sm text-slate-700">
              WXT / React / Tailwind
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Scope
            </span>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              background / content / sidepanel / shared / tests
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
