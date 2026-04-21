<script>
  import { onDestroy } from 'svelte';
  import CanvasControl from '../editor/CanvasControl.svelte';
  import { deepClone } from '../utils/deepClone.js';
  import { getNextEnumValue } from '../utils/enumBehavior.js';
  import {
    adjustRangeValue,
    getCurrentRangeValue,
    getRangeMax,
    getRangeMin,
    isRangeBehavior,
    isRangeTextInputKey,
    isSliderRangeBehavior,
    normalizedRangePointerValue,
    parseRangeInputValue,
    resolveRangeDisplayValue,
    resolveRangeZone,
    scrubRangeValue,
    snapRangeValue,
  } from '../utils/rangeBehavior.js';

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
  let pointerDownPoint = $state({ x: 0, y: 0 });
  let pointerDownZone = $state('');
  let pointerStartValue = $state(0);
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
    if (behavior.family === 'range') {
      return isSliderRangeBehavior(behavior)
        ? 'Drag across the control to test slider travel.'
        : 'Click the step buttons, type a value, or scrub-drag to test range behavior.';
    }
    if (behavior.family === 'select') return 'Hover, press, and click to test selection behavior.';
    return 'Hover and press to test the configured states.';
  });
  let previewRole = $derived.by(() => {
    if (!behavior) return 'button';
    if (behavior.family === 'range') return isSliderRangeBehavior(behavior) ? 'slider' : 'spinbutton';
    if (behavior.role === 'radio' || behavior.role === 'segmented') return 'radio';
    if (behavior.role === 'toggle' || behavior.role === 'checkbox') return 'checkbox';
    return 'button';
  });

  function removeWindowListeners() {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
  }

  onDestroy(removeWindowListeners);

  function isRangeControl() {
    return isRangeBehavior(behavior);
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
    return getCurrentRangeValue(behavior, session);
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
      const nextValue = getNextEnumValue(values, currentValue, behavior?.wrapEnum === true);
      patchSession({
        valueOverrideEnabled: true,
        valueOverride: nextValue,
      });
      return;
    }

    patchSession({
      checked: !currentBoolValue(),
      mixed: false,
      valueOverrideEnabled: false,
    });
  }

  function clearRangeInput() {
    patchSession({
      valueInputActive: false,
      valueInputBuffer: '',
    });
  }

  function beginRangeFieldEdit() {
    patchSession({
      focused: true,
      hover: true,
      valueInputActive: true,
      valueInputBuffer: resolveRangeDisplayValue(behavior, session),
    });
  }

  function commitRangeFieldInput() {
    const rawValue = session?.valueInputActive === true
      ? String(session?.valueInputBuffer ?? '')
      : resolveRangeDisplayValue(behavior, session);
    const parsed = parseRangeInputValue(behavior, rawValue);

    patchSession({
      valueInputActive: false,
      valueInputBuffer: '',
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
  }

  function handleRangeFieldInput(event) {
    event.stopPropagation();
    const rawValue = String(event?.currentTarget?.value ?? '');
    const parsed = parseRangeInputValue(behavior, rawValue);
    patchSession({
      valueInputActive: true,
      valueInputBuffer: rawValue,
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
  }

  function handleRangeFieldKeyDown(event) {
    event.stopPropagation();

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      adjustRangeFromKey(event.key);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitRangeFieldInput();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      clearRangeInput();
    }
  }

  function handleRangeFieldFocus(event) {
    event.stopPropagation();
    beginRangeFieldEdit();
  }

  function handleRangeFieldBlur(event) {
    event.stopPropagation();
    commitRangeFieldInput();
    patchSession({
      focused: false,
      pressed: false,
      dragging: false,
    });
  }

  function setRangeValue(nextValue, extraPatch = {}) {
    patchSession({
      valueOverrideEnabled: true,
      valueOverride: snapRangeValue(behavior, nextValue),
      valueInputActive: false,
      valueInputBuffer: '',
      ...extraPatch,
    });
  }

  function updateSliderRangeFromPointer(event) {
    if (!isRangeControl()) return;
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return;

    const min = getRangeMin(behavior);
    const max = getRangeMax(behavior);
    const normalized = normalizedRangePointerValue(behavior, rect, event.clientX, event.clientY);
    setRangeValue(min + ((max - min) * normalized));
  }

  function updateScrubRangeFromPointer(event) {
    if (!isRangeControl()) return;
    setRangeValue(
      scrubRangeValue(behavior, pointerStartValue, pointerDownPoint, { x: event.clientX, y: event.clientY }),
      { dragging: true }
    );
  }

  function maybeStartRangeDrag(event) {
    if (!isRangeControl() || draggingRange || isSliderRangeBehavior(behavior) || behavior?.dragEnabled !== true) return false;

    const dx = Math.abs(event.clientX - pointerDownPoint.x);
    const dy = Math.abs(event.clientY - pointerDownPoint.y);
    if (Math.max(dx, dy) < 5) return false;

    draggingRange = true;
    patchSession({ dragging: true });
    return true;
  }

  function handleRangePointerClick(event) {
    const rect = hitboxElement?.getBoundingClientRect?.();
    if (!rect) return;

    const zone = resolveRangeZone(behavior, rect, event.clientX, event.clientY);
    if (zone !== pointerDownZone) return;

    if (zone === 'decrement') {
      setRangeValue(adjustRangeValue(behavior, currentRangeValue(), -1));
    } else if (zone === 'increment') {
      setRangeValue(adjustRangeValue(behavior, currentRangeValue(), 1));
    }
  }

  function adjustRangeFromKey(key) {
    if (!isRangeControl()) return;

    let nextValue = currentRangeValue();

    switch (key) {
      case 'Home':
        nextValue = getRangeMin(behavior);
        break;
      case 'End':
        nextValue = getRangeMax(behavior);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        nextValue = adjustRangeValue(behavior, nextValue, -1);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        nextValue = adjustRangeValue(behavior, nextValue, 1);
        break;
      default:
        return;
    }

    setRangeValue(nextValue);
  }

  function handleRangeTextInput(key) {
    const currentBuffer = session?.valueInputActive === true ? String(session?.valueInputBuffer ?? '') : '';

    if (key === 'Escape') {
      clearRangeInput();
      return true;
    }

    if (key === 'Enter') {
      const parsed = parseRangeInputValue(behavior, currentBuffer);
      patchSession({
        valueInputActive: false,
        valueInputBuffer: '',
        ...(parsed === null ? {} : {
          valueOverrideEnabled: true,
          valueOverride: parsed,
        }),
      });
      return true;
    }

    let nextBuffer = currentBuffer;
    if (key === 'Backspace') {
      nextBuffer = currentBuffer.slice(0, -1);
    } else if (key === 'Delete') {
      nextBuffer = '';
    } else if (isRangeTextInputKey(key)) {
      nextBuffer = `${currentBuffer}${key}`;
    } else {
      return false;
    }

    const parsed = parseRangeInputValue(behavior, nextBuffer);
    patchSession({
      valueInputActive: true,
      valueInputBuffer: nextBuffer,
      ...(parsed === null ? {} : {
        valueOverrideEnabled: true,
        valueOverride: parsed,
      }),
    });
    return true;
  }

  function handleWheel(event) {
    if (!isRangeControl() || behavior?.wheelEnabled !== true || isDisabled) return;

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setRangeValue(adjustRangeValue(behavior, currentRangeValue(), direction), {
      hover: true,
      focused: true,
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
    pointerDownPoint = { x: event.clientX, y: event.clientY };
    pointerStartValue = currentRangeValue();
    draggingRange = isRangeControl() && isSliderRangeBehavior(behavior);
    pointerDownZone = isRangeControl()
      ? resolveRangeZone(behavior, hitboxElement?.getBoundingClientRect?.(), event.clientX, event.clientY)
      : '';
    patchSession({
      hover: true,
      pressed: true,
      dragging: draggingRange,
    });
    if (draggingRange) {
      updateSliderRangeFromPointer(event);
    }
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerMove(event) {
    if (!pointerActive || isDisabled || !isRangeControl()) return;

    if (isSliderRangeBehavior(behavior)) {
      if (!draggingRange) return;
      updateSliderRangeFromPointer(event);
      return;
    }

    if (maybeStartRangeDrag(event)) {
      updateScrubRangeFromPointer(event);
      return;
    }

    if (draggingRange) {
      updateScrubRangeFromPointer(event);
    }
  }

  function handleWindowPointerUp(event) {
    if (!pointerActive) return;
    const inside = isPointInsideHitbox(event.clientX, event.clientY);

    if (!draggingRange && inside && !isDisabled) {
      if (isRangeControl() && !isSliderRangeBehavior(behavior)) {
        handleRangePointerClick(event);
      } else if (String(behavior?.family ?? 'trigger') === 'select') {
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
    pointerDownZone = '';
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
    patchSession({ focused: false, pressed: false, dragging: false, valueInputActive: false });
    pointerActive = false;
    draggingRange = false;
    removeWindowListeners();
  }

  function handleKeyDown(event) {
    if (isDisabled) return;
    lastInputMode = 'keyboard';
    keyboardFocusActive = true;

    if (!event.ctrlKey && !event.metaKey && !event.altKey && isRangeControl()) {
      if (handleRangeTextInput(event.key)) {
        event.preventDefault();
        hitboxElement?.focus?.();
        patchSession({ focused: true, hover: true });
        return;
      }
    }

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
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          bind:this={hitboxElement}
          class="test-hitbox"
          class:disabled={session?.disabled === true}
          class:keyboard-focus={keyboardFocusActive}
          role={previewRole}
          aria-label="Interactive preview surface"
          aria-disabled={session?.disabled === true}
          aria-valuenow={isRangeControl() ? currentRangeValue() : undefined}
          aria-valuemin={isRangeControl() ? getRangeMin(behavior) : undefined}
          aria-valuemax={isRangeControl() ? getRangeMax(behavior) : undefined}
          aria-valuetext={isRangeControl() ? resolveRangeDisplayValue(behavior, session) : undefined}
          tabindex={isDisabled ? undefined : 0}
          onpointerenter={handlePointerEnter}
          onpointerleave={handlePointerLeave}
          onpointerdown={handlePointerDown}
          onwheel={handleWheel}
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
            previewValueField={previewRole === 'spinbutton' ? {
              value: resolveRangeDisplayValue(behavior, session),
              disabled: isDisabled,
              inputMode: String(behavior?.valueType ?? '') === 'int' ? 'numeric' : 'decimal',
              ariaLabel: `${control?._children?.Core?.name ?? control?._children?.Core?.controlType ?? 'Range'} value`,
              tabIndex: -1,
            } : null}
            onpreviewvaluefieldinput={handleRangeFieldInput}
            onpreviewvaluefieldkeydown={handleRangeFieldKeyDown}
            onpreviewvaluefieldfocus={handleRangeFieldFocus}
            onpreviewvaluefieldblur={handleRangeFieldBlur}
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
