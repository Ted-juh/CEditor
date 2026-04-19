<script>
  import { onDestroy } from 'svelte';
  import CanvasControl from '../editor/CanvasControl.svelte';
  import { deepClone } from '../utils/deepClone.js';

  let {
    control = null,
    session = null,
    onpatchsession = null,
  } = $props();

  const SURFACE_PADDING = 24;
  const MAX_PREVIEW_SCALE = 2.75;

  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let hitboxElement = $state(null);
  let pointerActive = $state(false);
  let draggingRange = $state(false);
  let keyboardFocusActive = $state(false);
  let lastInputMode = $state('pointer');

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function patchSession(patch = {}) {
    onpatchsession?.(patch);
  }

  let behavior = $derived(control?._children?.Behavior ?? null);
  let transform = $derived(control?._children?.Transform ?? null);
  let previewRenderIdNamespace = $derived(
    `interaction-preview-${control?._children?.Core?.id ?? 'control'}`
  );
  let previewControl = $derived.by(() => {
    if (!control) return null;
    const clone = deepClone(control);
    if (clone?._children?.Transform) {
      clone._children.Transform.x = 0;
      clone._children.Transform.y = 0;
    }
    return clone;
  });

  let controlWidth = $derived(Math.max(24, numberOr(transform?.width, 100)));
  let controlHeight = $derived(Math.max(24, numberOr(transform?.height, 40)));
  let fitScale = $derived.by(() => {
    if (!stageWidth || !stageHeight) return 1;
    const usableWidth = Math.max(1, stageWidth - (SURFACE_PADDING * 2));
    const usableHeight = Math.max(1, stageHeight - (SURFACE_PADDING * 2));
    return clamp(Math.min(usableWidth / controlWidth, usableHeight / controlHeight, MAX_PREVIEW_SCALE), 0.25, MAX_PREVIEW_SCALE);
  });
  let sceneWidth = $derived(controlWidth * fitScale);
  let sceneHeight = $derived(controlHeight * fitScale);
  let sceneLeft = $derived(Math.max(SURFACE_PADDING, (stageWidth - sceneWidth) / 2));
  let sceneTop = $derived(Math.max(SURFACE_PADDING, (stageHeight - sceneHeight) / 2));
  let previewSession = $derived(session?.enabled === false ? {} : (session ?? {}));
  let isDisabled = $derived(session?.enabled === false || session?.disabled === true);
  let helperLabel = $derived.by(() => {
    if (!behavior) return 'Hover and click to test the selected control.';
    if (behavior.family === 'range') return 'Drag across the control to test value changes.';
    if (behavior.family === 'select') return 'Hover, press, and click to test selection behavior.';
    return 'Hover and press to test the configured states.';
  });

  function removeWindowListeners() {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
  }

  onDestroy(removeWindowListeners);

  function isRangeControl() {
    return String(behavior?.family ?? '') === 'range';
  }

  function isPointInsideHitbox(clientX, clientY) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function currentBoolValue() {
    if (session?.valueOverrideEnabled === true) return session?.valueOverride === true;
    return session?.checked === true;
  }

  function currentRangeValue() {
    if (session?.valueOverrideEnabled === true) {
      return numberOr(session?.valueOverride, numberOr(behavior?.defaultValue, numberOr(behavior?.min, 0)));
    }
    return numberOr(behavior?.defaultValue, numberOr(behavior?.min, 0));
  }

  function commitSelectAction() {
    const role = String(behavior?.role ?? '');
    const valueType = String(behavior?.valueType ?? '');
    if (role === 'radio') {
      patchSession({ checked: true, mixed: false, valueOverrideEnabled: false });
      return;
    }
    if (valueType === 'enum') {
      const values = Array.isArray(behavior?.enumValues) ? behavior.enumValues : [];
      if (!values.length) return;
      const currentValue = session?.valueOverrideEnabled === true ? session?.valueOverride : behavior?.defaultValue;
      const currentIndex = Math.max(0, values.findIndex((value) => value === currentValue));
      const nextIndex = (currentIndex + 1) % values.length;
      patchSession({
        valueOverrideEnabled: true,
        valueOverride: values[nextIndex],
      });
      return;
    }

    patchSession({
      checked: !currentBoolValue(),
      mixed: false,
      valueOverrideEnabled: false,
    });
  }

  function snapRangeValue(rawValue) {
    const min = numberOr(behavior?.min, 0);
    const max = numberOr(behavior?.max, 1);
    let next = clamp(rawValue, min, max);
    const step = numberOr(behavior?.step, 0);
    if (step > 0) {
      next = min + Math.round((next - min) / step) * step;
    }
    if (String(behavior?.valueType ?? '') === 'int') {
      next = Math.round(next);
    }
    return clamp(next, min, max);
  }

  function normalizedFromPointerEvent(event) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return 0;

    const localX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const localY = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    const orientation = String(behavior?.orientation ?? 'horizontal');
    const direction = String(behavior?.direction ?? (orientation === 'vertical' ? 'btt' : 'ltr'));

    if (orientation === 'vertical') {
      if (direction === 'ttb') return localY;
      return 1 - localY;
    }

    if (direction === 'rtl') return 1 - localX;
    return localX;
  }

  function updateRangeFromPointer(event) {
    if (!isRangeControl()) return;
    const min = numberOr(behavior?.min, 0);
    const max = numberOr(behavior?.max, 1);
    const normalized = normalizedFromPointerEvent(event);
    const nextValue = snapRangeValue(min + ((max - min) * normalized));
    patchSession({
      valueOverrideEnabled: true,
      valueOverride: nextValue,
    });
  }

  function adjustRangeFromKey(key) {
    if (!isRangeControl()) return;

    const min = numberOr(behavior?.min, 0);
    const max = numberOr(behavior?.max, 1);
    const fallbackStep = String(behavior?.valueType ?? '') === 'int' ? 1 : 0.01;
    const step = Math.max(numberOr(behavior?.step, fallbackStep), fallbackStep);
    let nextValue = currentRangeValue();

    switch (key) {
      case 'Home':
        nextValue = min;
        break;
      case 'End':
        nextValue = max;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        nextValue -= step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        nextValue += step;
        break;
      default:
        return;
    }

    patchSession({
      valueOverrideEnabled: true,
      valueOverride: snapRangeValue(nextValue),
    });
  }

  function handlePointerEnter() {
    if (isDisabled) return;
    patchSession({ hover: true });
  }

  function handlePointerLeave() {
    if (isDisabled) return;
    if (pointerActive) {
      patchSession({ hover: false });
      return;
    }
    patchSession({ hover: false, pressed: false, dragging: false });
  }

  function handlePointerDown(event) {
    if (isDisabled) return;
    event.preventDefault();
    lastInputMode = 'pointer';
    keyboardFocusActive = false;
    pointerActive = true;
    draggingRange = isRangeControl();
    patchSession({
      hover: true,
      pressed: true,
      dragging: draggingRange,
    });
    if (draggingRange) {
      updateRangeFromPointer(event);
    }
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerMove(event) {
    if (!pointerActive || !draggingRange || isDisabled) return;
    updateRangeFromPointer(event);
  }

  function handleWindowPointerUp(event) {
    if (!pointerActive) return;
    const inside = isPointInsideHitbox(event.clientX, event.clientY);

    if (!draggingRange && inside && !isDisabled) {
      if (String(behavior?.family ?? 'trigger') === 'select') {
        commitSelectAction();
      }
    }

    patchSession({
      hover: inside,
      pressed: false,
      dragging: false,
    });

    pointerActive = false;
    draggingRange = false;
    removeWindowListeners();
  }

  function handleFocus() {
    if (isDisabled) return;
    if (lastInputMode !== 'keyboard') return;
    keyboardFocusActive = true;
    patchSession({ focused: true });
  }

  function handleBlur() {
    keyboardFocusActive = false;
    patchSession({ focused: false, pressed: false, dragging: false });
    pointerActive = false;
    draggingRange = false;
    removeWindowListeners();
  }

  function handleKeyDown(event) {
    if (isDisabled) return;
    lastInputMode = 'keyboard';
    keyboardFocusActive = true;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      hitboxElement?.focus?.();
      patchSession({ focused: true, pressed: true, hover: true });
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      hitboxElement?.focus?.();
      patchSession({ focused: true, hover: true });
      adjustRangeFromKey(event.key);
    }
  }

  function handleKeyUp(event) {
    if (isDisabled) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;

    event.preventDefault();
    if (String(behavior?.family ?? 'trigger') === 'select') {
      commitSelectAction();
    }
    patchSession({ focused: true, hover: true, pressed: false });
  }
