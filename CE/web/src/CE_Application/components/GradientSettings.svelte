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
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { addStopInLargestGap, updateStopAt, deleteStopAt } from '../utils/gradientStops.js';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

  const SECTION_ORDER_STORAGE_KEY = 'ce.gradientSettings.sectionOrder.v1';
  const DEFAULT_SECTION_ORDER = ['type', 'geometry', 'shape', 'edge', 'stops', 'presets'];

  let props = $props();
  let gradient = $derived(props.gradient);
  let selectedStop = $derived(props.selectedStop ?? 0);
  let shape = $derived(props.shape ?? 'rectangle');
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

  function blurOnEnter(e) {
    if (e.key === 'Enter') e.target.blur();
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
            <div class="num-input-wrap">
              <button class="pos-arrow left" tabindex="-1" onclick={() => update({ angle: Math.max(0, (gradient.angle ?? 90) - 1) })}>&#9664;</button>
              <input
                class="num-input"
                type="number"
                onkeydown={blurOnEnter}
                min="0" max="360"
                value={gradient.angle}
                onchange={(e) => update({ angle: parseInt(e.target.value) || 0 })}
              />
              <button class="pos-arrow right" tabindex="-1" onclick={() => update({ angle: Math.min(360, (gradient.angle ?? 90) + 1) })}>&#9654;</button>
            </div>
            <span class="input-suffix">°</span>
          </div>
        {/if}
        {#if showCenter}
          <div class="section-sub-label offset">Center</div>
          <div class="input-row">
            <span class="input-prefix">X</span>
            <div class="num-input-wrap">
              <button class="pos-arrow left" tabindex="-1" onclick={() => update({ centerX: Math.max(0, (gradient.centerX ?? 50) - 1) })}>&#9664;</button>
              <input
                class="num-input"
                type="number"
                onkeydown={blurOnEnter}
                min="0" max="100"
                value={gradient.centerX}
                onchange={(e) => update({ centerX: parseInt(e.target.value) || 50 })}
              />
              <button class="pos-arrow right" tabindex="-1" onclick={() => update({ centerX: Math.min(100, (gradient.centerX ?? 50) + 1) })}>&#9654;</button>
            </div>
            <span class="input-prefix" style="margin-left: 4px">Y</span>
            <div class="num-input-wrap">
              <button class="pos-arrow left" tabindex="-1" onclick={() => update({ centerY: Math.max(0, (gradient.centerY ?? 50) - 1) })}>&#9664;</button>
              <input
                class="num-input"
                type="number"
                onkeydown={blurOnEnter}
                min="0" max="100"
                value={gradient.centerY}
                onchange={(e) => update({ centerY: parseInt(e.target.value) || 50 })}
              />
              <button class="pos-arrow right" tabindex="-1" onclick={() => update({ centerY: Math.min(100, (gradient.centerY ?? 50) + 1) })}>&#9654;</button>
            </div>
          </div>
        {/if}
        {#if showRadius}
          <div class="section-sub-label offset">Radius</div>
          <div class="input-row">
            {#if shape === 'rectangle' || shape === 'ellipse'}<span class="input-prefix">X</span>{/if}
            <div class="num-input-wrap">
              <button class="pos-arrow left" tabindex="-1" onclick={() => update({ radiusX: Math.max(1, (gradient.radiusX ?? 50) - 1) })}>&#9664;</button>
              <input
                class="num-input"
                type="number"
                onkeydown={blurOnEnter}
                min="1" max="200"
                value={gradient.radiusX}
                onchange={(e) => update({ radiusX: parseInt(e.target.value) || 50 })}
              />
              <button class="pos-arrow right" tabindex="-1" onclick={() => update({ radiusX: Math.min(200, (gradient.radiusX ?? 50) + 1) })}>&#9654;</button>
            </div>
            {#if shape === 'rectangle' || shape === 'ellipse'}
              <span class="input-prefix" style="margin-left: 4px">Y</span>
              <div class="num-input-wrap">
                <button class="pos-arrow left" tabindex="-1" onclick={() => update({ radiusY: Math.max(1, (gradient.radiusY ?? 50) - 1) })}>&#9664;</button>
                <input
                  class="num-input"
                  type="number"
                  min="1" max="200"
                  value={gradient.radiusY}
                  onchange={(e) => update({ radiusY: parseInt(e.target.value) || 50 })}
                />
                <button class="pos-arrow right" tabindex="-1" onclick={() => update({ radiusY: Math.min(200, (gradient.radiusY ?? 50) + 1) })}>&#9654;</button>
              </div>
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
        <div class="toggle-row">
          <button class="toggle-btn" class:active={shape === 'circle'} onclick={() => onShapeChange && onShapeChange('circle')} title="Circle">
            <Circle size={13} strokeWidth={1.5} />
          </button>
          <button class="toggle-btn" class:active={shape === 'ellipse'} onclick={() => onShapeChange && onShapeChange('ellipse')} title="Ellipse">
            <Circle size={13} strokeWidth={1.5} style="transform: scaleX(1.4)" />
          </button>
          <button class="toggle-btn" class:active={shape === 'square'} onclick={() => onShapeChange && onShapeChange('square')} title="Square">
            <Square size={13} strokeWidth={1.5} />
          </button>
          <button class="toggle-btn" class:active={shape === 'rectangle'} onclick={() => onShapeChange && onShapeChange('rectangle')} title="Rectangle">
            <RectangleHorizontal size={13} strokeWidth={1.5} />
          </button>
          <button class="toggle-btn" class:active={shape === 'triangle'} onclick={() => onShapeChange && onShapeChange('triangle')} title="Triangle">
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
          <div class="num-input-wrap">
            <button class="pos-arrow left" tabindex="-1" onclick={() => update({ edge: Math.max(0, (gradient.edge ?? 0) - 1) })}>&#9664;</button>
            <input
              class="num-input"
              type="number"
              onkeydown={blurOnEnter}
              min="0" max="100"
              value={gradient.edge ?? 0}
              onchange={(e) => update({ edge: parseInt(e.target.value) || 0 })}
            />
            <button class="pos-arrow right" tabindex="-1" onclick={() => update({ edge: Math.min(100, (gradient.edge ?? 0) + 1) })}>&#9654;</button>
          </div>
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
                style="background: #{stop.color}"
                onclick={() => { if (onSelectStop) onSelectStop(stop.origIdx); if (onEditStopColor) onEditStopColor(stop.origIdx); }}
                title="Click to edit color"
              ></button>
              <span class="stop-hex">#{stop.color}</span>
              <div class="stop-pos-wrap">
                <button class="pos-arrow left" tabindex="-1" onclick={() => updateStop(stop.origIdx, { position: Math.max(0, stop.position - 1) })} title="Decrease">&#9664;</button>
                <input
                  class="stop-pos"
                  type="number"
                  onkeydown={blurOnEnter}
                  min="0" max="100"
                  value={stop.position}
                  onchange={(e) => updateStop(stop.origIdx, { position: parseInt(e.target.value) || 0 })}
                />
                <button class="pos-arrow right" tabindex="-1" onclick={() => updateStop(stop.origIdx, { position: Math.min(100, stop.position + 1) })} title="Increase">&#9654;</button>
              </div>
              <span class="stop-pct">%</span>
              {#if gradient.stops.length > 2}
                <button class="stop-delete" onclick={() => deleteStop(stop.origIdx)} title="Delete stop">
                  <X size={10} strokeWidth={2} />
                </button>
              {/if}
            </div>
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

  .num-input-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    overflow: hidden;
  }

  .num-input-wrap:focus-within {
    border-color: #5B9BD5;
  }

  .num-input {
    flex: 1;
    background: transparent;
    border: none;
    color: #DDD;
    font-size: 11px;
    padding: 3px 4px;
    font-family: inherit;
    outline: none;
    width: 0;
  }


  .input-prefix, .input-suffix {
    font-size: 10px;
    color: #666;
    flex-shrink: 0;
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

  .stop-hex {
    font-family: monospace;
    font-size: 9px;
    color: #888;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stop-pos-wrap {
    display: flex;
    align-items: center;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 2px;
    overflow: hidden;
  }

  .stop-pos-wrap:focus-within {
    border-color: #5B9BD5;
  }

  .pos-arrow {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    padding: 0 2px;
    font-size: 7px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color 0.1s;
  }

  .pos-arrow:hover {
    color: #DDD;
  }

  .stop-pos {
    width: 28px;
    background: transparent;
    border: none;
    color: #DDD;
    font-size: 10px;
    padding: 1px 0;
    font-family: inherit;
    outline: none;
    text-align: center;
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
