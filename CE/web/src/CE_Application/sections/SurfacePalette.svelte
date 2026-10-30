<script>
  /**
   * The Shapes palette down the left of the design surface: the draw tools, value-control kits and
   * pens, and the three panel toggles at its foot.
   *
   * It drew and styled. Its Fill, Gradient, Stroke, Corner and Pen "Size" (the stroke width again)
   * edited the selected layer only, and were greyed out without one, so they set nothing for the
   * next shape. The look bar along the top edits all of them, the dock's Colors and Gradient tabs
   * are the full editors, and "Path Operations" (duplicate, front, back, lock) was the layer quick
   * bar again. A layer was styled in three places; it is styled in the look bar and the dock now,
   * and this palette is for drawing.
   *
   * Third of the §5 decomposition. Everything it draws with that another region also draws with —
   * the tool glyphs, the mini swatch buttons, the NumberCell wrapper — is defined once in the
   * parent under `.surface-shell :global(...)`; only the palette's own rules came with it.
   */
  import PanelLeft from 'lucide-svelte/icons/panel-left';
  import PanelRight from 'lucide-svelte/icons/panel-right';
  import PanelBottom from 'lucide-svelte/icons/panel-bottom';
  import { clipPathForKind } from '../utils/shapeGeometry.js';

  let {
    activeTool = 'select',
    shapeTools = [],
    vectorShapeTools = [],
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
  } = $props();
</script>

    <aside class="palette-panel" aria-label="Designer quick tools">
      <div class="palette-scroll">
      <div class="palette-header">
        <strong>Shapes</strong>
        <span>Draw</span>
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
              title={tool.key ? `${tool.label} (${tool.key})` : tool.label}
              onclick={() => setActiveTool(tool.id)}
            >
              {#if tool.id === 'line'}
                <span class="poly-glyph line-glyph"></span>
              {:else if tool.id === 'pen'}
                <!-- A pen nib: the Pen draws outlines point by point (SurfacePenTool.svelte). -->
                <svg class="pen-glyph" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 1.5 12.5 8 8 14.5 3.5 8Z M8 8V14.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  <circle cx="8" cy="7.2" r="1.3" fill="currentColor"/>
                </svg>
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

  .pen-glyph {
    width: 16px;
    height: 16px;
    color: currentColor;
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

</style>
