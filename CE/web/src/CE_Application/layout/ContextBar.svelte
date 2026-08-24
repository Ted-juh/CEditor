<script>
  /**
   * Context bar — the single selection toolbar above the canvas, replacing
   * the old AppearanceBar ("Look", 60px) + FunctionBar (56px) + ZoomBar
   * (24px) stack. Zoom and view toggles now live in the status bar, so the
   * canvas gets ~80px back and there is one place to look for "controls
   * about the selection".
   *
   *   Row 1 — what it is: name + type, behavior subtype, appearance facet tabs
   *   Row 2 — the details: the active facet's quick controls, then state /
   *            input / value-row groups when the control has behavior.
   *
   * Every control writes the same dot-paths the PropertiesPanel uses, so this
   * is a faster door into the same model, not a separate one. Colours edit
   * through the display panel's Colors tab (activateColorTarget) — swatches
   * here only open and label the target.
   */
  import Bold from 'lucide-svelte/icons/bold';
  import Italic from 'lucide-svelte/icons/italic';
  import Underline from 'lucide-svelte/icons/underline';
  import AlignLeft from 'lucide-svelte/icons/align-left';
  import AlignCenter from 'lucide-svelte/icons/align-center';
  import AlignRight from 'lucide-svelte/icons/align-right';
  import Type from 'lucide-svelte/icons/type';
  import PaintBucket from 'lucide-svelte/icons/paint-bucket';
  import Frame from 'lucide-svelte/icons/frame';
  import Square from 'lucide-svelte/icons/square';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import Image from 'lucide-svelte/icons/image';
  import { selectedControl, getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { componentWorkspaceMode } from '../stores/componentWorkspace.js';
  import { availableFonts, availableIcons } from '../stores/appSettings.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { activeFacet, setFacet, APPEARANCE_FACET_ORDER } from '../stores/editorFacet.js';
  import DeviceInsight from './DeviceInsight.svelte';
  import ScriptInsight from './ScriptInsight.svelte';
  import DisplayToolbar from '../components/DisplayToolbar.svelte';
  import NumberCell from '../properties/NumberCell.svelte';

  let control = $derived($selectedControl);
  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let background = $derived(getSection(control, 'Background'));
  let text = $derived(getSection(control, 'Text'));
  let textFill = $derived(text?._children?.Fill ?? null);
  let font = $derived(text?._children?.Font ?? null);
  let position = $derived(text?._children?.Position ?? null);
  let backgroundFill = $derived(background?._children?.Fill ?? null);
  let backgroundBorder = $derived(background?._children?.Border ?? null);
  let backgroundCorners = $derived(background?._children?.Corners ?? null);
  let effects = $derived(getSection(control, 'Effects'));
  let icon = $derived(getSection(control, 'Icon'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let valueSection = $derived(getSection(control, 'Value'));
  let selectedStates = $derived(getSection(control, 'States'));

  let hasSelection = $derived($selectedComponentIds.size > 0);
  let multiSelect = $derived($selectedComponentIds.size > 1);
  let controlType = $derived(String(core?.controlType ?? ''));

  // --- Behavior groups (from the old FunctionBar) ---
  const SUBTYPE_OPTIONS = {
    momentary: ['action', 'repeating', 'press_to_talk'],
    toggle: ['toggle', 'sticky'],
    cyclic: ['cycle', 'tri_state'],
    timed: ['hold_to_confirm', 'double_click'],
    one_shot: ['single_use'],
  };

  let buttonType = $derived(String(behavior?.buttonType ?? inferButtonType(controlType)));
  let subtypeOptions = $derived(SUBTYPE_OPTIONS[buttonType] ?? null);
  let showSubtypeSelector = $derived(!!behavior && !!subtypeOptions);
  let rowCount = $derived(Array.isArray(valueSection?.rows) ? valueSection.rows.length : 0);

  let showStateToolbar = $derived(
    String(behavior?.buttonType ?? '').trim().length > 0
    && Object.keys(selectedStates?._children ?? {}).length > 0
  );
  let showSegmentToolbar = $derived(buttonType === 'radio' && Array.isArray(valueSection?.rows) && valueSection.rows.length > 0);
  let showStateGroup = $derived(showStateToolbar || showSegmentToolbar);
  let showInputGroup = $derived(
    !!behavior && (hasBehaviorPath('wheelEnabled') || hasBehaviorPath('reverseMouseDirection') || hasBehaviorPath('keyboardEnabled'))
  );

  let componentDesignerActive = $derived(
    $componentWorkspaceMode === 'surface'
    && controlType === 'CustomComponent'
  );

  function inferButtonType(type = '') {
    switch (String(type ?? '')) {
      case 'ToggleButton': return 'toggle';
      case 'RadioButtonGroup': return 'radio';
      case 'CyclicButton': return 'cyclic';
      case 'Combobox': return 'combobox';
      case 'TimedButton': return 'timed';
      case 'OneShotButton': return 'one_shot';
      default: return 'momentary';
    }
  }

  function hasBehaviorPath(path) {
    return Object.prototype.hasOwnProperty.call(behavior ?? {}, path);
  }

  // --- Appearance facets (from the old AppearanceBar) ---
  const FACET_META = {
    text: { label: 'Text', icon: Type },
    fill: { label: 'Fill', icon: PaintBucket },
    border: { label: 'Border', icon: Square },
    box: { label: 'Box', icon: Frame },
    effects: { label: 'Effects', icon: Sparkles },
    icon: { label: 'Icon', icon: Image },
  };
  let facets = $derived.by(() => {
    const list = [];
    if (text) list.push('text');
    if (backgroundFill) list.push('fill');
    if (backgroundBorder || backgroundCorners) list.push('border');
    if (transform) list.push('box');
    if (effects) list.push('effects');
    if (icon) list.push('icon');
    return list;
  });

  let shownFacet = $derived.by(() => {
    if (facets.includes($activeFacet)) return $activeFacet;
    for (const facet of APPEARANCE_FACET_ORDER) {
      if (facets.includes(facet)) return facet;
    }
    return null;
  });

  let weightedFontSelected = $derived(
    $availableFonts.find(option => option.value === (font?.family ?? 'Arial'))?.supportsWeight === true
  );
  let effectiveWeightValue = $derived(font?.weightValue ?? (font?.weight === 'Bold' ? 700 : 400));
  let boldActive = $derived(weightedFontSelected ? effectiveWeightValue >= 700 : font?.weight === 'Bold');
  let textColour = $derived(toDisplayColour(textFill?.colour ?? 'FFFFFFFF'));
  let backgroundColour = $derived(toDisplayColour(backgroundFill?.colour ?? 'FF3A3A3A'));
  let borderColour = $derived(toDisplayColour(backgroundBorder?.colour ?? '66FFFFFF'));
  let justification = $derived(String(position?.justification ?? 'centred'));
  let iconTintColour = $derived(toDisplayColour(icon?.tint ?? 'FFFFFFFF'));
  let shadowEnabled = $derived(effects?._children?.Shadows?.items?.[0]?.enabled === true);
  let blendMode = $derived(String(effects?._children?.Blend?.mode ?? 'normal'));

  const BLEND_MODES = [
    'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
    'color-dodge', 'color-burn', 'hard-light', 'soft-light',
    'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  ];

  function set(path, value) {
    if (!core?.id || !path) return;
    if (multiSelect) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }

  function toDisplayColour(value) {
    const hex = String(value ?? '').replace(/^#/, '').toUpperCase();
    if (hex.length >= 6) return `#${hex.slice(-6)}`;
    return '#FFFFFF';
  }

  // Every colour edits through the display panel's Colors tab — clicking a
  // swatch activates a labelled target there.
  function openColour(path, previous, label = 'Colour') {
    if (!core?.id) return;
    if (multiSelect) {
      activateColorTarget({
        type: 'callback',
        label: `${$selectedComponentIds.size} selected · ${label}`,
        apply: (hex) => updateSelectedProperty(path, hex),
      }, String(previous ?? 'FFFFFFFF'));
      return;
    }
    activateColorTarget({ type: 'control', controlId: core.id, path }, String(previous ?? 'FFFFFFFF'));
  }

  function normalizeWeightValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 400;
    return numeric >= 700 ? 700 : 400;
  }

  function setFontFamily(event) {
    const family = event.target.value;
    set('Text.Font.family', family);
    const nextFontOption = $availableFonts.find((option) => option.value === family) ?? null;
    if (nextFontOption?.supportsWeight === true) {
      const nextWeight = normalizeWeightValue(effectiveWeightValue);
      set('Text.Font.weightValue', nextWeight);
      set('Text.Font.weight', nextWeight >= 700 ? 'Bold' : 'Regular');
    }
  }

  function toggleBold() {
    if (weightedFontSelected) {
      const nextWeight = effectiveWeightValue >= 700 ? 400 : 700;
      set('Text.Font.weightValue', nextWeight);
      set('Text.Font.weight', nextWeight >= 700 ? 'Bold' : 'Regular');
      return;
    }

    set('Text.Font.weight', font?.weight === 'Bold' ? 'Regular' : 'Bold');
    set('Text.Font.weightValue', font?.weight === 'Bold' ? 400 : 700);
  }

  function setHorizontalJustification(horizontal) {
    const align = horizontal === 'left' || horizontal === 'right' ? horizontal : 'centred';
    const current = String(position?.justification ?? 'centred');

    if (current === 'top' || current === 'topLeft' || current === 'topRight') {
      set('Text.Position.justification', align === 'left' ? 'topLeft' : (align === 'right' ? 'topRight' : 'top'));
      return;
    }

    if (current === 'bottom' || current === 'bottomLeft' || current === 'bottomRight') {
      set('Text.Position.justification', align === 'left' ? 'bottomLeft' : (align === 'right' ? 'bottomRight' : 'bottom'));
      return;
    }

    set('Text.Position.justification', align === 'left' ? 'left' : (align === 'right' ? 'right' : 'centred'));
  }

  function isHorizontalJustification(horizontal) {
    if (horizontal === 'left') return justification === 'left' || justification === 'topLeft' || justification === 'bottomLeft';
    if (horizontal === 'right') return justification === 'right' || justification === 'topRight' || justification === 'bottomRight';
    return justification === 'centred' || justification === 'top' || justification === 'bottom';
  }

  function setNumber(path, value, fallback = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
    const numeric = Number(value);
    const next = Number.isFinite(numeric) ? numeric : fallback;
    set(path, Math.min(max, Math.max(min, next)));
  }

  function setIconAsset(event) {
    const assetId = String(event.target.value ?? '');
    const asset = $availableIcons.find((option) => option.value === assetId) ?? null;
    set('Icon.source', asset ? 'library' : 'none');
    set('Icon.assetId', assetId);
    set('Icon.name', asset?.name ?? '');
  }
</script>

<div class="context-bar">
  <div class="ctx-main">
  {#if componentDesignerActive}
    <div class="ctx-row"><span class="empty-state designer-state">Designer controls are active in the component workspace</span></div>
  {:else if !hasSelection}
    <!-- NOT a second "No selection" (S5). The status bar already says that, and
         it said it at the same time as this bar and the two it replaced — three
         copies of the same two words on screen at once. The status bar keeps
         the statement of fact; the bar that owns the selection tools says what
         to do about it instead, which is the only thing an empty toolbar can
         usefully contribute. -->
    <div class="ctx-row">
      <span class="empty-state">Select a component to edit it — or press <kbd>+</kbd> in the left rail to insert one.</span>
    </div>
  {:else}
    <!-- Row 1 — what it is + which facet -->
    <div class="ctx-row">
      <input
        class="name-field"
        type="text"
        value={core?.name ?? ''}
        placeholder="Name"
        disabled={multiSelect}
        title={multiSelect ? 'Name editing is single-selection only' : 'Component name'}
        onfocus={(event) => event.target.select()}
        onchange={(event) => set('Core.name', event.target.value)}
      />
      {#if controlType}
        <span class="type-badge" title="Control type">{multiSelect ? `${$selectedComponentIds.size} selected` : controlType}</span>
      {/if}

      {#if showSubtypeSelector}
        <div class="divider"></div>
        <span class="type-badge ghost" title="Button type">{buttonType}</span>
        <select class="val-select" value={behavior?.subtype ?? subtypeOptions[0]} title="Behavior subtype" onchange={(event) => set('Behavior.subtype', event.target.value)}>
          {#each subtypeOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      {/if}

      {#if facets.length > 0}
        <div class="divider"></div>
        <div class="facet-tabs">
          {#each facets as facet (facet)}
            {@const meta = FACET_META[facet]}
            <button
              class="facet-tab"
              class:active={facet === shownFacet}
              title={meta.label}
              onclick={() => setFacet(facet)}
            >
              <meta.icon size={12} strokeWidth={2} />
              <span>{meta.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Row 2 — the active facet's controls, then behavior groups -->
    <div class="ctx-row">
      {#if shownFacet === 'text'}
      <div class="prop-group">
        <button
          class="color-swatch"
          style="background: {textColour};"
          title="Text colour — edits in the Colors panel"
          aria-label="Text colour"
          onclick={() => openColour('Text.Fill.colour', textFill?.colour, 'Text colour')}
        ></button>
      </div>

      <div class="prop-group">
        <select class="font-select" value={font?.family ?? 'Arial'} title="Font family" onchange={setFontFamily}>
          {#each $availableFonts as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <span class="number-field size-field nc-wrap" title="Font size">
          <NumberCell min={1} step={1} value={font?.size ?? 14} defaultValue={14} onchange={(value) => setNumber('Text.Font.size', value, font?.size ?? 14, 1)} />
        </span>
      </div>

      <div class="prop-group toggle-group">
        <button class="toggle-btn" class:active={boldActive} title="Bold" onclick={toggleBold}>
          <Bold size={12} strokeWidth={2} />
        </button>
        <button class="toggle-btn" class:active={font?.style === 'Italic'} title="Italic" onclick={() => set('Text.Font.style', font?.style === 'Italic' ? 'Normal' : 'Italic')}>
          <Italic size={12} strokeWidth={2} />
        </button>
        <button class="toggle-btn" class:active={font?.underline === true} title="Underline" onclick={() => set('Text.Font.underline', !(font?.underline === true))}>
          <Underline size={12} strokeWidth={2} />
        </button>
      </div>

      <div class="prop-group toggle-group">
        <button class="toggle-btn" class:active={isHorizontalJustification('left')} title="Align left" onclick={() => setHorizontalJustification('left')}>
          <AlignLeft size={12} strokeWidth={2} />
        </button>
        <button class="toggle-btn" class:active={isHorizontalJustification('centred')} title="Align center" onclick={() => setHorizontalJustification('centred')}>
          <AlignCenter size={12} strokeWidth={2} />
        </button>
        <button class="toggle-btn" class:active={isHorizontalJustification('right')} title="Align right" onclick={() => setHorizontalJustification('right')}>
          <AlignRight size={12} strokeWidth={2} />
        </button>
      </div>
      {:else if shownFacet === 'fill'}
      <div class="prop-group">
        <button
          class="color-swatch"
          style="background: {backgroundColour};"
          title="Background fill colour — edits in the Colors panel"
          aria-label="Background fill colour"
          onclick={() => openColour('Background.Fill.colour', backgroundFill?.colour, 'Fill colour')}
        ></button>
      </div>
      {:else if shownFacet === 'border'}
      <div class="prop-group">
        {#if backgroundBorder}
          <span class="mini-label">C</span>
          <button
            class="color-swatch"
            style="background: {borderColour};"
            title="Border colour — edits in the Colors panel"
            aria-label="Border colour"
            onclick={() => openColour('Background.Border.colour', backgroundBorder?.colour, 'Border colour')}
          ></button>
        {/if}
        {#if backgroundCorners}
          <span class="mini-label">R</span>
          <span class="number-field size-field nc-wrap" title="Corner radius">
            <NumberCell min={0} step={1} value={backgroundCorners?.radius ?? 0} defaultValue={0} onchange={(value) => setNumber('Background.Corners.radius', value, backgroundCorners?.radius ?? 0, 0)} />
          </span>
        {/if}
      </div>
      {:else if shownFacet === 'box'}
      <div class="prop-group">
        <span class="mini-label">X</span>
        <span class="number-field nc-wrap" title="X position"><NumberCell step={1} value={transform?.x ?? 0} defaultValue={0} onchange={(value) => setNumber('Transform.x', value, transform?.x ?? 0)} /></span>
        <span class="mini-label">Y</span>
        <span class="number-field nc-wrap" title="Y position"><NumberCell step={1} value={transform?.y ?? 0} defaultValue={0} onchange={(value) => setNumber('Transform.y', value, transform?.y ?? 0)} /></span>
        <span class="mini-label">W</span>
        <span class="number-field nc-wrap" title="Width"><NumberCell min={1} step={1} value={transform?.width ?? 0} defaultValue={0} onchange={(value) => setNumber('Transform.width', value, transform?.width ?? 0, 1)} /></span>
        <span class="mini-label">H</span>
        <span class="number-field nc-wrap" title="Height"><NumberCell min={1} step={1} value={transform?.height ?? 0} defaultValue={0} onchange={(value) => setNumber('Transform.height', value, transform?.height ?? 0, 1)} /></span>
        <span class="mini-label">R</span>
        <span class="number-field nc-wrap" title="Rotation (degrees)"><NumberCell step={1} value={transform?.rotation ?? 0} defaultValue={0} onchange={(value) => setNumber('Transform.rotation', value, transform?.rotation ?? 0)} /></span>
        <span class="mini-label">O</span>
        <span class="number-field opacity-field nc-wrap" title="Opacity"><NumberCell min={0} max={1} step={0.05} value={transform?.opacity ?? 1} defaultValue={1} onchange={(value) => setNumber('Transform.opacity', value, transform?.opacity ?? 1, 0, 1)} /></span>
      </div>
      {:else if shownFacet === 'effects'}
      <div class="prop-group toggle-group">
        <button class="text-toggle" class:active={shadowEnabled} title="Drop shadow" onclick={() => set('Effects.Shadows.items.0.enabled', !shadowEnabled)}>Shadow</button>
      </div>
      <div class="prop-group">
        <span class="mini-label">Blur</span>
        <span class="number-field nc-wrap" title="Blur"><NumberCell min={0} step={0.5} value={effects?._children?.Filters?.blur ?? 0} defaultValue={0} onchange={(value) => setNumber('Effects.Filters.blur', value, effects?._children?.Filters?.blur ?? 0, 0)} /></span>
        <span class="mini-label">Brt</span>
        <span class="number-field nc-wrap" title="Brightness"><NumberCell min={0} step={1} value={effects?._children?.Filters?.brightness ?? 100} defaultValue={100} onchange={(value) => setNumber('Effects.Filters.brightness', value, effects?._children?.Filters?.brightness ?? 100, 0)} /></span>
      </div>
      <div class="prop-group">
        <select class="font-select" value={blendMode} title="Blend mode" onchange={(event) => set('Effects.Blend.mode', event.target.value)}>
          {#each BLEND_MODES as mode}
            <option value={mode}>{mode}</option>
          {/each}
        </select>
      </div>
      {:else if shownFacet === 'icon'}
      <div class="prop-group">
        <select class="font-select" value={icon?.assetId ?? ''} title="Icon" onchange={setIconAsset}>
          <option value="">No icon</option>
          {#each $availableIcons as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <span class="mini-label">Sz</span>
        <span class="number-field size-field nc-wrap" title="Icon size"><NumberCell min={4} step={1} value={icon?.size ?? 16} defaultValue={16} onchange={(value) => setNumber('Icon.size', value, icon?.size ?? 16, 4)} /></span>
      </div>
      <div class="prop-group">
        <button
          class="color-swatch"
          style="background: {iconTintColour};"
          title="Icon tint — edits in the Colors panel"
          aria-label="Icon tint"
          onclick={() => openColour('Icon.tint', icon?.tint, 'Icon tint')}
        ></button>
        <span class="mini-label">O</span>
        <span class="number-field opacity-field nc-wrap" title="Icon opacity"><NumberCell min={0} max={1} step={0.05} value={icon?.opacity ?? 1} defaultValue={1} onchange={(value) => setNumber('Icon.opacity', value, icon?.opacity ?? 1, 0, 1)} /></span>
        <span class="mini-label">R</span>
        <span class="number-field nc-wrap" title="Icon rotation"><NumberCell step={1} value={icon?.rotation ?? 0} defaultValue={0} onchange={(value) => setNumber('Icon.rotation', value, icon?.rotation ?? 0)} /></span>
      </div>
      {/if}

      {#if showStateGroup}
        <div class="divider"></div>
        <span class="section-chip">State</span>
        <div class="toolbar-slot">
          <DisplayToolbar />
        </div>
      {/if}

      {#if showInputGroup}
        <div class="divider"></div>
        <span class="section-chip">Input</span>
        <div class="prop-group toggle-group">
          {#if hasBehaviorPath('wheelEnabled')}
            <button class="text-toggle" class:active={behavior?.wheelEnabled === true} title="Mouse wheel input" onclick={() => set('Behavior.wheelEnabled', !(behavior?.wheelEnabled === true))}>Wheel</button>
          {/if}
          {#if hasBehaviorPath('reverseMouseDirection')}
            <button class="text-toggle" class:active={behavior?.reverseMouseDirection === true} title="Reverse mouse direction" onclick={() => set('Behavior.reverseMouseDirection', !(behavior?.reverseMouseDirection === true))}>Reverse</button>
          {/if}
          {#if hasBehaviorPath('keyboardEnabled')}
            <button class="text-toggle" class:active={behavior?.keyboardEnabled !== false} title="Keyboard input" onclick={() => set('Behavior.keyboardEnabled', !(behavior?.keyboardEnabled !== false))}>Keys</button>
          {/if}
        </div>
      {/if}

      {#if rowCount > 0}
        <div class="divider"></div>
        <span class="readout" title="Value rows defined on this control">Rows <strong>{rowCount}</strong></span>
      {/if}
    </div>
  {/if}
  </div>

  <DeviceInsight />
  <ScriptInsight />
</div>

<style>
  .context-bar {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 0;
    padding: 4px 10px;
    background: #272727;
    font-size: 11px;
  }

  .ctx-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
  }

  .ctx-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
    flex-wrap: wrap;
  }

  .designer-state {
    color: #8DBFE5;
    font-weight: 700;
  }

  .facet-tabs {
    display: flex;
    align-items: center;
    gap: 1px;
  }

  .facet-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 9px;
    background: #1E1E1E;
    border: 1px solid #3A3A3A;
    color: #9A9A9A;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
  }

  .facet-tab:first-child { border-radius: 3px 0 0 3px; }
  .facet-tab:last-child  { border-radius: 0 3px 3px 0; }
  .facet-tab:not(:last-child) { border-right: 0; }

  .facet-tab:hover {
    background: #333;
    color: #DDD;
  }

  .facet-tab.active {
    background: #094771;
    color: #FFF;
    border-color: #0B6EB5;
  }

  .prop-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .color-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #555;
    cursor: pointer;
    padding: 0;
  }

  .color-swatch:hover {
    border-color: #5B9BD5;
  }

  .section-chip {
    flex: 0 0 auto;
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .name-field {
    height: 22px;
    width: 130px;
    background: #1E1E1E;
    color: #DDD;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    font-size: 11px;
    font-family: inherit;
    padding: 0 6px;
    outline: none;
  }

  .name-field:focus {
    border-color: #5B9BD5;
  }

  .name-field:disabled {
    opacity: 0.5;
  }

  .val-select,
  .font-select {
    height: 22px;
    background: #1E1E1E;
    color: #DDD;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    font-size: 11px;
    font-family: inherit;
    padding: 0 6px;
    outline: none;
  }

  .font-select {
    max-width: 130px;
  }

  .type-badge {
    height: 18px;
    display: inline-flex;
    align-items: center;
    padding: 0 6px;
    border-radius: 3px;
    border: 1px solid #3A3A3A;
    background: #1A1A1A;
    color: #9FB6C9;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .type-badge.ghost {
    color: #8F8F8F;
  }

  /* Width-preserving wrappers around NumberCell — the cell's flex:1 fills
     the wrapper instead of the whole row. */
  .nc-wrap {
    display: flex;
    flex: 0 0 auto;
  }

  .number-field { width: 56px; }
  .size-field { width: 50px; }
  .opacity-field { width: 50px; }

  .mini-label {
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
  }

  .readout {
    color: #8A8A8A;
    font-size: 10px;
    font-weight: 600;
  }

  .readout strong {
    color: #CFCFCF;
    margin-left: 2px;
  }

  .divider {
    width: 1px;
    height: 16px;
    background: #3A3A3A;
  }

  .toggle-group {
    gap: 1px;
  }

  .toggle-btn {
    height: 22px;
    min-width: 24px;
    padding: 0 6px;
    background: #333;
    border: 1px solid #444;
    color: #999;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    font-weight: 600;
  }

  .toggle-btn:first-child { border-radius: 3px 0 0 3px; }
  .toggle-btn:last-child  { border-radius: 0 3px 3px 0; }

  .toggle-btn:hover {
    background: #444;
    color: #DDD;
  }

  .toggle-btn.active {
    background: #094771;
    color: #FFF;
    border-color: #0B6EB5;
  }

  .text-toggle {
    height: 22px;
    min-width: 36px;
    padding: 0 8px;
    background: #333;
    border: 1px solid #444;
    color: #999;
    border-radius: 3px;
    font-size: 10px;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .text-toggle:hover {
    background: #444;
    color: #DDD;
  }

  .text-toggle.active {
    background: #094771;
    color: #FFF;
    border-color: #0B6EB5;
  }

  .empty-state {
    color: #777;
    font-size: 11px;
  }

  .empty-state kbd {
    font-family: inherit;
    font-size: 10px;
    color: #AAB;
    background: #2A2A2A;
    border: 1px solid #3C3C3C;
    border-radius: 3px;
    padding: 0 4px;
  }

  .toolbar-slot {
    min-width: 0;
    display: flex;
    align-items: center;
  }
</style>