</script>

<div class="test-surface">
  <div class="surface-header">
    <div class="surface-title">Live Test Surface</div>
    <div class="surface-subtitle">{helperLabel}</div>
  </div>

  <div class="surface-stage" bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}>
    {#if previewControl}
      <div class="stage-grid"></div>
      <div
        class="preview-scene"
        style="left:{sceneLeft}px; top:{sceneTop}px; width:{controlWidth}px; height:{controlHeight}px; transform:scale({fitScale}); transform-origin:top left;"
      >
        <div
          bind:this={hitboxElement}
          class="test-hitbox"
          class:disabled={session?.disabled === true}
          class:keyboard-focus={keyboardFocusActive}
          role="button"
          aria-label="Interactive preview surface"
          aria-disabled={session?.disabled === true}
          tabindex={isDisabled ? undefined : 0}
          onpointerenter={handlePointerEnter}
          onpointerleave={handlePointerLeave}
          onpointerdown={handlePointerDown}
          onfocus={handleFocus}
          onblur={handleBlur}
          onkeydown={handleKeyDown}
          onkeyup={handleKeyUp}
        >
          <CanvasControl
            control={previewControl}
            scale={1}
            renderIdNamespace={previewRenderIdNamespace}
            panelLocked={false}
            allControls={[previewControl]}
            editorInteractionEnabled={false}
            previewSessionOverride={previewSession}
          />
        </div>
      </div>
      {#if session?.enabled === false}
        <div class="surface-overlay">Preview disabled</div>
      {/if}
    {:else}
      <div class="surface-empty">Select a control to test it here.</div>
    {/if}
  </div>
</div>

<style>
  .test-surface {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    height: 100%;
  }

  .surface-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .surface-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.45px;
    color: #D7D7D7;
  }

  .surface-subtitle {
    font-size: 11px;
    color: #8A8A8A;
  }

  .surface-stage {
    position: relative;
    flex: 1;
    min-height: 240px;
    overflow: hidden;
    border: 1px solid #2D2D2D;
    border-radius: 10px;
    background:
      radial-gradient(circle at top, rgba(91, 155, 213, 0.12), transparent 42%),
      linear-gradient(180deg, #1C1C1C 0%, #161616 100%);
  }

  .stage-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 18px 18px;
    pointer-events: none;
  }

  .preview-scene {
    position: absolute;
  }

  .test-hitbox {
    position: absolute;
    inset: 0;
    outline: none;
    cursor: pointer;
  }

  .test-hitbox.disabled {
    cursor: not-allowed;
  }

  .test-hitbox.keyboard-focus::after {
    content: '';
    position: absolute;
    inset: -6px;
    border: 1px solid rgba(91, 155, 213, 0.6);
    border-radius: 12px;
    pointer-events: none;
  }

  .surface-overlay,
  .surface-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    text-align: center;
    color: #7C7C7C;
    font-size: 12px;
    pointer-events: none;
  }

  .surface-overlay {
    background: rgba(15, 15, 15, 0.55);
    color: #B4B4B4;
  }
</style>
