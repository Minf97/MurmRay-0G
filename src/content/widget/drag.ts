import type { WidgetElements } from './dom';

export type WidgetPosition = {
  left: number;
  top: number;
};

type StorageLike = {
  local: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
};

const WIDGET_POSITION_STORAGE_KEY = 'murmray_widget_position';
const WIDGET_EDGE_MARGIN = 12;
const WIDGET_DRAG_THRESHOLD = 4;

// 创建拖拽
export function createWidgetDragController(elements: WidgetElements, storage: StorageLike) {
  let widgetPosition: WidgetPosition | null = null;
  let widgetClampRaf = 0;

  const dragState = {
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    dragging: false,
    suppressNextClick: false,
  };

  // 读取边界
  function getWidgetBounds() {
    return elements.wrap.getBoundingClientRect();
  }

  // 限制位置
  function clampWidgetPosition(left: number, top: number) {
    const rect = getWidgetBounds();
    const maxLeft = Math.max(WIDGET_EDGE_MARGIN, window.innerWidth - rect.width - WIDGET_EDGE_MARGIN);
    const maxTop = Math.max(WIDGET_EDGE_MARGIN, window.innerHeight - rect.height - WIDGET_EDGE_MARGIN);

    return {
      left: Math.round(Math.min(Math.max(left, WIDGET_EDGE_MARGIN), maxLeft)),
      top: Math.round(Math.min(Math.max(top, WIDGET_EDGE_MARGIN), maxTop)),
    };
  }

  // 应用位置
  function applyWidgetPosition(position: WidgetPosition, options: { persist?: boolean } = {}) {
    const next = clampWidgetPosition(position.left, position.top);
    widgetPosition = next;
    elements.wrap.style.left = `${next.left}px`;
    elements.wrap.style.top = `${next.top}px`;
    elements.wrap.style.right = 'auto';
    elements.wrap.style.bottom = 'auto';

    if (options.persist) {
      void storage.local.set({ [WIDGET_POSITION_STORAGE_KEY]: next }).catch(() => undefined);
    }
  }

  // 修正位置
  function scheduleClamp() {
    if (!widgetPosition || widgetClampRaf) return;

    widgetClampRaf = window.requestAnimationFrame(() => {
      widgetClampRaf = 0;
      if (!widgetPosition) return;
      applyWidgetPosition(widgetPosition);
    });
  }

  // 解绑拖拽
  function cleanupWidgetDragListeners() {
    window.removeEventListener('pointermove', handleWidgetPointerMove);
    window.removeEventListener('pointerup', handleWidgetPointerUp);
    window.removeEventListener('pointercancel', handleWidgetPointerCancel);
  }

  // 开始拖拽
  function handleWidgetPointerDown(event: PointerEvent) {
    if (event.button !== 0 || dragState.pointerId !== null) return;

    dragState.pointerId = event.pointerId;
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;

    const rect = getWidgetBounds();
    dragState.startLeft = Number(rect.left || 0);
    dragState.startTop = Number(rect.top || 0);
    dragState.dragging = false;
    dragState.suppressNextClick = false;

    window.addEventListener('pointermove', handleWidgetPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWidgetPointerUp);
    window.addEventListener('pointercancel', handleWidgetPointerCancel);
  }

  // 移动拖拽
  function handleWidgetPointerMove(event: PointerEvent) {
    if (event.pointerId !== dragState.pointerId) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;

    if (!dragState.dragging) {
      if (Math.hypot(dx, dy) < WIDGET_DRAG_THRESHOLD) return;
      dragState.dragging = true;
      elements.wrap.dataset.dragging = 'true';
    }

    event.preventDefault();
    applyWidgetPosition({
      left: dragState.startLeft + dx,
      top: dragState.startTop + dy,
    });
  }

  // 完成拖拽
  function finishWidgetDrag(event?: PointerEvent) {
    if (event && event.pointerId !== dragState.pointerId) return;

    const wasDragging = dragState.dragging;
    cleanupWidgetDragListeners();
    elements.wrap.dataset.dragging = 'false';

    if (wasDragging) {
      const rect = getWidgetBounds();
      applyWidgetPosition({ left: rect.left, top: rect.top }, { persist: true });
      dragState.suppressNextClick = true;
      window.requestAnimationFrame(() => {
        dragState.suppressNextClick = false;
      });
    }

    dragState.pointerId = null;
    dragState.dragging = false;
  }

  // 结束拖拽
  function handleWidgetPointerUp(event: PointerEvent) {
    finishWidgetDrag(event);
  }

  // 取消拖拽
  function handleWidgetPointerCancel(event: PointerEvent) {
    finishWidgetDrag(event);
  }

  return {
    applyWidgetPosition,
    async loadPosition() {
      try {
        const result = await storage.local.get(WIDGET_POSITION_STORAGE_KEY);
        const stored = result[WIDGET_POSITION_STORAGE_KEY] as Partial<WidgetPosition> | undefined;
        if (Number.isFinite(stored?.left) && Number.isFinite(stored?.top)) {
          applyWidgetPosition({
            left: Math.round(Number(stored?.left)),
            top: Math.round(Number(stored?.top)),
          });
        }
      } catch {
        widgetPosition = null;
      }
    },
    scheduleClamp,
    suppressNextClick() {
      if (!dragState.suppressNextClick) return false;
      dragState.suppressNextClick = false;
      return true;
    },
    bind() {
      elements.stage.addEventListener('pointerdown', handleWidgetPointerDown);
    },
  };
}
