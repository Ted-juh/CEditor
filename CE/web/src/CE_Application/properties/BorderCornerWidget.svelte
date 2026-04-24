<script>
  import NumberInput from '../sections/NumberInput.svelte';
  import LineTypeGrid from './LineTypeGrid.svelte';
  import CornerGradientModePicker from './CornerGradientModePicker.svelte';
  import CornerShapeCenter from './CornerShapeCenter.svelte';
  import { sideStyleOptions } from './lineTypeSvgs.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { activateGradientTarget } from '../stores/gradientTarget.js';
  import { Image, Layers } from 'lucide-svelte';
  import {
    SIDES, CORNERS,
    BORDER_UNLINK_PROPS, CORNER_UNLINK_PROPS, cascadeUnlink,
  } from '../utils/borderLinkCascade.js';
  import {
    cornerComboToData, comboFromCorners, sideForCombo, nextCombo,
  } from '../utils/cornerComboCycle.js';

  let {
    border = null,
    corners = null,
    linked = true,
    controlId = null,
    onupdate = null,
    borderPath = 'Background.Border',
    cornersPath = 'Background.Corners',
    buildColorTarget = null,
    buildGradientTarget = null,
  } = $props();

  // Which block is selected for editing (right-click)
  let selected = $state(null);

  // "All" mode: thickness and gap edits apply to all sides + corners at once
  let thickGapAll = $state(true);

  // --- Constants ---
  // SIDES and CORNERS come from borderLinkCascade.js
  const sideDef = { style: 'solid', thickness: 1, dotRadius: 2, doubleGap: 2, colour: 'FF888888' };
  const cornerDef = { radius: 0, borderEnabled: true, style: 'rounded', direction: 'outward', borderStyle: 'solid', thickness: 2, dotRadius: 2, doubleGap: 2, doubleAnchor: 'center', doubleDirection: 'outward', colour: 'FFFFFFFF' };

  const DEFAULT_GRADIENT = {
    type: 'linear',
    angle: 90,
    stops: [
      { color: 'FFFFFF', position: 0 },
      { color: '000000', position: 100 },
    ],
    edge: 0,
    centerX: 50,
    centerY: 50,
    radiusX: 50,
    radiusY: 50,
  };

  function set(path, value) { onupdate?.(path, value); }
  function joinPath(root, prop = '') {
    return prop ? `${root}.${prop}` : root;
  }
  function borderPropPath(prop = '') {
    return joinPath(borderPath, prop);
  }
  function cornersPropPath(prop = '') {
    return joinPath(cornersPath, prop);
  }
  function selectAll(e) { e.target.select(); }

  // --- Thickness/gap "All" writers ---
  // Fan a single value out to both border (all sides) and corners (all keys)
  function writeAll(prop, value) {
    if (border?.linked) set(borderPropPath(prop), value);
    else for (const s of SIDES) set(borderPropPath(`${s}.${prop}`), value);
    set(borderPropPath(prop), value);
    if (corners?.linked) set(cornersPropPath(prop), value);
    else for (const k of CORNERS) set(cornersPropPath(`${k}.${prop}`), value);
    set(cornersPropPath(prop), value);
  }

  function setAllThickness(value) { writeAll('thickness', value); }
  function setAllDoubleGap(value) { writeAll('doubleGap', value); }

  // --- Link/Unlink ---
  function toggleLink() {
    const newLinked = !linked;
    if (!newLinked) {
      if (corners) cascadeUnlink(cornersPath, corners, CORNERS, CORNER_UNLINK_PROPS, set);
      if (border) {
        cascadeUnlink(borderPath, border, SIDES, BORDER_UNLINK_PROPS, set);
        set(borderPropPath('linked'), false);
      }
    }
    set(cornersPropPath('linked'), newLinked);
    if (border) set(borderPropPath('linked'), newLinked);
  }

  // --- Grid cell readers ---
  // When linked, return the root; when unlinked, return the per-slot object.
  function getSide(side) {
    if (!border) return { ...sideDef };
    if (border.linked) return border;
    return border[side] ?? { ...sideDef };
  }

  function getCorner(key) {
    if (!corners) return { ...cornerDef };
    if (corners.linked) return corners;
    return corners[key] ?? { ...cornerDef };
  }

  function isSideEnabled(side) {
    if (!border?.enabled) return false;
    if (border.linked) return true;
    const s = border[side];
    return s && s.style !== 'none' && s.thickness > 0;
  }

  function isCornerBorderEnabled(key) {
    return getCorner(key).borderEnabled !== false;
  }

  function toggleSide(side) {
    if (!border) return;
    const visuallyOn = isSideEnabled(side);
    if (visuallyOn) {
      if (linked || border.linked) {
        set(borderPropPath('enabled'), false);
      } else {
        set(borderPropPath(`${side}.style`), 'none');
      }
    } else {
      if (!border.enabled) set(borderPropPath('enabled'), true);
      if (!(linked || border.linked)) {
        const s = border[side];
        if (!s || s.style === 'none') {
          // Restore from the parent/linked style instead of hardcoding 'solid'
          const fallback = border.style || 'solid';
          set(borderPropPath(`${side}.style`), fallback);
          // If restoring a double style, also copy the double parameters
          if (fallback === 'double') {
            set(borderPropPath(`${side}.doubleGap`), border.doubleGap ?? 2);
            set(borderPropPath(`${side}.doubleAnchor`), border.doubleAnchor ?? 'center');
            set(borderPropPath(`${side}.doubleDirection`), border.doubleDirection ?? 'outward');
          }
        }
      }
    }
  }

  function toggleCornerBorder(key) {
    const current = isCornerBorderEnabled(key);
    if (linked || corners?.linked) {
      set(cornersPropPath('borderEnabled'), !current);
    } else {
      set(cornersPropPath(`${key}.borderEnabled`), !current);
    }
  }

  function setCornerRadius(key, value) {
    if (linked || corners?.linked) {
      set(cornersPropPath('radius'), value);
    } else {
      set(cornersPropPath(`${key}.radius`), value);
    }
  }

  // --- Grid cell handlers ---
  function handleContext(id, e) { e.preventDefault(); selected = id; }

  // Fill swatch descriptors for the per-selection Fill row.
  // Icon is rendered inside the button when present.
  const FILL_SWATCHES = [
    { mode: 'solid',    cls: '',             icon: null,   title: 'Solid colour (right-click toggle)' },
    { mode: 'gradient', cls: 'grad-swatch',  icon: null,   title: 'Gradient (right-click toggle)' },
    { mode: 'image',    cls: 'icon-swatch',  icon: Image,  title: 'Image (right-click toggle)' },
    { mode: 'overlay',  cls: 'icon-swatch',  icon: Layers, title: 'Overlay (right-click toggle)' },
  ];

  // Grid layout in DOM order: row-major, 3×3. The center slot is special
  // (holds the straight/link/rounded buttons). Everything else is loop-driven.
  const gridCells = [
    { kind: 'corner', id: 'topLeft',     title: 'Top Left corner' },
    { kind: 'side',   id: 'top',         title: 'Top side' },
    { kind: 'corner', id: 'topRight',    title: 'Top Right corner' },
    { kind: 'side',   id: 'left',        title: 'Left side' },
    { kind: 'center' },
    { kind: 'side',   id: 'right',       title: 'Right side' },
    { kind: 'corner', id: 'bottomLeft',  title: 'Bottom Left corner' },
    { kind: 'side',   id: 'bottom',      title: 'Bottom side' },
    { kind: 'corner', id: 'bottomRight', title: 'Bottom Right corner' },
  ];

  let isSide = $derived(selected && SIDES.includes(selected));
  let isCorner = $derived(selected && CORNERS.includes(selected));

  // --- Unified selection context ---
  // Collapses side vs corner pathways into a single object describing where to
  // read data from and where to write property updates.
  let ctx = $derived.by(() => {
    if (isSide) {
      return {
        kind: 'side',
        section: 'Border',
        sectionLinked: !!border?.linked,
        styleProp: 'style',
        defaultColour: 'FF888888',
        defaultThickness: 1,
        data: getSide(selected),
      };
    }
    if (isCorner) {
      return {
        kind: 'corner',
        section: 'Corners',
        sectionLinked: !!corners?.linked,
        styleProp: 'borderStyle',
        defaultColour: 'FFFFFFFF',
        defaultThickness: 2,
        data: getCorner(selected),
      };
    }
    return null;
  });

  // Build the write path for a property on the currently selected cell.
  // Returns the root section path when linked, per-slot path otherwise.
  function ctxPath(prop) {
    if (!ctx) return null;
    const root = ctx.section === 'Border' ? borderPath : cornersPath;
    if (linked || ctx.sectionLinked) return joinPath(root, prop);
    return joinPath(root, `${selected}.${prop}`);
  }

  function ctxRootPath() {
    if (!ctx) return null;
    const root = ctx.section === 'Border' ? borderPath : cornersPath;
    if (linked || ctx.sectionLinked) return root;
    return joinPath(root, selected);
  }

  function setSelectedProp(prop, value) {
    const p = ctxPath(prop);
    if (p) set(p, value);
  }

  function handleColourClick() {
    if (!ctx) return;
    const colour = ctx.data?.colour ?? ctx.defaultColour;
    const path = ctxPath('colour');
    const target = typeof buildColorTarget === 'function'
      ? buildColorTarget({ path, colour, kind: ctx.kind, selected, data: ctx.data })
      : (controlId ? { type: 'control', controlId, path } : null);
    if (!target) return;
    activateColorTarget(target, colour);
  }

  // --- Fill modes (unified) ---
  let fileInputRef = $state(null);
  // Path captured at click time so an async file pick always writes to the
  // cell that was selected when the dialog was opened.
  let pendingFilePath = $state(null);

  function fillProp(mode) {
    return `fill${mode[0].toUpperCase() + mode.slice(1)}`;
  }

  function isFillActive(mode) {
    const prop = fillProp(mode);
    const d = ctx?.data;
    if (mode === 'solid') return d?.[prop] !== false;
    return d?.[prop] ?? false;
  }

  function toggleFillMode(mode, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!ctx) return;
    const current = isFillActive(mode);
    set(ctxPath(fillProp(mode)), !current);
  }

  function openGradientEditor() {
    if (!ctx) return;
    let currentGrad = ctx.data?.gradient;
    const rootPath = ctxRootPath();
    // Seed default gradient if none exists yet so the renderer has data
    if (!currentGrad) {
      currentGrad = JSON.parse(JSON.stringify(DEFAULT_GRADIENT));
      set(`${rootPath}.gradient`, currentGrad);
    }
    const target = typeof buildGradientTarget === 'function'
      ? buildGradientTarget({ path: rootPath, gradient: currentGrad, kind: ctx.kind, selected, data: ctx.data })
      : (controlId ? { type: 'control', controlId, path: rootPath } : null);
    if (!target) return;
    activateGradientTarget(target, currentGrad);
  }

  function handleFillClick(mode) {
    if (!ctx) return;
    // Auto-enable this fill mode
    if (!isFillActive(mode)) set(ctxPath(fillProp(mode)), true);
    if (mode === 'solid') {
      handleColourClick();
    } else if (mode === 'gradient') {
      openGradientEditor();
    } else if (mode === 'image' || mode === 'overlay') {
      const prop = mode === 'image' ? 'imageSrc' : 'overlaySrc';
      pendingFilePath = ctxPath(prop);
      fileInputRef?.click();
    }
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !pendingFilePath) { e.target.value = ''; return; }
    const path = pendingFilePath;
    pendingFilePath = null;
    const reader = new FileReader();
    reader.onload = () => set(path, reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // --- Corner-only gradient mode controls ---
  function setCornerGradientMode(mode) {
    if (!isCorner) return;
    set(ctxPath('cornerGradientMode'), mode);
  }

  function toggleCornerGradientFlip() {
    if (!isCorner) return;
    set(ctxPath('cornerGradientFlip'), !(ctx?.data?.cornerGradientFlip));
  }

  function setCornerInheritSide(side) {
    if (!isCorner) return;
    set(ctxPath('cornerGradientInheritSide'), side);
  }

  function gradientFlowValue() {
    return ctx?.data?.gradientFlow ?? 'across';
  }

  function setGradientFlow(mode) {
    if (!ctx) return;
    setSelectedProp('gradientFlow', mode);
  }

  // Get human label for the side a corner inherits from
  function inheritSideLabel(pos, side) {
    const useA = side !== 'B';
    switch (pos) {
      case 'topLeft':     return useA ? 'Top' : 'Left';
      case 'topRight':    return useA ? 'Top' : 'Right';
      case 'bottomRight': return useA ? 'Bottom' : 'Right';
      case 'bottomLeft':  return useA ? 'Bottom' : 'Left';
    }
    return useA ? 'A' : 'B';
  }

  // --- Corner shape center buttons ---
  let cornerCombo = $derived(comboFromCorners(corners));
  let cornerSide = $derived(sideForCombo(cornerCombo));

  function cycleCornerShape(side) {
    applyCornerCombo(nextCombo(cornerCombo, side));
  }

  function applyCornerCombo(combo) {
    const d = cornerComboToData(combo);
    if (linked || corners?.linked) {
      set(cornersPropPath('style'), d.style);
      set(cornersPropPath('direction'), d.direction);
    } else {
      for (const key of CORNERS) {
        set(cornersPropPath(`${key}.style`), d.style);
        set(cornersPropPath(`${key}.direction`), d.direction);
      }
    }
  }
</script>

<div class="bcw">
  <div class="grid-3x3">
    {#each gridCells as cell, i (i)}
      {#if cell.kind === 'corner'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="cell corner-cell" title={cell.title}
          class:on={isCornerBorderEnabled(cell.id)} class:sel={selected === cell.id}
          onclick={() => toggleCornerBorder(cell.id)}
          oncontextmenu={(e) => handleContext(cell.id, e)}>
          <input class="corner-input" type="number" value={getCorner(cell.id).radius} min={0} step={1}
            onfocus={selectAll} onclick={(e) => e.stopPropagation()}
            onchange={(e) => setCornerRadius(cell.id, Number(e.target.value))} />
        </div>
      {:else if cell.kind === 'side'}
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button class="cell side-cell" title={cell.title}
          class:on={isSideEnabled(cell.id)} class:sel={selected === cell.id}
          onclick={() => toggleSide(cell.id)}
          oncontextmenu={(e) => handleContext(cell.id, e)}>
        </button>
      {:else}
        <CornerShapeCenter
          {cornerCombo}
          {cornerSide}
          {linked}
          oncycle={cycleCornerShape}
          ontogglelink={toggleLink}
        />
      {/if}
    {/each}
  </div>

  <!-- Edit block: rendered uniformly for side or corner selection -->
  {#if ctx}
    {@const d = ctx.data}
    <div class="line-types-section">
      <span class="section-label">Line Types</span>
      <LineTypeGrid options={sideStyleOptions} columns={3}
        value={d?.[ctx.styleProp] ?? 'solid'}
        onchange={(v) => setSelectedProp(ctx.styleProp, v)} />
    </div>

    <div class="edit-row">
      <span class="edit-label">Thick</span>
      <NumberInput value={d?.thickness ?? ctx.defaultThickness} min={0} step={1}
        onchange={(v) => thickGapAll ? setAllThickness(v) : setSelectedProp('thickness', v)} />
      <button class="all-sep-btn" class:active={thickGapAll}
        title={thickGapAll ? 'Editing all sides + corners' : `Editing this ${ctx.kind} only`}
        onclick={() => thickGapAll = !thickGapAll}>{thickGapAll ? 'All' : 'Sep'}</button>
    </div>

    <div class="edit-row">
      <span class="edit-label">Fill</span>
      <div class="fill-swatches">
        {#each FILL_SWATCHES as sw (sw.mode)}
          <button class="fill-swatch {sw.cls}" class:active={isFillActive(sw.mode)} title={sw.title}
            style={sw.mode === 'solid' ? `background:#${(d?.colour ?? ctx.defaultColour).slice(-6)}` : undefined}
            onclick={() => handleFillClick(sw.mode)} oncontextmenu={(e) => toggleFillMode(sw.mode, e)}>
            {#if sw.icon}<sw.icon size={10} strokeWidth={1.5} />{/if}
          </button>
        {/each}
      </div>
    </div>

    {#if isFillActive('gradient')}
      <div class="edit-row">
        <span class="edit-label">G.Flow</span>
        <div class="flow-picker">
          <button class="flow-btn" class:active={gradientFlowValue() === 'across'}
            title="Gradient runs across border thickness (classic behavior)"
            onclick={() => setGradientFlow('across')}>
            Across
          </button>
          <button class="flow-btn" class:active={gradientFlowValue() === 'follow'}
            title="Gradient follows the border loop around the component"
            onclick={() => setGradientFlow('follow')}>
            Follow
          </button>
        </div>
      </div>
    {/if}

    {#if ctx.kind === 'corner' && isFillActive('gradient') && (d?.style ?? 'rounded') === 'rounded'}
      <CornerGradientModePicker
        mode={d?.cornerGradientMode ?? 'radial'}
        shapeStyle={d?.style ?? 'rounded'}
        flip={!!d?.cornerGradientFlip}
        inheritSide={d?.cornerGradientInheritSide ?? 'A'}
        inheritLabelA={inheritSideLabel(selected, 'A')}
        inheritLabelB={inheritSideLabel(selected, 'B')}
        onmodechange={setCornerGradientMode}
        onflip={toggleCornerGradientFlip}
        oninheritchange={setCornerInheritSide}
      />
    {/if}

    {#if isFillActive('image') && d?.imageSrc}
      <div class="edit-row">
        <span class="edit-label">Img</span>
        <input class="file-path" type="text" value={d.imageSrc.startsWith('data:') ? '(loaded)' : d.imageSrc} readonly onfocus={selectAll} />
      </div>
    {/if}
    {#if isFillActive('overlay') && d?.overlaySrc}
      <div class="edit-row">
        <span class="edit-label">Ovr</span>
        <input class="file-path" type="text" value={d.overlaySrc.startsWith('data:') ? '(loaded)' : d.overlaySrc} readonly onfocus={selectAll} />
      </div>
    {/if}
    {#if d?.[ctx.styleProp] === 'double'}
      <div class="edit-row">
        <span class="edit-label">Gap</span>
        <NumberInput value={d?.doubleGap ?? 2} min={0} step={1}
          onchange={(v) => thickGapAll ? setAllDoubleGap(v) : setSelectedProp('doubleGap', v)} />
      </div>
    {/if}
    {#if d?.[ctx.styleProp] === 'dotted'}
      <div class="edit-row">
        <span class="edit-label">Dot R</span>
        <NumberInput value={d?.dotRadius ?? 2} min={1} step={1} onchange={(v) => setSelectedProp('dotRadius', v)} />
      </div>
    {/if}
  {/if}

  <input bind:this={fileInputRef} type="file" accept="image/*" class="hidden-file"
    onchange={handleFileSelected} />
</div>

<style>
  .bcw {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .grid-3x3 {
    display: grid;
    grid-template-columns: 1fr 1.6fr 1fr;
    grid-template-rows: repeat(3, 32px);
    gap: 2px;
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  /* Side cells */
  .side-cell {
    background: #1A1A1A;
    border: 1px solid #333;
    cursor: pointer;
    font-family: inherit;
  }
  .side-cell.on { background: #2A3A4A; border-color: #5B9BD5; }
  .side-cell:hover { border-color: #5B9BD5; }
  .side-cell.sel { outline: 2px solid #E5A029; outline-offset: -2px; }

  /* Corner cells */
  .corner-cell {
    background: #1A1A1A;
    border: 1px solid #333;
    cursor: pointer;
  }
  .corner-cell.on { background: #2A3A4A; border-color: #5B9BD5; }
  .corner-cell:hover { border-color: #5B9BD5; }
  .corner-cell.sel { outline: 2px solid #E5A029; outline-offset: -2px; }

  .corner-input {
    width: 30px;
    height: 16px;
    background: #111;
    border: 1px solid #444;
    border-radius: 2px;
    color: #DDD;
    font-size: 9px;
    font-family: inherit;
    text-align: center;
    outline: none;
    padding: 0 1px;
    cursor: text;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .corner-input::-webkit-inner-spin-button,
  .corner-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .corner-input:focus { border-color: #5B9BD5; background: #1A1A1A; }

  /* Edit rows */
  .edit-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .edit-label {
    color: #888;
    font-size: 10px;
    min-width: 32px;
    flex-shrink: 0;
  }

  .fill-swatches {
    display: flex;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .fill-swatch {
    flex: 1;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #444;
    cursor: pointer;
    padding: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
    font-family: inherit;
  }
  .fill-swatch:hover { border-color: #5B9BD5; }
  .fill-swatch.active { border-color: #0B6EB5; box-shadow: 0 0 0 1px #094771 inset; }

  .grad-swatch {
    background: linear-gradient(90deg, #333, #AAA) !important;
  }
  .grad-swatch.active {
    background: linear-gradient(90deg, #333, #CCC) !important;
  }

  .icon-swatch {
    background: #1A1A1A;
  }
  .icon-swatch.active { background: #094771; color: #DDD; }

  .file-path {
    color: #999;
    font-size: 9px;
    background: #1A1A1A;
    padding: 2px 4px;
    border-radius: 2px;
    border: 1px solid #333;
    flex: 1;
    min-width: 0;
    font-family: inherit;
    outline: none;
    height: 18px;
    cursor: default;
  }
  .file-path:focus { border-color: #5B9BD5; }

  .hidden-file { display: none; }

  .all-sep-btn {
    height: 18px;
    padding: 0 5px;
    background: #1A1A1A;
    border: 1px solid #444;
    border-radius: 2px;
    color: #888;
    font-size: 9px;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }
  .all-sep-btn.active { background: #094771; border-color: #0B6EB5; color: #DDD; }
  .all-sep-btn:hover { border-color: #5B9BD5; }

  .line-types-section {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .section-label {
    color: #666;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding-left: 2px;
  }

  .flow-picker {
    display: flex;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .flow-btn {
    flex: 1;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #444;
    background: #1A1A1A;
    color: #888;
    font-size: 9px;
    cursor: pointer;
    font-family: inherit;
    padding: 0 6px;
  }
  .flow-btn:hover { border-color: #5B9BD5; color: #CCC; }
  .flow-btn.active { background: #094771; border-color: #0B6EB5; color: #DDD; }
</style>
