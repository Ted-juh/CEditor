<script>
  /**
   * The Shapes palette down the left of the design surface: draw tools, value-control kits, pen,
   * fill, gradient, stroke, path operations, corner radius, and the three panel toggles at its
   * foot.
   *
   * Third of the §5 decomposition. Everything it draws with that another region also draws with —
   * the tool glyphs, the mini swatch buttons, the NumberCell wrapper — is defined once in the
   * parent under `.surface-shell :global(...)`; only the palette's own rules came with it.
   */
  import Copy from 'lucide-svelte/icons/copy';
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import ArrowDown from 'lucide-svelte/icons/arrow-down';
  import Lock from 'lucide-svelte/icons/lock';
  import Unlock from 'lucide-svelte/icons/lock-open';
  import PanelLeft from 'lucide-svelte/icons/panel-left';
  import PanelRight from 'lucide-svelte/icons/panel-right';
  import PanelBottom from 'lucide-svelte/icons/panel-bottom';
  import NumberCell from '../properties/NumberCell.svelte';
  import { clipPathForKind } from '../utils/shapeGeometry.js';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { numberOr } from '../utils/primitives.js';
  import { swatchCss } from '../utils/customDesignSurfaceHelpers.js';

  let {
    activeTool = 'select',
    shapeTools = [],
    vectorShapeTools = [],
    // The selected layer, as the palette needs to see it
    selectedAuthoredPart = null,
    selectedBackground = null,
    selectedFill = null,
    selectedBorder = null,
    selectedCorners = null,
    canPaintLayer = false,
    canManageLayer = false,
    // Panel visibility, owned by the parent because the grid template reads it too
    paletteCollapsed = false, setPaletteCollapsed = () => {},
    dockHidden = false, setDockHidden = () => {},
    displayDockHidden = false, setDisplayDockHidden = () => {},
    // Actions
    setActiveTool = () => {},
    addDialKit = () => {},
    addHorizontalScaleKit = () => {},
    addVerticalScaleKit = () => {},
    addArpeggiatorKit = () => {},
    addHitZoneAtCenter = () => {},
    addLayerAtCenter = () => {},
    setLayerProperty = () => {},
    openLayerColour = () => {},
    openLayerGradient = () => {},
    toggleFillGradient = () => {},
    duplicateSelectedLayer = () => {},
    moveSelectedLayerToExtreme = () => {},
    toggleSelectedLock = () => {},
  } = $props();
