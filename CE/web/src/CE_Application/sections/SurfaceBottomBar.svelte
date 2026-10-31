<script>
  /**
   * The options strip under the canvas: snapping and view toggles on the left, the zoom step and
   * the rulers on the right. Zoom itself (−, the value, +, 100%, Fit) is the status bar's, which the
   * designer drives (StatusBar.svelte), and the Dial, scales and arpeggiator are added from the
   * palette's Value Controls. This strip had a second copy of both, and they took the room the
   * toggles needed: at 1700 pixels wide everything after Bounds had scrolled out of sight.
   *
   * Second of the §5 decomposition. The prop list is long because this strip is a control panel —
   * every toggle on it owns a different piece of surface state — but long and checked beats short
   * and implicit: Svelte fails the build on a prop the parent forgets, which is the safety net
   * that makes moving 700 lines of a working editor a reasonable thing to do.
   *
   * Everything that writes goes through a named setter, so the parent keeps ownership of its own
   * state and this file stays a view.
   */
  import Ruler from 'lucide-svelte/icons/ruler';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let {
    // Snapping and overlays
    snapEnabled = false, setSnapEnabled = () => {},
    snapSize = 10, setSnapSize = () => {},
    smartSnapEnabled = false, setSmartSnapEnabled = () => {},
    measureEnabled = false, setMeasureEnabled = () => {},
    showBounds = false,
    showGeneratedLabels = false,
    showHitZones = false,
    setPreviewFlag = () => {},
    zoneDisplayMode = 'selected', setZoneDisplayMode = () => {},
    // Arpeggiator, only while an arp kit is on the surface
    arpeggiatorEnabled = false,
    arpStepCount = 16, setArpStepCount = () => {},
    arpSelectedBlock = null,
    shiftArpOctave = () => {},
    removeSelectedArpBlock = () => {},
    resetToBlankCanvas = () => {},
    helpOverlayOpen = false, setHelpOverlayOpen = () => {},
    // The zoom step (the status bar's − and + use it) and the rulers
    surfaceZoomIncrement = 10, setZoomIncrement = () => {},
    surfaceShowRulers = true, setSurfaceShowRulers = () => {},
  } = $props();
