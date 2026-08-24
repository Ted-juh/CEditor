<script>
  /**
   * GradientSettings — Sidebar for gradient type, angle/position,
   * shape, edge mode, and stops list.
   */
  import X from 'lucide-svelte/icons/x';
  import Plus from 'lucide-svelte/icons/plus';
  import Circle from 'lucide-svelte/icons/circle';
  import Square from 'lucide-svelte/icons/square';
  import RectangleHorizontal from 'lucide-svelte/icons/rectangle-horizontal';
  import Triangle from 'lucide-svelte/icons/triangle';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Crosshair from 'lucide-svelte/icons/crosshair';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { addStopInLargestGap, updateStopAt, deleteStopAt } from '../utils/gradientStops.js';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
  import { deriveProxyGeometry, proxyShapeKind } from '../utils/gradientProxyGeometry.js';
  import { gradientShapeOverride, setGradientShapeOverride, clearGradientShapeOverride } from '../stores/gradientProxyShape.js';
  import { gradientTarget } from '../stores/gradientTarget.js';
  import { activePanel } from '../stores/panels.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import StopColourPopover from './StopColourPopover.svelte';
  import { beginStopEdit, previewStopColour, commitStopEdit, cancelStopEdit } from '../utils/stopColourEdit.js';

  const SECTION_ORDER_STORAGE_KEY = 'ce.gradientSettings.sectionOrder.v1';
  const DEFAULT_SECTION_ORDER = ['type', 'geometry', 'shape', 'edge', 'stops', 'presets'];

  let props = $props();
  let gradient = $derived(props.gradient);
  let selectedStop = $derived(props.selectedStop ?? 0);

  // --- Proxy shape (B7) ---------------------------------------------------
  // The shape of the preview is the shape of the TARGET, unless the user has
  // deliberately overridden it. `props.shape` is still accepted and still
  // reported back through `onShapeChange`, but it is no longer what decides:
  // its default is the string 'rectangle', so a prop could never distinguish
  // "the user chose a rectangle" from "nobody has chosen anything", which is
  // exactly how the preview ended up permanently rectangular.
  let proxyGeometry = $derived(deriveProxyGeometry($gradientTarget, $activePanel));
  let autoShape = $derived($gradientShapeOverride == null);
  let shape = $derived($gradientShapeOverride ?? proxyShapeKind(proxyGeometry));

  function chooseShape(next) {
    setGradientShapeOverride(next);
    onShapeChange?.(next);
  }

  function chooseAutoShape() {
    clearGradientShapeOverride();
    // The parent still keeps a `shape` string for the previews that have not
    // been taught about the override store (the Colors tab's stop mini-preview
    // is one), so hand it the closest name for the geometry we just derived.
    onShapeChange?.(proxyShapeKind(proxyGeometry));
  }
  let onchange = $derived(props.onchange);
  let onSelectStop = $derived(props.onSelectStop);
  let onEditStopColor = $derived(props.onEditStopColor);
  let onShapeChange = $derived(props.onShapeChange);
  let gradientSwatches = $derived(props.gradientSwatches ?? []);
  let onGradientPresetClick = $derived(props.onGradientPresetClick);
  let onGradientPresetDblClick = $derived(props.onGradientPresetDblClick);
  let onGradientPresetRightClick = $derived(props.onGradientPresetRightClick);
  let sectionOrder = $state(sanitizeSectionOrder(readStoredJson(SECTION_ORDER_STORAGE_KEY, DEFAULT_SECTION_ORDER)));

  // --- Helpers ---

  function update(changes) {
    onchange({ ...gradient, ...changes });
  }

  function updateStop(index, changes) {
    onchange({ ...gradient, stops: updateStopAt(gradient.stops, index, changes) });
  }

  function deleteStop(index) {
    const result = deleteStopAt(gradient.stops, index);
    if (!result) return;
    onchange({ ...gradient, stops: result.stops });
    onSelectStop?.(result.newIndex);
  }

  function addStop() {
    const result = addStopInLargestGap(gradient.stops);
    onchange({ ...gradient, stops: result.stops });
    onSelectStop?.(result.newIndex);
  }

  // --- In-place stop colour editing (B5) ---------------------------------
  // The chip used to hand the whole dock over to the Colors tab and back —
  // two full-panel transitions to change one stop. It now opens the chooser
  // under the row instead, inside the scrolling sidebar so nothing can clip
  // it, and the gradient stays on screen the whole time. The old cross-tab
  // flow is still one click away on the ↗ button, because the Colors tab has
  // room for the full chooser and this row does not.
  //
  // Unlike the editor's popover, edits here are emitted as they happen: this
  // component holds no live copy of the stops, so the preview next to it can
  // only follow if the change goes out. Abandonment still commits, which is
  // the same rule from the outside.
  // `stopEdit` is the record from utils/stopColourEdit.js: { index, original }.
  let stopEdit = $state(null);
  let editingStopIndex = $derived(stopEdit ? stopEdit.index : null);

  function openStopEditor(index) {
    const edit = beginStopEdit(gradient.stops, index);
    if (!edit) return;
    onSelectStop?.(index);
    stopEdit = edit;
  }

  function handleStopColourInput(colour) {
    onchange({ ...gradient, stops: previewStopColour(gradient.stops, stopEdit, colour) });
  }

  function handleStopColourCommit(colour) {
    const result = commitStopEdit(gradient.stops, stopEdit, colour);
    onchange({ ...gradient, stops: result.stops });
    stopEdit = result.edit;
  }

  function handleStopColourCancel() {
    const result = cancelStopEdit(gradient.stops, stopEdit);
    onchange({ ...gradient, stops: result.stops });
    stopEdit = result.edit;
  }

  // Contextual controls based on gradient type
  let showAngle = $derived(['linear', 'linearRamp', 'conical', 'reflected', 'duotone', 'tricolor', 'banding'].includes(gradient.type));
  let showCenter = $derived(['radial', 'conical', 'radialRamp', 'squareRamp', 'mesh', 'volumeMesh'].includes(gradient.type));
  let showRadius = $derived(['radial', 'radialRamp', 'linearRamp', 'squareRamp'].includes(gradient.type));

  let sortedStops = $derived([...gradient.stops]
    .map((s, origIdx) => ({ ...s, origIdx }))
    .sort((a, b) => a.position - b.position));
  let visibleSectionOrder = $derived(sectionOrder.filter((id) => id !== 'geometry' || showAngle || showCenter || showRadius));

  $effect(() => {
    writeStoredJson(SECTION_ORDER_STORAGE_KEY, sectionOrder);
  });

  function sanitizeSectionOrder(value) {
    const source = Array.isArray(value) ? value : DEFAULT_SECTION_ORDER;
    const known = new Set(DEFAULT_SECTION_ORDER);
    const ordered = source.filter((id) => known.has(id));
    return [
      ...ordered,
      ...DEFAULT_SECTION_ORDER.filter((id) => !ordered.includes(id)),
    ];
  }

  function canMoveSection(id, direction) {
    const visibleIndex = visibleSectionOrder.indexOf(id);
    if (visibleIndex < 0) return false;
    const targetIndex = visibleIndex + direction;
    return targetIndex >= 0 && targetIndex < visibleSectionOrder.length;
  }

  function moveSection(id, direction) {
    if (!canMoveSection(id, direction)) return;

    const visibleIndex = visibleSectionOrder.indexOf(id);
    const targetId = visibleSectionOrder[visibleIndex + direction];
    const from = sectionOrder.indexOf(id);
    const to = sectionOrder.indexOf(targetId);
    if (from < 0 || to < 0) return;

    const next = [...sectionOrder];
    [next[from], next[to]] = [next[to], next[from]];
    sectionOrder = next;
  }
