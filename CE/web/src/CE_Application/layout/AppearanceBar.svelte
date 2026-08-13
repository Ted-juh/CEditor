<script>
  /**
   * Appearance ("Look") bar — top of the editor canvas.
   *
   * Shows ONE appearance facet's quick controls at a time (Text / Fill / Box),
   * chosen by the activeFacet store. The facet auto-focuses to the first
   * applicable facet for the selection, and can be switched manually via the
   * facet tabs (or externally — e.g. a right-click "Edit colour" sets 'fill').
   *
   * Every control writes the same dot-paths the PropertiesPanel uses, so this
   * is a faster door into the same model, not a separate one.
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
  import { availableFonts, availableIcons } from '../stores/appSettings.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { activeFacet, setFacet, APPEARANCE_FACET_ORDER } from '../stores/editorFacet.js';
  import DeviceInsight from './DeviceInsight.svelte';
  import ScriptInsight from './ScriptInsight.svelte';

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

  let hasSelection = $derived($selectedComponentIds.size > 0);
  let multiSelect = $derived($selectedComponentIds.size > 1);

  // Which facets apply to the current selection, in display order.
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

  // The facet actually shown: the user's chosen facet if it applies, otherwise
  // the first applicable facet in priority order.
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
  // swatch activates a target there. The bar previously also offered the
  // native OS colour dialog beside each swatch: a second, different picker
  // for the same property, and one that could never touch the alpha byte.
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

<div class="look-bar">
  <div class="look-main">
  {#if !hasSelection}
    <div class="look-row"><span class="empty-state">No selection</span></div>
  {:else if facets.length === 0}
    <div class="look-row"><span class="empty-state">No appearance controls for this selection</span></div>
  {:else}
    <div class="look-row facet-row">
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
    </div>

    <div class="look-row control-row">
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
        <input
          class="number-field size-field"
          type="number"
          min="1"
          step="1"
          value={font?.size ?? 14}
          title="Font size"
          onfocus={(event) => event.target.select()}
          onchange={(event) => setNumber('Text.Font.size', event.target.value, font?.size ?? 14, 1)}
        />
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
          <input
            class="number-field size-field"
            type="number"
            min="0"
            step="1"
            value={backgroundCorners?.radius ?? 0}
            title="Corner radius"
            onfocus={(event) => event.target.select()}
            onchange={(event) => setNumber('Background.Corners.radius', event.target.value, backgroundCorners?.radius ?? 0, 0)}
          />
        {/if}
      </div>
    {:else if shownFacet === 'box'}
      <div class="prop-group">
        <span class="mini-label">W</span>
        <input class="number-field" type="number" min="1" step="1" value={transform?.width ?? 0} title="Width" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Transform.width', event.target.value, transform?.width ?? 0, 1)} />
        <span class="mini-label">H</span>
        <input class="number-field" type="number" min="1" step="1" value={transform?.height ?? 0} title="Height" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Transform.height', event.target.value, transform?.height ?? 0, 1)} />
        <span class="mini-label">R</span>
        <input class="number-field" type="number" step="1" value={transform?.rotation ?? 0} title="Rotation (degrees)" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Transform.rotation', event.target.value, transform?.rotation ?? 0)} />
        <span class="mini-label">O</span>
        <input class="number-field opacity-field" type="number" min="0" max="1" step="0.05" value={transform?.opacity ?? 1} title="Opacity" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Transform.opacity', event.target.value, transform?.opacity ?? 1, 0, 1)} />
      </div>
    {:else if shownFacet === 'effects'}
      <div class="prop-group toggle-group">
        <button class="text-toggle" class:active={shadowEnabled} title="Drop shadow" onclick={() => set('Effects.Shadows.items.0.enabled', !shadowEnabled)}>Shadow</button>
      </div>
      <div class="prop-group">
        <span class="mini-label">Blur</span>
        <input class="number-field" type="number" min="0" step="0.5" value={effects?._children?.Filters?.blur ?? 0} title="Blur" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Effects.Filters.blur', event.target.value, effects?._children?.Filters?.blur ?? 0, 0)} />
        <span class="mini-label">Brt</span>
        <input class="number-field" type="number" min="0" step="1" value={effects?._children?.Filters?.brightness ?? 100} title="Brightness" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Effects.Filters.brightness', event.target.value, effects?._children?.Filters?.brightness ?? 100, 0)} />
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
        <input class="number-field size-field" type="number" min="4" step="1" value={icon?.size ?? 16} title="Icon size" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Icon.size', event.target.value, icon?.size ?? 16, 4)} />
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
        <input class="number-field opacity-field" type="number" min="0" max="1" step="0.05" value={icon?.opacity ?? 1} title="Icon opacity" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Icon.opacity', event.target.value, icon?.opacity ?? 1, 0, 1)} />
        <span class="mini-label">R</span>
        <input class="number-field" type="number" step="1" value={icon?.rotation ?? 0} title="Icon rotation" onfocus={(event) => event.target.select()} onchange={(event) => setNumber('Icon.rotation', event.target.value, icon?.rotation ?? 0)} />
      </div>
      {/if}
    </div>
  {/if}
  </div>

  <DeviceInsight />
  <ScriptInsight />
</div>

<style>
  .look-bar {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 0;
    height: 100%;
    padding: 4px 10px;
    background: #272727;
    font-size: 11px;
  }

  .look-main {
    flex: 0 0 auto;
    width: 374px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
  }

  .look-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 22px;
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

  .font-select,
  .number-field {
    height: 22px;
    background: #1E1E1E;
    color: #DDD;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    font-size: 11px;
    font-family: inherit;
    outline: none;
  }

  .font-select {
    width: 118px;
    padding: 0 6px;
  }

  .number-field {
    width: 48px;
    padding: 0 4px;
    text-align: center;
    -moz-appearance: textfield;
  }

  .number-field::-webkit-inner-spin-button,
  .number-field::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .size-field {
    width: 42px;
  }

  .opacity-field {
    width: 44px;
  }

  .mini-label {
    color: #8A8A8A;
    font-size: 10px;
    font-weight: 700;
  }

  .toggle-group {
    gap: 1px;
  }

  .toggle-btn {
    background: #333;
    border: 1px solid #444;
    color: #999;
    width: 22px;
    height: 22px;
    font-size: 11px;
    cursor: pointer;
    display: flex;
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
</style>
