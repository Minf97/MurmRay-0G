const TARGET_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
`;

const DISMISS_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">
    <path d="m18 6-12 12" />
    <path d="m6 6 12 12" />
  </svg>
`;

export const WIDGET_DEFAULT_RIGHT = 18;
export const WIDGET_DEFAULT_BOTTOM = 22;

const WIDGET_STYLE = `
:host {
  --paper:#fff; --surface:#f8fafc; --ink-1:#111827; --ink-2:#374151;
  --ink-3:#6b7280; --ink-4:#9ca3af; --ink-5:#cbd5e1;
  --rule:#e5e7eb; --rule-strong:#d1d5db; --accent:#1e40af;
  --accent-soft:#dbeafe; --bad:#be123c; --score-very-high:#059669;
  --score-high:#d97706; --score-medium:#0284c7; --score-moderate:#4f46e5;
}
* { box-sizing: border-box; }
.ghost-wrap {
  position: fixed; right: ${WIDGET_DEFAULT_RIGHT}px; bottom: ${WIDGET_DEFAULT_BOTTOM}px;
  z-index: 2147483646; font-family: "SF Pro Text", "Inter", system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased; pointer-events: auto; touch-action: none;
}
.ghost-stage { position: relative; width: 44px; height: 44px; cursor: grab; user-select: none; }
.ghost-wrap[data-dragging="true"] .ghost-stage { cursor: grabbing; }
.ghost-disk {
  position: absolute; inset: 0; display: inline-flex; align-items: center; justify-content: center;
  margin: 0; padding: 0; border: 1px solid var(--rule); border-radius: 999px;
  background: var(--paper); color: var(--ink-2); cursor: pointer;
  box-shadow: 0 1px 2px rgb(17 24 39 / 6%), 0 12px 28px rgb(17 24 39 / 12%);
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 160ms ease, opacity 160ms ease;
}
.ghost-disk:hover { border-color: var(--rule-strong); transform: scale(1.04); }
.ghost-disk:focus-visible, .ghost-card:focus-visible, .ghost-pill:focus-visible, .dismiss:focus-visible {
  outline: none; box-shadow: 0 0 0 3px var(--accent-soft), 0 12px 28px rgb(17 24 39 / 12%);
}
.disk-icon, .disk-count {
  position: relative; z-index: 2; display: inline-flex; align-items: center; justify-content: center;
}
.disk-icon { color: var(--ink-3); }
.disk-count {
  color: var(--ink-1); font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums;
  opacity: 0; transform: scale(0.85); transition: opacity 160ms ease, transform 160ms ease;
}
.disk-sweep, .disk-pulse { position: absolute; border-radius: 999px; pointer-events: none; }
.disk-sweep { inset: 5px; border: 1.5px solid transparent; opacity: 0; }
.disk-pulse { inset: -3px; border: 1px solid var(--accent); opacity: 0; }
.ghost-wrap[data-mode="disk"][data-state="analyzing"] .disk-icon { color: var(--accent); }
.ghost-wrap[data-mode="disk"][data-state="analyzing"] .disk-sweep {
  opacity: 1; border-top-color: var(--accent); animation: ghost-spin 1.2s linear infinite;
}
.ghost-wrap[data-mode="disk"][data-state="found"] .disk-icon { display: none; }
.ghost-wrap[data-mode="disk"][data-state="found"] .disk-count { opacity: 1; transform: scale(1); }
.ghost-wrap[data-mode="disk"][data-state="found"] .disk-pulse { animation: ghost-pulse 2s ease-out infinite; }
.ghost-card {
  position: absolute; right: 0; bottom: 0; width: 320px; max-width: calc(100vw - 36px);
  padding: 14px 14px 12px; border: 1px solid var(--rule); border-radius: 14px;
  background: var(--paper); color: var(--ink-1);
  box-shadow: 0 1px 2px rgb(17 24 39 / 7%), 0 20px 48px rgb(17 24 39 / 16%);
  cursor: pointer; opacity: 0; pointer-events: none; transform: scale(0.96) translateY(10px);
  transform-origin: bottom right; transition: opacity 180ms ease, transform 180ms ease;
}
.ghost-card-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  padding: 0 26px 10px 0; border-bottom: 1px solid var(--rule);
}
.ghost-card-title { color: var(--ink-1); font-size: 14px; font-weight: 700; }
.ghost-card-scope { color: var(--ink-4); font-size: 10.5px; font-weight: 600; white-space: nowrap; }
.dismiss {
  position: absolute; top: 10px; right: 10px; display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; border: 0; border-radius: 999px;
  background: transparent; color: var(--ink-4); cursor: pointer;
}
.dismiss:hover { background: var(--surface); color: var(--ink-2); }
.ghost-card-list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.ghost-card-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: baseline;
  padding: 9px 0; border-bottom: 1px solid var(--rule); color: var(--ink-1); font-size: 12.5px; line-height: 1.4;
}
.ghost-card-row:last-child { border-bottom: 0; }
.row-text {
  display: -webkit-box; min-width: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
}
.row-text::before {
  content: ""; display: inline-block; width: 5px; height: 5px; margin-right: 8px;
  border-radius: 999px; background: var(--score-medium); transform: translateY(-2px);
}
.ghost-card-row[data-tier="very-high"] .row-text::before { background: var(--score-very-high); }
.ghost-card-row[data-tier="high"] .row-text::before { background: var(--score-high); }
.ghost-card-row[data-tier="medium"] .row-text::before { background: var(--score-medium); }
.ghost-card-row[data-tier="moderate"] .row-text::before { background: var(--score-moderate); }
.row-score { color: var(--ink-2); font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ghost-card-foot {
  display: flex; align-items: center; gap: 6px; padding-top: 8px;
  color: var(--ink-4); font-size: 10.5px; font-weight: 600;
}
.ghost-card-foot .dot { width: 3px; height: 3px; border-radius: 999px; background: var(--ink-5); }
.ghost-pill {
  position: absolute; right: 0; bottom: 0; display: inline-flex; align-items: center; gap: 8px;
  height: 36px; padding: 0 14px 0 12px; border: 1px solid var(--rule); border-radius: 999px;
  background: var(--paper); color: var(--ink-2);
  box-shadow: 0 1px 2px rgb(17 24 39 / 6%), 0 12px 28px rgb(17 24 39 / 12%);
  cursor: pointer; font-size: 12px; font-weight: 600; opacity: 0; pointer-events: none;
  transform: scale(0.94); transform-origin: bottom right; transition: opacity 160ms ease, transform 160ms ease; white-space: nowrap;
}
.ghost-pill[data-kind="blocked"] { color: var(--ink-3); cursor: default; }
.pill-mark { width: 5px; height: 5px; border-radius: 999px; background: var(--ink-4); }
.ghost-pill[data-kind="error"] .pill-mark { background: var(--bad); }
.ghost-pill[data-kind="blocked"] .pill-mark { background: var(--ink-5); }
.ghost-wrap[data-mode="disk"] .ghost-disk,
.ghost-wrap[data-mode="card"] .ghost-card,
.ghost-wrap[data-mode="pill"] .ghost-pill {
  opacity: 1; pointer-events: auto; transform: scale(1) translateY(0);
}
.ghost-wrap[data-mode="card"] .ghost-disk, .ghost-wrap[data-mode="pill"] .ghost-disk {
  opacity: 0; pointer-events: none; transform: scale(0.92);
}
.ghost-wrap[data-dragging="true"] .ghost-disk,
.ghost-wrap[data-dragging="true"] .ghost-card,
.ghost-wrap[data-dragging="true"] .ghost-pill {
  transition-duration: 0ms !important; cursor: grabbing !important;
}
@keyframes ghost-spin { to { transform: rotate(360deg); } }
@keyframes ghost-pulse {
  0% { transform: scale(0.9); opacity: 0; }
  25% { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(1.55); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;

export function renderWidgetTemplate() {
  return `
    <style>${WIDGET_STYLE}</style>
    <div class="ghost-wrap" data-mode="disk" data-state="idle">
      <div class="ghost-stage">
        <button class="ghost-disk" type="button" aria-label="点击分析当前网页">
          <span class="disk-pulse" aria-hidden="true"></span>
          <span class="disk-sweep" aria-hidden="true"></span>
          <span class="disk-icon" aria-hidden="true">${TARGET_ICON_SVG}</span>
          <span class="disk-count" aria-hidden="true"></span>
        </button>
        <div class="ghost-card" role="button" tabindex="0" aria-label="发现机会，点击展开侧边栏">
          <button class="dismiss" type="button" aria-label="收起">${DISMISS_ICON_SVG}</button>
          <header class="ghost-card-head">
            <span class="ghost-card-title"></span>
            <span class="ghost-card-scope"></span>
          </header>
          <ul class="ghost-card-list"></ul>
          <footer class="ghost-card-foot">
            <span>点击查看全部</span>
            <span class="dot" aria-hidden="true"></span>
            <span>侧边栏</span>
          </footer>
        </div>
        <button class="ghost-pill" type="button" data-kind="empty" aria-label="重试分析">
          <span class="pill-mark" aria-hidden="true"></span>
          <span class="pill-text">无机会</span>
        </button>
      </div>
    </div>
  `;
}
