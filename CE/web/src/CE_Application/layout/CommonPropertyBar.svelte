<script>
  /**
   * Common Property Bar — quick-access properties for the selected component.
   * Shows contextual quick controls for the selected component.
   */
  import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-svelte';
  import { selectedControl, getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { availableFonts } from '../stores/appSettings.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { componentWorkspaceMode } from '../stores/componentWorkspace.js';
  import DisplayToolbar from '../components/DisplayToolbar.svelte';

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
  let selectedStates = $derived(getSection(control, 'States'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let valueSection = $derived(getSection(control, 'Value'));
  let buttonType = $derived(String(behavior?.buttonType ?? '').trim().toLowerCase());
  let hasSelection = $derived($selectedComponentIds.size > 0);
  let weightedFontSelected = $derived(
    $availableFonts.find(option => option.value === (font?.family ?? 'Arial'))?.supportsWeight === true
  );
  let effectiveWeightValue = $derived(font?.weightValue ?? (font?.weight === 'Bold' ? 700 : 400));
  let boldActive = $derived(weightedFontSelected ? effectiveWeightValue >= 700 : font?.weight === 'Bold');
  let textColour = $derived(toDisplayColour(textFill?.colour ?? 'FFFFFFFF'));
  let backgroundColour = $derived(toDisplayColour(backgroundFill?.colour ?? 'FF3A3A3A'));
  let borderColour = $derived(toDisplayColour(backgroundBorder?.colour ?? '66FFFFFF'));
  let justification = $derived(String(position?.justification ?? 'centred'));
  let showStateToolbar = $derived(
    String(behavior?.buttonType ?? '').trim().length > 0
    && Object.keys(selectedStates?._children ?? {}).length > 0
  );
  let showSegmentToolbar = $derived(buttonType === 'radio' && Array.isArray(valueSection?.rows) && valueSection.rows.length > 0);
  let showTextControls = $derived(!!text);
  let showBackgroundControls = $derived(!!background);
  let showTransformControls = $derived(!!transform);
  let showBehaviorControls = $derived(!!behavior);
  let hasQuickControls = $derived(showTextControls || showBackgroundControls || showTransformControls || showBehaviorControls);
  let componentDesignerActive = $derived(
    $componentWorkspaceMode === 'surface'
    && String(core?.controlType ?? '') === 'CustomComponent'
  );

  function set(path, value) {
    if (!core?.id || !path) return;
    if ($selectedComponentIds.size > 1) {
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

  function toStoredColour(value, previous = 'FFFFFFFF') {
    const hex = String(value ?? '').replace(/^#/, '').toUpperCase();
    if (hex.length !== 6) return previous;
    const previousHex = String(previous ?? '').replace(/^#/, '').toUpperCase();
    const alpha = previousHex.length === 8 ? previousHex.slice(0, 2) : 'FF';
    return `${alpha}${hex}`;
  }

  function setColour(path, value, previous) {
    set(path, toStoredColour(value, previous));
  }

  function openColour(path, previous) {
    if (!core?.id || $selectedComponentIds.size > 1) return;
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

  function hasBehaviorPath(path) {
    return Object.prototype.hasOwnProperty.call(behavior ?? {}, path);
  }
</script>

<div class="common-bar">
  {#if componentDesignerActive}
    <span class="empty-state designer-state">Designer controls are active in the component workspace</span>
  {:else if hasQuickControls}
    {#if showTextControls}
      <div class="section-chip">Text</div>
      <div class="prop-group">
        <input
          class="color-swatch"
          type="color"
          value={textColour}
          style="background: {textColour};"
          title="Text colour"
          onchange={(event) => setColour('Text.Fill.colour', event.target.value, textFill?.colour)}
        />
        <button class="target-btn" title="Open text colour in Colors panel" onclick={() => openColour('Text.Fill.colour', textFill?.colour)}>...</button>
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
    {/if}

    {#if showTextControls && (showBackgroundControls || showTransformControls || showBehaviorControls)}
      <div class="divider"></div>
    {/if}

    {#if showBackgroundControls}
      <div class="section-chip">Fill</div>
      <div class="prop-group">
        <input
          class="color-swatch"
          type="color"
          value={backgroundColour}
          style="background: {backgroundColour};"
          title="Background fill colour"
          onchange={(event) => setColour('Background.Fill.colour', event.target.value, backgroundFill?.colour)}
        />
        <button class="target-btn" title="Open fill colour in Colors panel" onclick={() => openColour('Background.Fill.colour', backgroundFill?.colour)}>...</button>
        <span class="mini-label">R</span>
        <input
          class="number-field size-field"
          type="number"
          min="0"
          step="1"
          value={backgroundCorners?.radius ?? 0}
          title="Corner radius"
          onchange={(event) => setNumber('Background.Corners.radius', event.target.value, backgroundCorners?.radius ?? 0, 0)}
        />
        {#if backgroundBorder}
          <input
            class="color-swatch"
            type="color"
            value={borderColour}
            style="background: {borderColour};"
            title="Border colour"
            onchange={(event) => setColour('Background.Border.colour', event.target.value, backgroundBorder?.colour)}
          />
        {/if}
      </div>
    {/if}

    {#if showBackgroundControls && (showTransformControls || showBehaviorControls)}
      <div class="divider"></div>
    {/if}

    {#if showTransformControls}
      <div class="section-chip">Box</div>
      <div class="prop-group">
        <span class="mini-label">W</span>
        <input class="number-field" type="number" min="1" step="1" value={transform?.width ?? 0} title="Width" onchange={(event) => setNumber('Transform.width', event.target.value, transform?.width ?? 0, 1)} />
        <span class="mini-label">H</span>
        <input class="number-field" type="number" min="1" step="1" value={transform?.height ?? 0} title="Height" onchange={(event) => setNumber('Transform.height', event.target.value, transform?.height ?? 0, 1)} />
        <span class="mini-label">O</span>
        <input class="number-field opacity-field" type="number" min="0" max="1" step="0.05" value={transform?.opacity ?? 1} title="Opacity" onchange={(event) => setNumber('Transform.opacity', event.target.value, transform?.opacity ?? 1, 0, 1)} />
      </div>
    {/if}

    {#if showTransformControls && showBehaviorControls}
      <div class="divider"></div>
    {/if}

    {#if showBehaviorControls}
      <div class="section-chip">Input</div>
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
  {:else if hasSelection}
    <span class="empty-state">No quick controls for this selection</span>
  {:else}
    <span class="empty-state">No selection</span>
  {/if}

  {#if showStateToolbar || showSegmentToolbar}
    <div class="divider"></div>
    <div class="toolbar-slot">
      <DisplayToolbar />
    </div>
  {/if}

  <div class="spacer"></div>
</div>

<style>
  .common-bar {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 10px;
    gap: 8px;
    background: #272727;
    font-size: 11px;
  }

  .designer-state {
    color: #8DBFE5;
    font-weight: 700;
  }

  .section-chip {
    flex: 0 0 auto;
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
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
    background: transparent;
  }

  .color-swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .color-swatch::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }

  .target-btn {
    width: 20px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #444;
    background: #333;
    color: #999;
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
    padding: 0;
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

  .divider {
    width: 1px;
    height: 16px;
    background: #3A3A3A;
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

  .toggle-btn:first-child { border-radius: 3px 0 0 3px; }
  .toggle-btn:last-child  { border-radius: 0 3px 3px 0; }

  .toggle-btn:hover,
  .target-btn:hover,
  .text-toggle:hover {
    background: #444;
    color: #DDD;
  }

  .toggle-btn.active,
  .text-toggle.active {
    background: #094771;
    color: #FFF;
    border-color: #0B6EB5;
  }

  .empty-state {
    color: #777;
    font-size: 11px;
  }

  .spacer { flex: 1; }

  .toolbar-slot {
    min-width: 0;
    display: flex;
    align-items: center;
  }
</style>
