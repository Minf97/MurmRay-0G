import { buildWidgetView, type WidgetState, type WidgetView } from '../widget-model';
import type { WidgetElements } from './dom';

// 设置模式
function setWidgetMode(elements: WidgetElements, mode: WidgetView['mode'], subState?: string) {
  elements.wrap.dataset.mode = mode;
  if (subState) elements.wrap.dataset.state = subState;
}

// 创建文本
function createTextSpan(className: string, value: unknown) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = String(value ?? '');
  return span;
}

// 创建行
function createCardRow(row: Extract<WidgetView, { mode: 'card' }>['rows'][number]) {
  const item = document.createElement('li');
  item.className = 'ghost-card-row';
  item.dataset.tier = String(row.tier || '');
  item.append(
    createTextSpan('row-text', row.question),
    createTextSpan('row-score', row.confidence),
  );
  return item;
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
    listEl.replaceChildren(...view.rows.map(createCardRow));
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
