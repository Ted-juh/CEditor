/**
 * Svelte action that binds the dragScrub core to a DOM element.
 *
 *   <div use:dragScrub={{ ...presets.knob, value, onChange }} />
 *
 * Handles pointer capture, optional pointer lock, wheel, double-click reset
 * and keyboard, so widgets stay declarative.
 */

import { DragScrub, type DragScrubOptions, type PointerSample } from './dragScrub';

export interface DragScrubParams extends Partial<DragScrubOptions> {
  value: number;
  onChange: (value: number) => void;
  /** Fire host automation gestures around the drag. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Double-click. Return the default value, or omit to disable. */
  defaultValue?: number;
  /** Try to lock the pointer so the drag isn't bounded by the screen edge. */
  pointerLock?: boolean;
  /** Jump to the pointer on press (absolute tracking only). */
  jumpToPointer?: boolean;
  /** Keyboard nudge size. Defaults to step, or 1/100 of the range. */
  keyStep?: number;
  disabled?: boolean;
  /** Set the cursor to match the axis. */
  manageCursor?: boolean;
}

const cursorFor = (axis: DragScrubOptions['axis']): string => {
  switch (axis) {
    case 'x':
      return 'ew-resize';
    case 'y':
      return 'ns-resize';
    case 'both':
      return 'move';
    default:
      return 'grab';
  }
};

export function dragScrub(node: HTMLElement, params: DragScrubParams) {
  let current = params;
  let scrub = new DragScrub(current, current.value);
  let activePointer: number | null = null;
  let locked = false;
  // Under pointer lock there is no meaningful clientX, so we integrate
  // movementX/Y into a virtual position and feed the core that instead.
  let virtualX = 0;
  let virtualY = 0;

  const rect = () => {
    const r = node.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  const sampleFrom = (e: PointerEvent | KeyboardEvent | WheelEvent): PointerSample => ({
    x: locked ? virtualX : (e as PointerEvent).clientX ?? 0,
    y: locked ? virtualY : (e as PointerEvent).clientY ?? 0,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
  });

  const emit = (v: number | null) => {
    if (v !== null) current.onChange(v);
  };

  const applyCursor = () => {
    if (current.manageCursor === false) return;
    node.style.cursor = cursorFor(scrub.options.axis);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (current.disabled || e.button !== 0 || activePointer !== null) return;

    activePointer = e.pointerId;
    node.setPointerCapture(e.pointerId);
    virtualX = e.clientX;
    virtualY = e.clientY;

    // Pointer lock is unreliable inside embedded webviews and meaningless for
    // touch, so treat it as an enhancement rather than a requirement.
    if (
      current.pointerLock &&
      e.pointerType === 'mouse' &&
      scrub.options.tracking === 'relative' &&
      typeof node.requestPointerLock === 'function'
    ) {
      try {
        const result = node.requestPointerLock() as unknown as Promise<void> | undefined;
        if (result && typeof result.then === 'function') {
          result.then(() => { locked = document.pointerLockElement === node; }).catch(() => {});
        } else {
          locked = document.pointerLockElement === node;
        }
      } catch {
        locked = false;
      }
    }

    current.onDragStart?.();
    emit(
      scrub.begin(sampleFrom(e), {
        bounds: rect(),
        jumpToPointer: current.jumpToPointer ?? scrub.options.tracking === 'absolute',
      })
    );
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (activePointer !== e.pointerId || !scrub.isDragging) return;
    if (locked) {
      virtualX += e.movementX;
      virtualY += e.movementY;
    }
    emit(scrub.move(sampleFrom(e)));
  };

  const onPointerUp = (e: PointerEvent) => {
    if (activePointer !== e.pointerId) return;
    scrub.end();
    if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    if (locked && document.pointerLockElement === node) document.exitPointerLock();
    locked = false;
    activePointer = null;
    current.onDragEnd?.();
  };

  const onWheel = (e: WheelEvent) => {
    if (current.disabled) return;
    e.preventDefault();
    current.onDragStart?.();
    emit(scrub.wheel(e.deltaY, sampleFrom(e)));
    current.onDragEnd?.();
  };

  const onDoubleClick = () => {
    if (current.disabled || current.defaultValue === undefined) return;
    current.onDragStart?.();
    scrub.setValue(current.defaultValue);
    current.onChange(scrub.value);
    current.onDragEnd?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (current.disabled) return;
    const o = scrub.options;
    const base = current.keyStep ?? (o.step > 0 ? o.step : (o.max - o.min) / 100);
    const mult = e.shiftKey ? o.fineFactor : e.ctrlKey || e.metaKey ? o.coarseFactor : 1;

    let dir = 0;
    // Mirror the pointer mapping so the keyboard agrees with the drag.
    if (e.key === 'ArrowRight') dir = o.invertX ? -1 : 1;
    else if (e.key === 'ArrowLeft') dir = o.invertX ? 1 : -1;
    else if (e.key === 'ArrowUp') dir = o.invertY ? -1 : 1;
    else if (e.key === 'ArrowDown') dir = o.invertY ? 1 : -1;
    else if (e.key === 'Home') dir = 0;
    else if (e.key === 'End') dir = 0;
    else return;

    e.preventDefault();
    current.onDragStart?.();
    if (e.key === 'Home') scrub.setValue(o.min);
    else if (e.key === 'End') scrub.setValue(o.max);
    else scrub.setValue(scrub.value + dir * base * mult);
    current.onChange(scrub.value);
    current.onDragEnd?.();
  };

  node.style.touchAction = 'none';
  applyCursor();
  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);
  node.addEventListener('pointercancel', onPointerUp);
  node.addEventListener('wheel', onWheel, { passive: false });
  node.addEventListener('dblclick', onDoubleClick);
  node.addEventListener('keydown', onKeyDown);

  return {
    update(next: DragScrubParams) {
      const configChanged = Object.keys(next).some(
        (k) => k in scrub.options && (next as never)[k] !== (scrub.options as never)[k]
      );
      current = next;
      if (configChanged) {
        scrub = new DragScrub(next, next.value);
        applyCursor();
      } else if (!scrub.isDragging && next.value !== scrub.value) {
        // External change (host automation, undo, a second view of the same
        // parameter). Never do this mid-drag or the gesture fights the host.
        scrub.setValue(next.value);
      }
    },
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerUp);
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('dblclick', onDoubleClick);
      node.removeEventListener('keydown', onKeyDown);
    },
  };
}
