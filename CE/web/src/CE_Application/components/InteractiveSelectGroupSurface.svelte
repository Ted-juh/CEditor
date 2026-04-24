<script>
  import { onDestroy } from 'svelte';
  import CanvasControl from '../editor/CanvasControl.svelte';
  import { deepClone } from '../utils/deepClone.js';

  let {
    controls = [],
    sessionsById = {},
    selectedControlId = '',
    onpatchcontrolsession = null,
    oncommitselect = null,
  } = $props();

  const SURFACE_PADDING = 24;
  const MAX_PREVIEW_SCALE = 2.75;

  let stageWidth = $state(0);
  let stageHeight = $state(0);
  let pointerActiveControlId = $state('');
  let pointerActiveElement = $state(null);
  let keyboardFocusControlId = $state('');
  let lastInputMode = $state('pointer');

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getControlId(control) {
    return String(control?._children?.Core?.id ?? '');
  }

  function getBehavior(control) {
    return control?._children?.Behavior ?? null;
  }

  function createFallbackSession(control) {
    const behavior = getBehavior(control);
    return {
      enabled: true,
      hover: false,
      pressed: false,
      focused: false,
      dragging: false,
      disabled: false,
      pending: false,
      executed: false,
      checked: behavior?.defaultValue === true,
      mixed: false,
      valueOverrideEnabled: false,
      valueOverride: 0,
      animationsEnabled: true,
      autoDebug: false,
    };
  }

  function sessionFor(control) {
    const controlId = getControlId(control);
    return sessionsById?.[controlId] ?? createFallbackSession(control);
  }

  function isDisabled(control) {
    const session = sessionFor(control);
    return session?.enabled === false || session?.disabled === true;
  }

  function patchControlSession(controlId, patch = {}) {
    onpatchcontrolsession?.(controlId, patch);
  }

  let previewEntries = $derived.by(() => {
    if (!Array.isArray(controls) || controls.length === 0) return [];

    let minX = Infinity;
    let minY = Infinity;
    const rawEntries = controls.map((control) => {
      const transform = control?._children?.Transform ?? null;
      const x = numberOr(transform?.x, 0);
      const y = numberOr(transform?.y, 0);
      const width = Math.max(24, numberOr(transform?.width, 100));
      const height = Math.max(24, numberOr(transform?.height, 40));
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);

      const previewControl = deepClone(control);
      if (previewControl?._children?.Transform) {
        previewControl._children.Transform.x = 0;
        previewControl._children.Transform.y = 0;
      }

      return {
        id: getControlId(control),
        control,
        previewControl,
        behavior: getBehavior(control),
        x,
        y,
        width,
        height,
      };
    });

    return rawEntries.map((entry) => ({
      ...entry,
      localX: entry.x - minX,
      localY: entry.y - minY,
    }));
  });

  let previewControls = $derived.by(() => previewEntries.map((entry) => entry.previewControl));
  let groupWidth = $derived.by(() =>
    previewEntries.reduce((max, entry) => Math.max(max, entry.localX + entry.width), 0)
  );
  let groupHeight = $derived.by(() =>
    previewEntries.reduce((max, entry) => Math.max(max, entry.localY + entry.height), 0)
  );
  let fitScale = $derived.by(() => {
    if (!stageWidth || !stageHeight || !groupWidth || !groupHeight) return 1;
    const usableWidth = Math.max(1, stageWidth - (SURFACE_PADDING * 2));
    const usableHeight = Math.max(1, stageHeight - (SURFACE_PADDING * 2));
    return clamp(
      Math.min(usableWidth / groupWidth, usableHeight / groupHeight, MAX_PREVIEW_SCALE),
      0.25,
      MAX_PREVIEW_SCALE,
    );
  });
  let sceneWidth = $derived(groupWidth * fitScale);
  let sceneHeight = $derived(groupHeight * fitScale);
  let sceneLeft = $derived(Math.max(SURFACE_PADDING, (stageWidth - sceneWidth) / 2));
  let sceneTop = $derived(Math.max(SURFACE_PADDING, (stageHeight - sceneHeight) / 2));
  let previewRenderIdNamespace = $derived(`interaction-preview-group-${selectedControlId || 'controls'}`);
  let helperLabel = $derived.by(() => {
    const count = previewEntries.length;
    if (count <= 1) return 'Click the control to test its selection state.';
    return `Click any option in this ${count}-item group to test exclusive selection.`;
  });

  function removeWindowListeners() {
    window.removeEventListener('pointerup', handleWindowPointerUp);
  }

  onDestroy(removeWindowListeners);

  function isPointInsideActiveHitbox(clientX, clientY) {
    const rect = pointerActiveElement?.getBoundingClientRect?.();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function commitSelection(controlId) {
    oncommitselect?.(controlId);
  }

  function handlePointerEnter(control) {
    if (isDisabled(control)) return;
    patchControlSession(getControlId(control), { hover: true });
  }

  function handlePointerLeave(control) {
    if (isDisabled(control)) return;
    const controlId = getControlId(control);
    if (pointerActiveControlId === controlId) {
      patchControlSession(controlId, { hover: false });
      return;
    }

    patchControlSession(controlId, { hover: false, pressed: false });
  }

  function handlePointerDown(control, event) {
    if (isDisabled(control)) return;
    event.preventDefault();
    lastInputMode = 'pointer';
    keyboardFocusControlId = '';
    pointerActiveControlId = getControlId(control);
    pointerActiveElement = event.currentTarget;

    patchControlSession(pointerActiveControlId, {
      hover: true,
      pressed: true,
      focused: false,
    });

    window.addEventListener('pointerup', handleWindowPointerUp);
  }

  function handleWindowPointerUp(event) {
    if (!pointerActiveControlId) return;
    const activeId = pointerActiveControlId;
    const activeControl = previewEntries.find((entry) => entry.id === activeId)?.control ?? null;
    const inside = isPointInsideActiveHitbox(event.clientX, event.clientY);

    if (inside && activeControl && !isDisabled(activeControl)) {
      commitSelection(activeId);
    }

    patchControlSession(activeId, {
      hover: inside,
      pressed: false,
    });

    pointerActiveControlId = '';
    pointerActiveElement = null;
    removeWindowListeners();
  }

  function handleFocus(control) {
    if (isDisabled(control)) return;
    if (lastInputMode !== 'keyboard') return;

    const controlId = getControlId(control);
    keyboardFocusControlId = controlId;
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
    });

    if (pointerActiveControlId === controlId) {
      pointerActiveControlId = '';
      pointerActiveElement = null;
      removeWindowListeners();
    }
  }

  function handleKeyDown(control, event) {
    if (isDisabled(control)) return;

    const controlId = getControlId(control);
    lastInputMode = 'keyboard';
    keyboardFocusControlId = controlId;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget?.focus?.();
      patchControlSession(controlId, {
        focused: true,
        hover: true,
        pressed: true,
      });
    }
  }

  function handleKeyUp(control, event) {
    if (isDisabled(control)) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;

    event.preventDefault();
    const controlId = getControlId(control);
    commitSelection(controlId);
    patchControlSession(controlId, {
      focused: true,
      hover: true,
      pressed: false,
    });
  }

  function previewRole(entry) {
    const role = String(entry?.behavior?.role ?? '').trim().toLowerCase();
    if (role === 'radio' || role === 'segmented') return 'radio';
    return 'button';
  }