</script>

<div class="gradient-settings">
  {#each visibleSectionOrder as sectionId (sectionId)}
    {#if sectionId === 'type'}
      <div class="section">
        <div class="section-header">
          <div class="section-label">Type</div>
          <div class="section-order-controls">
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, -1)} onclick={() => moveSection(sectionId, -1)} title="Move Type up"><ChevronUp size={12} strokeWidth={2} /></button>
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, 1)} onclick={() => moveSection(sectionId, 1)} title="Move Type down"><ChevronDown size={12} strokeWidth={2} /></button>
          </div>
        </div>
        <select class="combo" value={gradient.type} onchange={(e) => update({ type: e.target.value })}>
          <optgroup label="Basic">
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
            <option value="conical">Conical</option>
          </optgroup>
          <optgroup label="Multi-point">
            <option value="radialRamp">Radial Ramp</option>
            <option value="linearRamp">Linear Ramp</option>
            <option value="squareRamp">Square Ramp</option>
            <option value="reflected">Reflected</option>
            <option value="mesh">Mesh</option>
            <option value="volumeMesh">Volume Mesh</option>
          </optgroup>
          <optgroup label="Preset">
            <option value="duotone">Duotone</option>
            <option value="tricolor">Tricolor</option>
            <option value="banding">Banding</option>
          </optgroup>
        </select>
      </div>
    {:else if sectionId === 'geometry'}
      <div class="section">
        <div class="section-header">
          <div class="section-label">Angle / Position</div>
          <div class="section-order-controls">
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, -1)} onclick={() => moveSection(sectionId, -1)} title="Move Angle / Position up"><ChevronUp size={12} strokeWidth={2} /></button>
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, 1)} onclick={() => moveSection(sectionId, 1)} title="Move Angle / Position down"><ChevronDown size={12} strokeWidth={2} /></button>
          </div>
        </div>
        {#if showAngle}
          <div class="section-sub-label">Angle</div>
          <div class="input-row">
            <NumberCell min={0} max={360} value={gradient.angle} defaultValue={90} onchange={(v) => update({ angle: parseInt(v) || 0 })} />
            <span class="input-suffix">°</span>
          </div>
        {/if}
        {#if showCenter}
          <div class="section-sub-label offset">Centre</div>
          <div class="input-row">
            <span class="input-prefix">X</span>
            <NumberCell min={0} max={100} value={gradient.centerX} defaultValue={50} onchange={(v) => update({ centerX: parseInt(v) || 50 })} />
            <span class="input-prefix" style="margin-left: 4px">Y</span>
            <NumberCell min={0} max={100} value={gradient.centerY} defaultValue={50} onchange={(v) => update({ centerY: parseInt(v) || 50 })} />
          </div>
        {/if}
        {#if showRadius}
          <div class="section-sub-label offset">Radius</div>
          <div class="input-row">
            {#if shape === 'rectangle' || shape === 'ellipse'}<span class="input-prefix">X</span>{/if}
            <NumberCell min={1} max={200} value={gradient.radiusX} defaultValue={50} onchange={(v) => update({ radiusX: parseInt(v) || 50 })} />
            {#if shape === 'rectangle' || shape === 'ellipse'}
              <span class="input-prefix" style="margin-left: 4px">Y</span>
              <NumberCell min={1} max={200} value={gradient.radiusY} defaultValue={50} onchange={(v) => update({ radiusY: parseInt(v) || 50 })} />
            {/if}
          </div>
        {/if}
      </div>
    {:else if sectionId === 'shape'}
      <div class="section">
        <div class="section-header">
          <div class="section-label">Shape</div>
          <div class="section-order-controls">
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, -1)} onclick={() => moveSection(sectionId, -1)} title="Move Shape up"><ChevronUp size={12} strokeWidth={2} /></button>
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, 1)} onclick={() => moveSection(sectionId, 1)} title="Move Shape down"><ChevronDown size={12} strokeWidth={2} /></button>
          </div>
        </div>
        <button
          class="auto-shape-btn"
          class:active={autoShape}
          onclick={chooseAutoShape}
          title="Preview the gradient on the target's real width, height and corners"
        >
          <Crosshair size={12} strokeWidth={1.6} />
          <span class="auto-shape-text">
            <span class="auto-shape-title">Auto — from target</span>
            <span class="auto-shape-sub">{proxyGeometry.label}</span>
          </span>
        </button>
        <div class="toggle-row">
          <button class="toggle-btn" class:active={!autoShape && shape === 'circle'} onclick={() => chooseShape('circle')} title="Override: circle">
            <Circle size={13} strokeWidth={1.5} />
          </button>
          <button class="toggle-btn" class:active={!autoShape && shape === 'ellipse'} onclick={() => chooseShape('ellipse')} title="Override: ellipse">
            <Circle size={13} strokeWidth={1.5} style="transform: scaleX(1.4)" />
          </button>
          <button class="toggle-btn" class:active={!autoShape && shape === 'square'} onclick={() => chooseShape('square')} title="Override: square">
            <Square size={13} strokeWidth={1.5} />
          </button>
          <button class="toggle-btn" class:active={!autoShape && shape === 'rectangle'} onclick={() => chooseShape('rectangle')} title="Override: rectangle">
            <RectangleHorizontal size={13} strokeWidth={1.5} />
          </button>
          <button class="toggle-btn" class:active={!autoShape && shape === 'triangle'} onclick={() => chooseShape('triangle')} title="Override: triangle">
            <Triangle size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    {:else if sectionId === 'edge'}
      <div class="section">
        <div class="section-header">
          <div class="section-label">Edge</div>
          <div class="section-order-controls">
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, -1)} onclick={() => moveSection(sectionId, -1)} title="Move Edge up"><ChevronUp size={12} strokeWidth={2} /></button>
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, 1)} onclick={() => moveSection(sectionId, 1)} title="Move Edge down"><ChevronDown size={12} strokeWidth={2} /></button>
          </div>
        </div>
        <div class="input-row">
          <NumberCell min={0} max={100} value={gradient.edge ?? 0} defaultValue={0} onchange={(v) => update({ edge: parseInt(v) || 0 })} />
          <span class="input-suffix">%</span>
        </div>
      </div>
    {:else if sectionId === 'stops'}
      <div class="section stops-section">
        <div class="section-header">
          <div class="section-label">Stops</div>
          <div class="section-order-controls">
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, -1)} onclick={() => moveSection(sectionId, -1)} title="Move Stops up"><ChevronUp size={12} strokeWidth={2} /></button>
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, 1)} onclick={() => moveSection(sectionId, 1)} title="Move Stops down"><ChevronDown size={12} strokeWidth={2} /></button>
          </div>
        </div>
        <div class="stops-list">
          {#each sortedStops as stop (stop.origIdx)}
            <div class="stop-row" class:selected={stop.origIdx === selectedStop}>
              <button
                class="stop-color"
                class:editing={editingStopIndex === stop.origIdx}
                style="background: #{stop.color}"
                onclick={() => openStopEditor(stop.origIdx)}
                title="Edit this colour here"
              ></button>
              <span class="stop-hex">#{stop.color}</span>
              <span class="stop-pos nc-wrap">
                <NumberCell min={0} max={100} value={stop.position} onchange={(v) => updateStop(stop.origIdx, { position: parseInt(v) || 0 })} />
              </span>
              <span class="stop-pct">%</span>
              <button
                class="stop-popout"
                onclick={() => { onSelectStop?.(stop.origIdx); onEditStopColor?.(stop.origIdx); }}
                title="Open this stop in the Colors tab"
                aria-label="Open stop {stop.origIdx + 1} in the Colors tab"
              >
                <ExternalLink size={10} strokeWidth={2} />
              </button>
              {#if gradient.stops.length > 2}
                <button class="stop-delete" onclick={() => deleteStop(stop.origIdx)} title="Delete stop">
                  <X size={10} strokeWidth={2} />
                </button>
              {/if}
            </div>
            {#if editingStopIndex === stop.origIdx}
              <div class="stop-inline-editor">
                <StopColourPopover
                  color={stop.color}
                  label="Stop {stop.origIdx + 1}"
                  oninput={handleStopColourInput}
                  oncommit={handleStopColourCommit}
                  oncancel={handleStopColourCancel}
                />
              </div>
            {/if}
          {/each}
        </div>
        <button class="add-stop-btn" onclick={addStop}>
          <Plus size={11} strokeWidth={2} /> Add
        </button>
      </div>
    {:else if sectionId === 'presets'}
      <div class="section">
        <div class="section-header">
          <div class="section-label">Presets</div>
          <div class="section-order-controls">
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, -1)} onclick={() => moveSection(sectionId, -1)} title="Move Presets up"><ChevronUp size={12} strokeWidth={2} /></button>
            <button class="section-order-btn" disabled={!canMoveSection(sectionId, 1)} onclick={() => moveSection(sectionId, 1)} title="Move Presets down"><ChevronDown size={12} strokeWidth={2} /></button>
          </div>
        </div>
        <div class="gradient-swatches-grid">
          {#each gradientSwatches as gswatch, i}
            <button
              class="gradient-swatch"
              class:empty={!gswatch}
              style={gswatch ? `background: ${gradientToCSS(gswatch)}` : ''}
              onclick={() => onGradientPresetClick && onGradientPresetClick(i)}
              ondblclick={() => onGradientPresetDblClick && onGradientPresetDblClick(i)}
              oncontextmenu={(e) => onGradientPresetRightClick && onGradientPresetRightClick(i, e)}
              title={gswatch ? `${gswatch.type} gradient — click to load, right-click to replace, double-click to clear` : 'Click to store current gradient'}
            ></button>
          {/each}
        </div>
      </div>
    {/if}
  {/each}

</div>

<style>
  .gradient-settings {
    padding: 8px;
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .gradient-settings::-webkit-scrollbar {
    width: 12px;
  }

  .gradient-settings::-webkit-scrollbar-track {
    background: #5B9BD5;
  }

  .gradient-settings::-webkit-scrollbar-thumb {
    background: #1A1A1A;
    border-radius: 6px;
    border: 2px solid #5B9BD5;
  }

  .section {
    padding: 6px 0;
    border-bottom: 1px solid #333;
  }

  .section:last-child {
    border-bottom: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 16px;
    margin-bottom: 4px;
  }

  .section-label {
    flex: 1;
    font-size: 9px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-sub-label {
    font-size: 9px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .section-sub-label.offset {
    margin-top: 4px;
  }

  .section-order-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0.45;
    transition: opacity 0.1s;
  }

  .section:hover .section-order-controls,
  .section-order-controls:focus-within {
    opacity: 1;
  }

  .section-order-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    color: #777;
    cursor: pointer;
  }

  .section-order-btn:hover:not(:disabled) {
    color: #DDD;
    border-color: #5B9BD5;
  }

  .section-order-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .combo {
    width: 100%;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 3px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23888'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    padding-right: 20px;
  }

  .combo:focus {
    border-color: #5B9BD5;
  }

  /* Input rows */
  .input-row {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .input-prefix, .input-suffix {
    font-size: 10px;
    color: #666;
    flex-shrink: 0;
  }

  /* Auto (derived) proxy shape — the default; the toggles below it override. */
  .auto-shape-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-bottom: 4px;
    padding: 4px 6px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #888;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: all 0.1s;
  }

  .auto-shape-btn:hover {
    color: #DDD;
    border-color: #5B9BD5;
  }

  .auto-shape-btn.active {
    background: #094771;
    border-color: #5B9BD5;
    color: #DDD;
  }

  .auto-shape-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .auto-shape-title {
    font-size: 10px;
  }

  .auto-shape-sub {
    font-size: 9px;
    color: #8FA8BE;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Toggle buttons */
  .toggle-row {
    display: flex;
    gap: 3px;
  }

  .toggle-btn {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    cursor: pointer;
    padding: 4px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
  }



  .toggle-btn:hover {
    color: #DDD;
    border-color: #5B9BD5;
  }

  .toggle-btn.active {
    background: #094771;
    border-color: #5B9BD5;
    color: #DDD;
  }

  /* Stops */
  .stops-section {
    flex: 1;
  }

  .stops-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stop-row {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px;
    border-radius: 3px;
    transition: background 0.1s;
  }

  .stop-row.selected {
    background: rgba(91, 155, 213, 0.15);
  }

  .stop-color {
    width: 16px;
    height: 16px;
    border: 1px solid #555;
    border-radius: 2px;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: border-color 0.1s;
  }

  .stop-color:hover {
    border-color: #5B9BD5;
  }

  .stop-color.editing {
    border-color: #F2B04A;
    box-shadow: 0 0 4px rgba(242, 176, 74, 0.6);
  }

  /* The inline chooser sits INSIDE the scrolling sidebar rather than floating
     over it: the sidebar is narrow and scrolls, and a floating popover in a
     scroll container is a clipped popover. */
  .stop-inline-editor {
    --stop-popover-width: 100%;
    margin: 3px 0 5px;
  }

  .stop-popout {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    border-radius: 2px;
    transition: all 0.1s;
  }

  .stop-popout:hover {
    color: #5B9BD5;
    background: rgba(91, 155, 213, 0.12);
  }

  .stop-hex {
    font-family: monospace;
    font-size: 9px;
    color: #888;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Sizing wrapper around the stop-position NumberCell — keeps the row column narrow. */
  .stop-pos {
    width: 54px;
    flex-shrink: 0;
  }

  .nc-wrap {
    display: flex;
  }

  .stop-pct {
    font-size: 9px;
    color: #666;
  }

  .stop-delete {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    border-radius: 2px;
    transition: all 0.1s;
  }

  .stop-delete:hover {
    color: #E55;
    background: rgba(255, 0, 0, 0.1);
  }

  .add-stop-btn {
    margin-top: 4px;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    font-size: 10px;
    font-family: inherit;
    padding: 3px 8px;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    transition: all 0.1s;
  }

  .add-stop-btn:hover {
    color: #DDD;
    border-color: #5B9BD5;
  }

  /* Gradient preset swatches */
  .gradient-swatches-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 2px;
    width: 100%;
  }

  .gradient-swatch {
    aspect-ratio: 1;
    border: 1px solid #333;
    border-radius: 2px;
    cursor: pointer;
    padding: 0;
    min-width: 0;
    transition: border-color 0.1s;
  }

  .gradient-swatch:hover {
    border-color: #5B9BD5;
  }

  .gradient-swatch.empty {
    background: #333;
    border-style: dashed;
  }

  .gradient-swatch.empty:hover {
    border-color: #5B9BD5;
  }
</style>
