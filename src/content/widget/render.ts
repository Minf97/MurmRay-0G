import { buildWidgetView, type WidgetState, type WidgetView } from '../widget-model';
import type { WidgetElements } from './dom';

// 转义文本
function escapeHtml(text: unknown) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

// 设置模式
function setWidgetMode(elements: WidgetElements, mode: WidgetView['mode'], subState?: string) {
  elements.wrap.dataset.mode = mode;
  if (subState) elements.wrap.dataset.state = subState;
}

// 渲染圆盘
function renderDisk(elements: WidgetElements, view: Extract<WidgetView, { mode: 'disk' }>) {
  setWidgetMode(elements, 'disk', view.state);
  elements.disk.setAttribute('aria-label', view.ariaLabel);

  const countEl = elements.disk.querySelector('.disk-count');
  if (countEl) countEl.textContent = view.countLabel;
}

// 渲染卡片
function renderCard(elements: WidgetElements, view: Extract<WidgetView, { mode: 'card' }>) {
  setWidgetMode(elements, 'card');

  const titleEl = elements.card.querySelector('.ghost-card-title');
  const scopeEl = elements.card.querySelector('.ghost-card-scope');
  const listEl = elements.card.querySelector('.ghost-card-list');

  if (titleEl) titleEl.textContent = view.title;
  if (scopeEl) scopeEl.textContent = view.scope;
  if (listEl) {
    listEl.innerHTML = view.rows.map((row) => `
      <li class="ghost-card-row" data-tier="${escapeHtml(row.tier)}">
        <span class="row-text">${escapeHtml(row.question)}</span>
        <span class="row-score">${escapeHtml(row.confidence)}</span>
      </li>
    `).join('');
  }

  elements.card.setAttribute('aria-label', view.ariaLabel);
}

// 渲染短条
function renderPill(elements: WidgetElements, view: Extract<WidgetView, { mode: 'pill' }>) {
  setWidgetMode(elements, 'pill');
  elements.pill.dataset.kind = view.kind;
  elements.pill.setAttribute('aria-label', view.ariaLabel);

  const textEl = elements.pill.querySelector('.pill-text');
  if (textEl) textEl.textContent = view.label;
}

// 渲染组件
export function renderWidget(elements: WidgetElements, state: WidgetState) {
  const view = buildWidgetView(state);

  if (view.mode === 'disk') renderDisk(elements, view);
  if (view.mode === 'card') renderCard(elements, view);
  if (view.mode === 'pill') renderPill(elements, view);
}
