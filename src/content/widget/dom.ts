import { renderWidgetTemplate } from './template';

export type WidgetElements = {
  host: HTMLDivElement;
  wrap: HTMLElement;
  stage: HTMLElement;
  disk: HTMLButtonElement;
  card: HTMLElement;
  pill: HTMLButtonElement;
};

// 固定宿主
function pinWidgetHost(host: HTMLDivElement) {
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('display', 'block', 'important');
  host.style.setProperty('position', 'static', 'important');
  host.style.setProperty('width', '0', 'important');
  host.style.setProperty('height', '0', 'important');
}

// 创建节点
export function createWidgetElements() {
  document.getElementById('murmray-widget-host')?.remove();

  const host = document.createElement('div');
  host.id = 'murmray-widget-host';
  pinWidgetHost(host);

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = renderWidgetTemplate();

  const wrap = shadow.querySelector('.ghost-wrap') as HTMLElement | null;
  const stage = shadow.querySelector('.ghost-stage') as HTMLElement | null;
  const disk = shadow.querySelector('.ghost-disk') as HTMLButtonElement | null;
  const card = shadow.querySelector('.ghost-card') as HTMLElement | null;
  const pill = shadow.querySelector('.ghost-pill') as HTMLButtonElement | null;

  if (!wrap || !stage || !disk || !card || !pill) {
    throw new Error('Missing widget elements.');
  }

  document.documentElement.appendChild(host);

  return { host, wrap, stage, disk, card, pill };
}
