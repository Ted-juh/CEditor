<script>
  import { onDestroy } from 'svelte';
  import CanvasControl from './CanvasControl.svelte';
  import GuideLines from './GuideLines.svelte';
  import { showGuides } from '../stores/editorView.js';
  import { showPreviewSelectionRing } from '../stores/runtimePreferences.js';
  import {
    panelPreviewSessions,
    previewInspectedControlId,
    createInteractionPreviewSession,
    updatePanelPreviewSession,
    commitPanelPreviewSelectAction,
    setPreviewInspectedControlId,
  } from '../stores/interactionPreview.js';
  import { sortControlsForRender } from '../utils/controlOrder.js';

  let {
    panel,
    scale = 1,
    bgLayers = {},
    gridStyle = '',
    surfaceRef = $bindable(null),
  } = $props();

  const DEFAULT_LAYER_ORDER = ['solid', 'gradient', 'image', 'texture'];

  let orderedControls = $derived(sortControlsForRender(panel?.controls ?? []));
  let previewRenderIdNamespace = $derived(`panel-preview-${panel?.id ?? 'panel'}`);

  let pointerActiveControlId = $state('');
  let pointerActiveElement = $state(null);
  let draggingRange = $state(false);
  let keyboardFocusControlId = $state('');
  let lastInputMode = $state('pointer');

  function bindSurface(node) {
    surfaceRef = node;

    return {
      destroy() {
        if (surfaceRef === node) surfaceRef = null;
      },
    };
  }

  function getControlId(control) {
    return String(control?._children?.Core?.id ?? '');
  }

  function getBehavior(control) {
    return control?._children?.Behavior ?? null;
  }

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sessionFor(control) {
    const controlId = getControlId(control);
    return $panelPreviewSessions?.[controlId] ?? createInteractionPreviewSession(control);
  }

  function isDisabled(control) {
    const session = sessionFor(control);
    return session?.enabled === false
      || session?.disabled === true
      || control?._children?.Core?.enabled === false;
  }

  function isRangeControl(control) {
    return String(getBehavior(control)?.family ?? '') === 'range';
  }

  function currentRangeValue(control) {
    const behavior = getBehavior(control);
    const session = sessionFor(control);
    if (session?.valueOverrideEnabled === true) {
      return numberOr(session?.valueOverride, numberOr(behavior?.defaultValue, numberOr(behavior?.min, 0)));
    }
    return numberOr(behavior?.defaultValue, numberOr(behavior?.min, 0));
  }

  function patchControlSession(controlId, patch = {}) {
    updatePanelPreviewSession(controlId, patch);
  }

  function snapRangeValue(control, rawValue) {
    const behavior = getBehavior(control);
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

  function isPointInsideActiveHitbox(clientX, clientY) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function normalizedFromPointerEvent(control, event) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return 0;

    const behavior = getBehavior(control);
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

  function updateRangeFromPointer(control, event) {
    if (!isRangeControl(control)) return;
    const behavior = getBehavior(control);
    const min = numberOr(behavior?.min, 0);
    const max = numberOr(behavior?.max, 1);
    const normalized = normalizedFromPointerEvent(control, event);
    const nextValue = snapRangeValue(control, min + ((max - min) * normalized));
    patchControlSession(getControlId(control), {
      valueOverrideEnabled: true,
      valueOverride: nextValue,
    });
  }

  function adjustRangeFromKey(control, key) {
    if (!isRangeControl(control)) return;

    const behavior = getBehavior(control);
    const min = numberOr(behavior?.min, 0);
    const max = numberOr(behavior?.max, 1);
    const fallbackStep = String(behavior?.valueType ?? '') === 'int' ? 1 : 0.01;
    const step = Math.max(numberOr(behavior?.step, fallbackStep), fallbackStep);
    let nextValue = currentRangeValue(control);

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

    patchControlSession(getControlId(control), {
      valueOverrideEnabled: true,
      valueOverride: snapRangeValue(control, nextValue),
    });
  }

  function removeWindowListeners() {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
  }

  onDestroy(removeWindowListeners);

  function handlePointerEnter(control) {
    if (isDisabled(control)) return;
    const controlId = getControlId(control);
    setPreviewInspectedControlId(controlId);
    patchControlSession(controlId, { hover: true });
  }

  function handlePointerLeave(control) {
    if (isDisabled(control)) return;
    const controlId = getControlId(control);
    if (pointerActiveControlId === controlId) {
      patchControlSession(controlId, { hover: false });
      return;
    }

    patchControlSession(controlId, {
      hover: false,
      pressed: false,
      dragging: false,
    });
  }

  function handlePointerDown(control, event) {
    if (event.button !== 0) return;
    if (isDisabled(control)) return;

    event.preventDefault();
    event.currentTarget?.focus?.();
    lastInputMode = 'pointer';
    keyboardFocusControlId = '';
    pointerActiveControlId = getControlId(control);
    pointerActiveElement = event.currentTarget;
    draggingRange = isRangeControl(control);
    setPreviewInspectedControlId(pointerActiveControlId);

    patchControlSession(pointerActiveControlId, {
      hover: true,
      pressed: true,
      focused: false,
      dragging: draggingRange,
    });

    if (draggingRange) {
      updateRangeFromPointer(control, event);
    }

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerMove(event) {
    if (!pointerActiveControlId || !draggingRange) return;
    const activeControl = orderedControls.find((control) => getControlId(control) === pointerActiveControlId) ?? null;
    if (!activeControl || isDisabled(activeControl)) return;
    updateRangeFromPointer(activeControl, event);
  }

  function handleWindowPointerUp(event) {
    if (!pointerActiveControlId) return;

    const activeId = pointerActiveControlId;
    const activeControl = orderedControls.find((control) => getControlId(control) === activeId) ?? null;
    const inside = isPointInsideActiveHitbox(event.clientX, event.clientY);

    if (!draggingRange && inside && activeControl && !isDisabled(activeControl)) {
      if (String(getBehavior(activeControl)?.family ?? 'trigger') === 'select') {
        commitPanelPreviewSelectAction(activeId);
      }
    }

    patchControlSession(activeId, {
      hover: inside,
      pressed: false,
      dragging: false,
    });

    pointerActiveControlId = '';
    pointerActiveElement = null;
    draggingRange = false;
    removeWindowListeners();
  }

  function handleFocus(control) {
    if (isDisabled(control)) return;
    if (lastInputMode !== 'keyboard') return;

    const controlId = getControlId(control);
    keyboardFocusControlId = controlId;
    setPreviewInspectedControlId(controlId);
    patchControlSession(controlId, { focused: true });
  }

  function handleBlur(control) {
    const controlId = getControlId(control);

    if (keyboardFocusControlId === controlId) {
      keyboardFocusControlId = '';
    }

    patchControlSession(controlId, {
      focused: false,
      pressed: false,
      dragging: false,
    });

    if (pointerActiveControlId === controlId) {
      pointerActiveControlId = '';
      pointerActiveElement = null;
      draggingRange = false;
      removeWindowListeners();
    }
  }

  function handleKeyDown(control, event) {
    if (isDisabled(control)) return;

    const controlId = getControlId(control);
    lastInputMode = 'keyboard';
    keyboardFocusControlId = controlId;
    setPreviewInspectedControlId(controlId);

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget?.focus?.();
      patchControlSession(controlId, {
        focused: true,
        hover: true,
        pressed: true,
      });
      return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      if (!isRangeControl(control)) return;
      event.preventDefault();
      event.currentTarget?.focus?.();
      patchControlSession(controlId, {
        focused: true,
        hover: true,
      });
      adjustRangeFromKey(control, event.key);
    }
  }

  function handleKeyUp(control, event) {
    if (isDisabled(control)) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;

    event.preventDefault();
    const controlId = getControlId(control);
    if (String(getBehavior(control)?.family ?? 'trigger') === 'select') {
      commitPanelPreviewSelectAction(controlId);
    }
    patchControlSession(controlId, {
      focused: true,
      hover: true,
      pressed: false,
    });
  }

  function previewRoleFor(control) {
    const behavior = getBehavior(control);
    const family = String(behavior?.family ?? 'trigger');
    const role = String(behavior?.role ?? '').trim().toLowerCase();

    if (family === 'range') return 'slider';
    if (role === 'radio' || role === 'segmented') return 'radio';
    if (role === 'toggle' || role === 'checkbox') return 'checkbox';
    return 'button';
  }

  function previewAriaCheckedFor(control) {
    const role = previewRoleFor(control);
    if (role !== 'radio' && role !== 'checkbox') return undefined;
    return sessionFor(control)?.checked === true;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="panel-surface preview-surface"
  style="width: {panel.width}px; height: {panel.height}px; transform: scale({scale}); transform-origin: 0 0;"
  use:bindSurface
>
  {#each panel.bgLayerOrder ?? DEFAULT_LAYER_ORDER as layerId}
    {#if bgLayers[layerId]}
      <div class="bg-layer" style={bgLayers[layerId]}></div>
    {/if}
  {/each}

  {#if gridStyle}
    <div class="grid-overlay" style={gridStyle}></div>
  {/if}

  {#if $showGuides}
    <GuideLines {scale} panelWidth={panel.width} panelHeight={panel.height} />
  {/if}

  {#each orderedControls as control (control._children?.Core?.id)}
    <CanvasControl
      {control}
      {scale}
      panelLocked={false}
      allControls={orderedControls}
      panelWidth={panel.width}
      panelHeight={panel.height}
      editorInteractionEnabled={false}
      previewSessionOverride={sessionFor(control)}
      renderIdNamespace={previewRenderIdNamespace}
      previewRole={previewRoleFor(control)}
      previewTabIndex={isDisabled(control) ? undefined : 0}
      previewAriaLabel={`${control?._children?.Core?.name ?? control?._children?.Core?.controlType ?? 'Control'} preview`}
      previewAriaDisabled={isDisabled(control)}
      previewAriaChecked={previewAriaCheckedFor(control)}
      previewAriaValueNow={previewRoleFor(control) === 'slider' ? currentRangeValue(control) : undefined}
      previewAriaValueMin={previewRoleFor(control) === 'slider' ? numberOr(getBehavior(control)?.min, 0) : undefined}
      previewAriaValueMax={previewRoleFor(control) === 'slider' ? numberOr(getBehavior(control)?.max, 1) : undefined}
      previewKeyboardFocus={keyboardFocusControlId === getControlId(control)}
      previewHighlighted={$showPreviewSelectionRing && $previewInspectedControlId === getControlId(control)}
      onpreviewpointerenter={() => handlePointerEnter(control)}
      onpreviewpointerleave={() => handlePointerLeave(control)}
      onpreviewpointerdown={(event) => handlePointerDown(control, event)}
      onpreviewfocus={() => handleFocus(control)}
      onpreviewblur={() => handleBlur(control)}
      onpreviewkeydown={(event) => handleKeyDown(control, event)}
      onpreviewkeyup={(event) => handleKeyUp(control, event)}
    />
  {/each}
</div>

<style>
  .panel-surface {
    position: relative;
    border: 1px solid #444;
    border-radius: 2px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    flex-shrink: 0;
    overflow: hidden;
  }

  .preview-surface {
    cursor: default;
  }

  .bg-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }
</style>