</script>

  <div class="surface-options-strip" aria-label="Surface view + zoom options">
    <div class="surface-toolbar-left">
    <!-- Simple/Advanced is not here: it decides what the properties panel shows, and the switch at
         the foot of that panel is the one (this strip had a second). -->
    <PropertyToggle compact label="Snap" value={snapEnabled} onchange={(next) => setSnapEnabled(next)} />
    <label class="snap-size">
      <span>Grid</span>
      <span class="nc-wrap">
        <NumberCell
          min={1}
          max={64}
          step={1}
          value={snapSize}
          disabled={!snapEnabled}
          onchange={(value) => setSnapSize(value)}
        />
      </span>
    </label>
    <PropertyToggle compact label="Smart" title="Snap to other parts' edges and the artboard (Alt bypasses)" value={smartSnapEnabled} onchange={(next) => setSmartSnapEnabled(next)} />
    <PropertyToggle compact label="Measure" title="Show pixel gaps between two selected layers" value={measureEnabled} onchange={(next) => setMeasureEnabled(next)} />
    <PropertyToggle compact label="Bounds" value={showBounds} onchange={(next) => { setPreviewFlag('showBounds', next) }} />
    <PropertyToggle compact label="Gen Names" title="Show generated layer names on the canvas" value={showGeneratedLabels} onchange={(next) => { setPreviewFlag('showGeneratedLabels', next) }} />
    <PropertyToggle compact label="Zones" value={showHitZones} onchange={(next) => { setPreviewFlag('showHitZones', next) }} />
    <div class="zone-mode-control" role="radiogroup" aria-label="Zone display mode">
      <button type="button" role="radio" aria-checked={zoneDisplayMode === 'selected'} class:active={zoneDisplayMode === 'selected'} onclick={() => setZoneDisplayMode('selected')} title="Show only the selected hit zone">Sel</button>
      <button type="button" role="radio" aria-checked={zoneDisplayMode === 'dim'} class:active={zoneDisplayMode === 'dim'} onclick={() => setZoneDisplayMode('dim')} title="Show all hit zones dimmed">Dim</button>
      <button type="button" role="radio" aria-checked={zoneDisplayMode === 'all'} class:active={zoneDisplayMode === 'all'} onclick={() => setZoneDisplayMode('all')} title="Show all hit zones">All</button>
    </div>
    {#if arpeggiatorEnabled}
      <label class="snap-size">
        <span>Steps</span>
        <span class="nc-wrap">
          <NumberCell
            min={1}
            max={256}
            step={1}
            value={arpStepCount}
            onchange={(value) => setArpStepCount(value)}
          />
        </span>
      </label>
      <div class="zone-mode-control" aria-label="Arpeggiator octave">
        <button type="button" onclick={() => shiftArpOctave(-1)} title="Show lower octave">Oct -</button>
        <button type="button" onclick={() => shiftArpOctave(1)} title="Show higher octave">Oct +</button>
      </div>
      <button type="button" class="surface-command danger" onclick={removeSelectedArpBlock} disabled={!arpSelectedBlock} title="Delete selected note block">Delete note</button>
    {/if}
    <button type="button" class="surface-command" class:accent={helpOverlayOpen} onclick={() => setHelpOverlayOpen(!helpOverlayOpen)} title="Shortcuts &amp; glossary (?)">?</button>
    <!-- Last, and in the danger colour. It used to sit between "Delete note" and "Dial", which put
         a whole-canvas wipe one slot from the button people press most. -->
    <button type="button" class="surface-command danger" onclick={resetToBlankCanvas} title="Clear this component to a blank drawing canvas">Blank</button>
    </div>

    <div class="surface-zoombar" aria-label="Zoom step and rulers">
      <span class="szb-inc-label" title="How far − and + in the status bar zoom, in percent">Zoom step</span>
      <span class="szb-inc-input nc-wrap"><NumberCell value={surfaceZoomIncrement} onchange={(value) => setZoomIncrement(value)} min={1} max={100} /></span>
      <div class="szb-divider"></div>
      <button type="button" class="szb-btn icon" class:toggle-on={surfaceShowRulers} onclick={() => setSurfaceShowRulers(!surfaceShowRulers)} title="Toggle rulers"><Ruler size={12} strokeWidth={1.6} /></button>
    </div>
  </div>

<style>

  .surface-options-strip { grid-area: toolbar; }

  .surface-options-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 8px;
    background: #15181A;
    border-bottom: 1px solid #2A2A2A;
    color: #B9C8D4;
    overflow-x: auto;
  }

  .surface-options-strip label,
  .surface-options-strip button {
    display: inline-grid;
    grid-auto-flow: column;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #202427;
    color: #B9C8D4;
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .surface-options-strip button {
    cursor: pointer;
  }

  .surface-options-strip button:hover {
    border-color: var(--surface-accent, #14B8A6);
    background: #173449;
    color: #EAF5FF;
  }

  .surface-options-strip .surface-command {
    border-color: #3B4650;
    background: #1D252B;
  }

  .surface-options-strip .surface-command.accent {
    border-color: rgba(229, 160, 41, 0.56);
    color: #FFE6B2;
  }

  .surface-options-strip .surface-command.danger {
    border-color: rgba(225, 88, 88, 0.5);
    color: #FFD4D4;
  }

  .surface-options-strip .surface-command:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .zone-mode-control {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 2px;
    border: 1px solid #303840;
    border-radius: 4px;
    background: #202427;
  }

  .surface-options-strip .zone-mode-control button {
    height: 22px;
    padding: 0 7px;
    border-color: transparent;
    background: transparent;
  }

  .surface-options-strip .zone-mode-control button.active {
    border-color: rgba(229, 160, 41, 0.5);
    background: rgba(229, 160, 41, 0.16);
    color: #FFE6B2;
  }/* (.surface-body wrapper removed — the shell itself is the CSS grid now.) */

  .surface-options-strip {
    justify-content: space-between;
    min-height: 31px;
    padding: 3px 8px;
    background: linear-gradient(180deg, #172027, #11181F);
    border-bottom: none;
    border-top: 1px solid #26313A;
    scrollbar-width: thin;
    gap: 12px;
  }

  .surface-toolbar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  /* Teal zoom controls (right side) — mirrors the Panel Designer's ZoomBar. */
  .surface-zoombar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .surface-zoombar .szb-btn {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #2D3A44;
    border-radius: 4px;
    background: #18232B;
    color: #9FB2BF;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 0;
  }

  .surface-zoombar .szb-btn:hover {
    color: #DCEBFA;
    border-color: #3A4A56;
  }

  .surface-zoombar .szb-btn.icon {
    width: auto;
    padding: 0 5px;
  }

  .surface-zoombar .szb-btn.toggle-on {
    color: var(--surface-accent, #14B8A6);
    border-color: rgba(20, 184, 166, 0.5);
    background: rgba(20, 184, 166, 0.14);
  }

  .szb-inc-label {
    color: #6F7E8A;
    font-size: 10px;
    white-space: nowrap;
  }

  .surface-zoombar .szb-inc-input {
    width: 44px;
  }

  .szb-divider {
    width: 1px;
    height: 14px;
    background: #2D3A44;
    margin: 0 3px;
  }

  .surface-options-strip label,
  .surface-options-strip button,
  .zone-mode-control {
    height: 24px;
    border-color: #2D3A44;
    border-radius: 4px;
    background: #18232B;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
  }

  .surface-options-strip .surface-command.accent {
    border-color: rgba(20, 184, 166, 0.54);
    color: #BFFAF2;
  }
</style>