</script>

<div class="test-surface">
  <div class="surface-header">
    <div class="surface-title">Live Group Surface</div>
    <div class="surface-subtitle">{helperLabel}</div>
  </div>

  <div class="surface-stage" bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}>
    {#if previewEntries.length}
      <div class="stage-grid"></div>
      <div
        class="preview-scene"
        style="left:{sceneLeft}px; top:{sceneTop}px; width:{groupWidth}px; height:{groupHeight}px; transform:scale({fitScale}); transform-origin:top left;"
      >
        {#each previewEntries as entry (entry.id)}
          <div
            class="group-hitbox-shell"
            style="left:{entry.localX}px; top:{entry.localY}px; width:{entry.width}px; height:{entry.height}px;"
          >
            <button
              type="button"
              class="test-hitbox"
              class:disabled={isDisabled(entry.control)}
              class:keyboard-focus={keyboardFocusControlId === entry.id}
              class:selected-preview={selectedControlId === entry.id}
              role={previewRole(entry)}
              aria-label="Interactive preview surface"
              aria-disabled={isDisabled(entry.control)}
              aria-checked={previewRole(entry) === 'radio' ? sessionFor(entry.control).checked === true : undefined}
              tabindex={isDisabled(entry.control) ? undefined : 0}
              onpointerenter={() => handlePointerEnter(entry.control)}
              onpointerleave={() => handlePointerLeave(entry.control)}
              onpointerdown={(event) => handlePointerDown(entry.control, event)}
              onfocus={() => handleFocus(entry.control)}
              onblur={() => handleBlur(entry.control)}
              onkeydown={(event) => handleKeyDown(entry.control, event)}
              onkeyup={(event) => handleKeyUp(entry.control, event)}
            >
              <CanvasControl
                control={entry.previewControl}
                scale={1}
                renderIdNamespace={previewRenderIdNamespace}
                panelLocked={false}
                allControls={previewControls}
                editorInteractionEnabled={false}
                previewSessionOverride={sessionFor(entry.control)}
              />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="surface-empty">Select a grouped control to test it here.</div>
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

  .group-hitbox-shell {
    position: absolute;
  }

  .test-hitbox {
    position: absolute;
    inset: 0;
    outline: none;
    cursor: pointer;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .test-hitbox.disabled {
    cursor: not-allowed;
  }

  .test-hitbox.keyboard-focus::after,
  .test-hitbox.selected-preview::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 12px;
    pointer-events: none;
  }

  .test-hitbox.keyboard-focus::after {
    border: 1px solid rgba(91, 155, 213, 0.6);
  }

  .test-hitbox.selected-preview::before {
    border: 1px dashed rgba(255, 196, 84, 0.65);
  }

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
</style>
