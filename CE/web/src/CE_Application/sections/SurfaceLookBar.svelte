<script>
  /**
   * The look bar across the top of the design surface: the selected layer's fill, stroke, corner
   * radius and text styling, plus the Scripts affordance.
   *
   * Fourth of the §5 decomposition. Small prop list for its size, because the bar reads one thing
   * — the selected layer — and writes through one function.
   */
  import NumberCell from '../properties/NumberCell.svelte';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { numberOr } from '../utils/primitives.js';
  import { numericInputValue, swatchCss } from '../utils/customDesignSurfaceHelpers.js';

  let {
    activeSelectionKind = '',
    canPaintLayer = false,
    selectedAuthoredPart = null,
    selectedPart = null,
    selectedBackground = null,
    selectedFill = null,
    selectedBorder = null,
    selectedCorners = null,
    selectedIsArc = false,
    selectedText = null,
    selectedTextFill = null,
    selectedTextFont = null,
    componentScriptsEnabled = false,
    componentScriptList = [],
    setLayerProperty = () => {},
    openLayerColour = () => {},
    openLayerGradient = () => {},
    toggleFillGradient = () => {},
    openComponentScripts = () => {},
  } = $props();
</script>

  <div class="surface-lookbar" aria-label="Component look bar">
    {#if activeSelectionKind === 'layer' && selectedPart}
    <div class="paint-strip" class:disabled={!canPaintLayer} aria-label="Layer paint controls">
      {#if selectedBackground}
        {#if !selectedIsArc}
          <label class="paint-swatch">
            <span>Fill</span>
            <button
              type="button"
              class="fill-toggle"
              class:active={selectedFill?.solidEnabled !== false}
              disabled={!canPaintLayer}
              title={selectedFill?.solidEnabled !== false ? 'Make transparent' : 'Enable fill'}
              onclick={() => setLayerProperty('Background.Fill.solidEnabled', selectedFill?.solidEnabled !== false ? false : true)}
            ></button>
            <button type="button" class="mini-swatch-btn"
              disabled={!canPaintLayer || selectedFill?.solidEnabled === false}
              style={swatchCss(selectedFill?.colour)}
              onclick={() => openLayerColour('Background.Fill.colour', selectedFill?.colour)}
              title="Pick fill colour"
            ></button>
          </label>
        {/if}
        {#if selectedFill?.gradientEnabled}
          <label class="paint-swatch">
            <span>Grad</span>
            <button type="button" class="mini-gradient-btn"
              disabled={!canPaintLayer}
              style="background:{gradientToCSS(selectedFill?.gradient, 'rectangle')}"
              onclick={openLayerGradient}
              title="Edit gradient"
            ></button>
          </label>
        {/if}
        <label class="paint-swatch">
          <span>Gradient</span>
          <button type="button" class="fill-toggle"
            class:active={selectedFill?.gradientEnabled}
            disabled={!canPaintLayer}
            onclick={toggleFillGradient}
            title={selectedFill?.gradientEnabled ? 'Disable gradient' : 'Enable gradient'}
          >G</button>
        </label>
        <label class="paint-swatch">
          <span>Stroke</span>
            <button type="button" class="mini-swatch-btn"
              disabled={!canPaintLayer}
              style={swatchCss(selectedBorder?.colour, 'FFFFFF')}
              onclick={() => openLayerColour('Background.Border.colour', selectedBorder?.colour)}
              title="Pick stroke colour"
            ></button>
        </label>
        <label class="paint-number">
          <span>W</span>
          <span class="nc-wrap">
            <NumberCell
              min={0}
              max={32}
              step={1}
              value={numberOr(selectedBorder?.thickness, 0)}
              defaultValue={0}
              disabled={!canPaintLayer}
              onchange={(value) => setLayerProperty('Background.Border.thickness', value)}
            />
          </span>
        </label>
        <label class="paint-number">
          <span>R</span>
          <span class="nc-wrap">
            <NumberCell
              min={0}
              max={999}
              step={1}
              value={numberOr(selectedCorners?.radius, 0)}
              defaultValue={0}
              disabled={!canPaintLayer}
              onchange={(value) => setLayerProperty('Background.Corners.radius', value)}
            />
          </span>
        </label>
      {/if}

      {#if selectedText}
        <label class="paint-swatch">
          <span>Text</span>
            <button type="button" class="mini-swatch-btn"
              disabled={!canPaintLayer}
              style={swatchCss(selectedTextFill?.colour, 'FFFFFF')}
              onclick={() => openLayerColour('Text.Fill.colour', selectedTextFill?.colour)}
              title="Pick text colour"
            ></button>
        </label>
        <label class="paint-number text-size">
          <span>Size</span>
          <span class="nc-wrap">
            <NumberCell
              min={6}
              max={144}
              step={1}
              value={numberOr(selectedTextFont?.size, 12)}
              defaultValue={12}
              disabled={!canPaintLayer}
              onchange={(value) => setLayerProperty('Text.Font.size', value)}
            />
          </span>
        </label>
        <label class="text-content-field">
          <span>Content</span>
          <input
            type="text"
            value={selectedText?.content ?? ''}
            disabled={!canPaintLayer}
            oninput={(event) => setLayerProperty('Text.content', event.currentTarget.value)}
          />
        </label>
      {/if}

      <label class="paint-opacity">
        <span>Opacity</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={numberOr(selectedAuthoredPart?.opacity, 1)}
          disabled={!canPaintLayer}
          oninput={(event) => setLayerProperty('opacity', numericInputValue(event, 1))}
        />
        <strong>{Math.round(numberOr(selectedAuthoredPart?.opacity, 1) * 100)}%</strong>
      </label>
    </div>
    {:else}
      <div class="lookbar-empty">Select a layer to edit its look</div>
    {/if}
    <div class="lookbar-scripts" aria-label="Component scripts">
      <div class="lb-s-row">
        <span class="lb-s-chip">SCRIPTS</span>
        {#if componentScriptList.length > 0}
          <span class="lb-s-count">{componentScriptList.length} script{componentScriptList.length === 1 ? '' : 's'}</span>
          <span class={['lb-s-badge', componentScriptsEnabled ? 'on' : 'off']}>{componentScriptsEnabled ? 'on' : 'off'}</span>
        {:else}
          <span class="lb-s-none">none</span>
        {/if}
      </div>
      <div class="lb-s-row">
        <span class="lb-s-hint">{componentScriptList.length > 0 ? 'logic attached' : 'no logic attached'}</span>
        <button type="button" class="lb-s-btn" onclick={openComponentScripts} title="Open the Script Editor for this component">Script Editor</button>
      </div>
    </div>
  </div>

<style>
  .surface-lookbar { grid-area: lookbar; }

  .paint-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 8px;
    background: #15191C;
    border-bottom: 1px solid #2A2A2A;
    color: #B9C8D4;
    overflow-x: auto;
  }

  /* Top Look bar: quick-actions toolbar (left) + Scripts (right). */
  .surface-lookbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 50px;
    padding: 0 10px;
    background: linear-gradient(180deg, #172027, #11181F);
    border-bottom: 1px solid #26313A;
    overflow: hidden;
  }

  .surface-lookbar .paint-strip {
    flex: 1;
    min-width: 0;
    background: transparent;
    border-bottom: none;
    padding: 6px 0;
  }

  .lookbar-scripts {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding-left: 14px;
    border-left: 1px solid #2D3A44;
    font-size: 11px;
  }

  .paint-strip.disabled {
    color: #727D86;
  }

  .paint-strip label {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 7px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #202427;
    font-size: 10px;
    white-space: nowrap;
  }

  .paint-strip label:focus-within {
    border-color: #5B9BD5;
    box-shadow: 0 0 0 1px rgba(91, 155, 213, 0.35);
  }

  .paint-strip span,
  .paint-strip strong {
    font-weight: 700;
  }

  .paint-strip input:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }


  .lookbar-empty {
    flex: 1;
    color: #6F7E8A;
    font-size: 11px;
    font-style: italic;
  }

  .lb-s-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .lb-s-chip {
    color: #14B8A6;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .lb-s-count {
    color: #E6EEF3;
    font-weight: 600;
    white-space: nowrap;
  }

  .lb-s-none,
  .lb-s-hint {
    color: #7F8B94;
    font-size: 10px;
    white-space: nowrap;
  }

  .lb-s-btn {
    margin-left: auto;
    height: 22px;
    padding: 0 9px;
    border-radius: 4px;
    border: 1px solid #2D3A44;
    background: #18232B;
    color: #B9C8D4;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .lb-s-btn:hover {
    color: #EAF5FF;
    border-color: rgba(20, 184, 166, 0.5);
    background: rgba(20, 184, 166, 0.14);
  }

  .fill-toggle {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid #2E3B45;
    border-radius: 3px;
    background: #1A242D;
    color: #6B7A86;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
    line-height: 1;
  }

  .fill-toggle.active {
    border-color: #14B8A6;
    background: rgba(20, 184, 166, 0.22);
    color: #8FEDE3;
  }

  .fill-toggle:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .text-content-field {
    min-width: 176px;
  }

  .text-content-field input {
    width: 128px;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid #3B4650;
    border-radius: 3px;
    background: #111518;
    color: #E8EEF5;
    font: inherit;
    font-size: 10px;
  }

  .paint-opacity {
    min-width: 160px;
  }

  .paint-opacity input {
    width: 78px;
    accent-color: #5B9BD5;
  }

  .paint-opacity strong {
    width: 34px;
    text-align: right;
    color: #E8EEF5;
  }
</style>