</script>

    <aside class="palette-panel" aria-label="Designer quick tools">
      <div class="palette-scroll">
      <div class="palette-header">
        <strong>Shapes</strong>
        <span>Draw and style</span>
      </div>

      <section class="palette-group">
        <span>Basic</span>
        <div class="palette-grid">
          {#each shapeTools as tool (tool.id)}
            <button
              type="button"
              class:active={activeTool === tool.id}
              title={`${tool.label} (${tool.key})`}
              onclick={() => setActiveTool(tool.id)}
            >
              <span class={`tool-icon ${tool.id}`}></span>
            </button>
          {/each}
        </div>
      </section>

      <section class="palette-group">
        <span>Lines &amp; Polygons</span>
        <div class="palette-grid">
          {#each vectorShapeTools as tool (tool.id)}
            <button
              type="button"
              class:active={activeTool === tool.id}
              title={tool.label}
              onclick={() => setActiveTool(tool.id)}
            >
              {#if tool.id === 'line'}
                <span class="poly-glyph line-glyph"></span>
              {:else}
                <span class="poly-glyph" style={`clip-path:${clipPathForKind(tool.id)}`}></span>
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <section class="palette-group">
        <span>Value Controls</span>
        <div class="palette-grid">
          <button type="button" onclick={addDialKit} title="Add circular dial value control">
            <span class="palette-glyph dial"></span>
          </button>
          <button type="button" onclick={addHorizontalScaleKit} title="Add horizontal tick scale">
            <span class="palette-glyph hscale"></span>
          </button>
          <button type="button" onclick={addVerticalScaleKit} title="Add vertical tick scale">
            <span class="palette-glyph vscale"></span>
          </button>
          <button type="button" onclick={addArpeggiatorKit} title="Add graphical arpeggiator kit">
            <span class="palette-glyph grid"></span>
          </button>
          <button type="button" onclick={addHitZoneAtCenter} title="Add hit zone">
            <span class="tool-icon hitZone"></span>
          </button>
          <button type="button" onclick={() => addLayerAtCenter('text')} title="Add text layer">
            <span class="tool-icon text"></span>
          </button>
        </div>
      </section>

      <section class="palette-group">
        <span>Pen</span>
        <div class="palette-grid brush-grid">
          <button type="button" class:active={activeTool === 'arcTrack'} onclick={() => setActiveTool('arcTrack')} title="Arc pen">
            <span class="brush-preview thin"></span>
          </button>
          <button type="button" class:active={activeTool === 'ring'} onclick={() => setActiveTool('ring')} title="Ring pen">
            <span class="brush-preview soft"></span>
          </button>
          <button type="button" class:active={activeTool === 'capsule'} onclick={() => setActiveTool('capsule')} title="Capsule pen">
            <span class="brush-preview bold"></span>
          </button>
        </div>
        <label class="palette-stepper">
          <span>Size</span>
          <span class="nc-wrap">
            <NumberCell
              min={1}
              max={24}
              value={Math.round(numberOr(selectedBorder?.thickness, 1))}
              defaultValue={1}
              disabled={!canPaintLayer}
              onchange={(value) => setLayerProperty('Background.Border.thickness', value)}
            />
          </span>
          <strong>px</strong>
        </label>
      </section>

      <section class="palette-group">
        <span>Fill</span>
        <label class="palette-swatch-row">
          <button type="button" class="mini-swatch-btn"
            disabled={!canPaintLayer || !selectedBackground}
            style={swatchCss(selectedFill?.colour)}
            onclick={() => openLayerColour('Background.Fill.colour', selectedFill?.colour)}
            title="Pick fill colour"
          ></button>
          <code>{selectedFill?.colour ? `#${String(selectedFill.colour).slice(-6)}` : '#14B8A6'}</code>
          <span class="swatch-num" title="Layer opacity (lower = more transparent)">
            <span class="nc-wrap">
              <NumberCell
                min={0}
                max={100}
                value={Math.round(numberOr(selectedAuthoredPart?.opacity, 1) * 100)}
                defaultValue={100}
                disabled={!canPaintLayer || !selectedBackground}
                onchange={(value) => setLayerProperty('opacity', Math.max(0, Math.min(1, value / 100)))}
              />
            </span>%
          </span>
        </label>
      </section>

      <section class="palette-group">
        <span>Gradient</span>
        <div class="palette-grid compact">
          <button type="button"
            class:active={selectedFill?.gradientEnabled}
            disabled={!canPaintLayer || !selectedBackground}
            onclick={toggleFillGradient}
            title={selectedFill?.gradientEnabled ? 'Disable gradient fill' : 'Enable gradient fill'}
          >G</button>
          {#if selectedFill?.gradientEnabled && selectedFill?.gradient}
            <button type="button" class="mini-gradient-btn wide"
              disabled={!canPaintLayer}
              style="background:{gradientToCSS(selectedFill?.gradient, 'rectangle')}"
              onclick={openLayerGradient}
              title="Edit gradient"
            ></button>
          {/if}
        </div>
      </section>

      <section class="palette-group">
        <span>Stroke</span>
        <label class="palette-swatch-row">
            <button type="button" class="mini-swatch-btn"
              disabled={!canPaintLayer || !selectedBackground}
              style={swatchCss(selectedBorder?.colour, 'FFFFFF')}
              onclick={() => openLayerColour('Background.Border.colour', selectedBorder?.colour)}
              title="Pick stroke colour"
            ></button>
          <code>{selectedBorder?.colour ? `#${String(selectedBorder.colour).slice(-6)}` : '#FFFFFF'}</code>
          <span class="swatch-num" title="Stroke thickness">
            <span class="nc-wrap">
              <NumberCell
                min={0}
                max={999}
                value={Math.round(numberOr(selectedBorder?.thickness, 1))}
                defaultValue={1}
                disabled={!canPaintLayer || !selectedBackground}
                onchange={(value) => setLayerProperty('Background.Border.thickness', value)}
              />
            </span>px
          </span>
        </label>
      </section>

      <section class="palette-group">
        <span>Path Operations</span>
        <div class="palette-grid compact">
          <button type="button" onclick={duplicateSelectedLayer} disabled={!canManageLayer} title="Duplicate">
            <Copy size={14} aria-hidden="true" />
          </button>
          <button type="button" onclick={() => moveSelectedLayerToExtreme('front')} disabled={!canManageLayer} title="Bring to front">
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button type="button" onclick={() => moveSelectedLayerToExtreme('back')} disabled={!canManageLayer} title="Send to back">
            <ArrowDown size={14} aria-hidden="true" />
          </button>
          <button type="button" onclick={toggleSelectedLock} disabled={!canManageLayer} title="Toggle lock">
            {#if selectedAuthoredPart?.locked === true}
              <Unlock size={14} aria-hidden="true" />
            {:else}
              <Lock size={14} aria-hidden="true" />
            {/if}
          </button>
        </div>
      </section>

      <section class="palette-group">
        <span>Corner</span>
        <label class="palette-corner">
          <span class="nc-wrap">
            <NumberCell
              min={0}
              max={999}
              value={numberOr(selectedCorners?.radius, 0)}
              defaultValue={0}
              disabled={!canPaintLayer || !selectedBackground}
              onchange={(value) => setLayerProperty('Background.Corners.radius', value)}
            />
          </span>
          <strong>radius</strong>
        </label>
      </section>
      </div>
      <div class="palette-toggles" aria-label="Panel toggles">
        <button type="button" class:active={!paletteCollapsed} title={paletteCollapsed ? 'Expand the Shapes palette' : 'Collapse the Shapes palette'} onclick={() => setPaletteCollapsed(!paletteCollapsed)}>
          <PanelLeft size={18} strokeWidth={1.6} />
        </button>
        <button type="button" class:active={!dockHidden} title="Toggle the inspector (right)" onclick={() => setDockHidden(!dockHidden)}>
          <PanelRight size={18} strokeWidth={1.6} />
        </button>
        <button type="button" class:active={!displayDockHidden} title="Toggle the Display panel (colours / gradient / align)" onclick={() => setDisplayDockHidden(!displayDockHidden)}>
          <PanelBottom size={18} strokeWidth={1.6} />
        </button>
      </div>
    </aside>

<style>
  .palette-panel { grid-area: palette; }

  /* Compact editable numeric field (e.g. stroke thickness) in a swatch row. */
  .swatch-num {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: #DFEAF0;
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
  }

  .palette-panel {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(28, 40, 49, 0.96), rgba(15, 22, 28, 0.96)),
      #111920;
    border-right: 1px solid #2A3741;
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.025);
  }

  .palette-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 12px 16px;
    scrollbar-width: thin;
  }

  /* Pane-toggle footer pinned at the bottom of the palette (like the normal
     editor's IconPanel toggles). Stays visible even when the palette collapses. */
  .palette-toggles {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: auto;
    padding: 8px 6px;
    border-top: 1px solid #26313A;
    background: rgba(13, 19, 24, 0.55);
  }

  .palette-toggles button {
    width: 34px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #2E3B45;
    border-radius: 5px;
    background: #172229;
    color: #8A99A5;
    cursor: pointer;
  }

  .palette-toggles button:hover {
    color: #DCEBFA;
    border-color: #3A4A56;
  }

  .palette-toggles button.active {
    color: var(--surface-accent, #14B8A6);
    border-color: rgba(20, 184, 166, 0.5);
    background: rgba(20, 184, 166, 0.12);
  }

  .palette-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    color: #E7F2F7;
  }

  .palette-header strong {
    font-size: 12px;
    font-weight: 800;
  }

  .palette-header span {
    color: #93A5B1;
    font-size: 10px;
    font-weight: 800;
  }

  .palette-group {
    display: grid;
    gap: 8px;
    padding: 0 0 13px;
    margin-bottom: 13px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  }

  .palette-group > span {
    color: #8FA4B0;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .palette-grid {
    display: grid;
    /* 6 columns so the 6 Basic shapes / Value Controls fit on a single row
       (no orphan icon wrapping to a second line). */
    grid-template-columns: repeat(6, 1fr);
    gap: 7px;
  }

  .palette-grid.compact,
  .palette-grid.brush-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .palette-grid button {
    display: grid;
    place-items: center;
    min-width: 0;
    height: 31px;
    border: 1px solid #303F49;
    border-radius: 4px;
    background: #1C2831;
    color: #DCEBFA;
    cursor: pointer;
  }

  .palette-grid button:hover,
  .palette-grid button.active {
    border-color: var(--surface-accent, #14B8A6);
    background: rgba(20, 184, 166, 0.18);
    color: #F3FFFD;
  }

  .palette-grid button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  /* Lines & polygons palette glyphs: a filled box clipped to the shape. */
  .poly-glyph {
    display: block;
    width: 16px;
    height: 16px;
    background: #DCEBFA;
  }

  .line-glyph {
    height: 2px;
    border-radius: 2px;
  }

  .palette-glyph {
    position: relative;
    display: block;
    width: 18px;
    height: 18px;
  }

  .palette-glyph.dial {
    border: 2px solid #DCEBFA;
    border-radius: 999px;
  }

  .palette-glyph.dial::after {
    content: '';
    position: absolute;
    left: 8px;
    top: 2px;
    width: 2px;
    height: 8px;
    border-radius: 999px;
    background: var(--surface-accent, #14B8A6);
  }

  .palette-glyph.hscale::before,
  .palette-glyph.vscale::before {
    content: '';
    position: absolute;
    border-radius: 999px;
    background: #DCEBFA;
  }

  .palette-glyph.hscale::before {
    left: 1px;
    right: 1px;
    top: 8px;
    height: 2px;
  }

  .palette-glyph.vscale::before {
    top: 1px;
    bottom: 1px;
    left: 8px;
    width: 2px;
  }

  .palette-glyph.hscale::after,
  .palette-glyph.vscale::after {
    content: '';
    position: absolute;
    background:
      linear-gradient(90deg, var(--surface-accent, #14B8A6) 0 2px, transparent 2px 6px, var(--surface-accent, #14B8A6) 6px 8px, transparent 8px 12px, var(--surface-accent, #14B8A6) 12px 14px);
  }

  .palette-glyph.hscale::after {
    left: 2px;
    top: 12px;
    width: 14px;
    height: 5px;
  }

  .palette-glyph.vscale::after {
    left: 1px;
    top: 2px;
    width: 5px;
    height: 14px;
    transform: rotate(90deg);
  }

  .palette-glyph.grid {
    background:
      linear-gradient(90deg, transparent 32%, #DCEBFA 32% 40%, transparent 40% 62%, #DCEBFA 62% 70%, transparent 70%),
      linear-gradient(0deg, transparent 32%, #DCEBFA 32% 40%, transparent 40% 62%, #DCEBFA 62% 70%, transparent 70%);
    border: 1px solid #DCEBFA;
  }

  .brush-preview {
    display: block;
    width: 24px;
    height: 3px;
    border-radius: 999px;
    background: #DCEBFA;
    transform: rotate(-20deg);
  }

  .brush-preview.soft {
    height: 5px;
    opacity: 0.8;
  }

  .brush-preview.bold {
    height: 7px;
    background: #8FA4B0;
  }

  .palette-stepper,
  .palette-swatch-row,
  .palette-corner {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    color: #9FB2BF;
    font-size: 10px;
    font-weight: 800;
  }

  .palette-swatch-row code,
  .palette-stepper strong,
  .palette-corner strong {
    min-width: 0;
    color: #DFEAF0;
    font: inherit;
    font-size: 10px;
    white-space: nowrap;
  }
</style>
