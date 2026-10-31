<script>
  /**
   * The options strip under the canvas: Snap, Grid and Smart, a View list, and ? for the shortcuts.
   *
   * The strip is as wide as the canvas column, which is narrow: about 490 pixels in a 1700-pixel
   * window and 300 at 1366. It held fifteen controls in a row that scrolled sideways, and at 1366
   * everything after Snap was out of sight. So what the canvas shows (Measure, Bounds, generated
   * names, hit zones and how they are drawn, the rulers) and the zoom step are in the View list,
   * and the strip wraps onto a second row rather than hide anything. Zoom itself is the status
   * bar's (StatusBar.svelte), the Dial, scales and arpeggiator are added from the palette's Value
   * Controls, and Blank canvas is the first entry of the Starters menu (SurfaceToolStrip.svelte).
   *
   * Second of the §5 decomposition. The prop list is long because this strip is a control panel —
   * every toggle on it owns a different piece of surface state — but long and checked beats short
   * and implicit: Svelte fails the build on a prop the parent forgets, which is the safety net
   * that makes moving 700 lines of a working editor a reasonable thing to do.
   *
   * Everything that writes goes through a named setter, so the parent keeps ownership of its own
   * state and this file stays a view. The View list's open state is the strip's own: nothing else
   * opens it.
   */
  import { floating } from '../utils/floatingUi.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let {
    // Snapping
    snapEnabled = false, setSnapEnabled = () => {},
    snapSize = 10, setSnapSize = () => {},
    smartSnapEnabled = false, setSmartSnapEnabled = () => {},
    // The View list: what the canvas shows, and the zoom step (the status bar's − and + use it)
    measureEnabled = false, setMeasureEnabled = () => {},
    showBounds = false,
    showGeneratedLabels = false,
    showHitZones = false,
    setPreviewFlag = () => {},
    zoneDisplayMode = 'selected', setZoneDisplayMode = () => {},
    surfaceShowRulers = true, setSurfaceShowRulers = () => {},
    surfaceZoomIncrement = 10, setZoomIncrement = () => {},
    // Arpeggiator, only while an arp kit is on the surface
    arpeggiatorEnabled = false,
    arpStepCount = 16, setArpStepCount = () => {},
    arpSelectedBlock = null,
    shiftArpOctave = () => {},
    removeSelectedArpBlock = () => {},
    helpOverlayOpen = false, setHelpOverlayOpen = () => {},
  } = $props();

  let viewOpen = $state(false);
  let viewHost = $state(null);

  // A click anywhere else closes the list, and so does Escape. Escape stops there: the designer's
  // own Escape would also drop the selection, which is not what closing a list should do. On the
  // document and bubbling, so the Zoom step field still gets its own Escape first.
  $effect(() => {
    if (!viewOpen) return;
    const onDown = (event) => { if (!viewHost?.contains(event.target)) viewOpen = false; };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      viewOpen = false;
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

  <div class="surface-options-strip" aria-label="Snapping and view options">
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

    <div class="view-host" bind:this={viewHost}>
      <button
        type="button"
        class="surface-command"
        class:accent={viewOpen}
        aria-expanded={viewOpen}
        title="What the canvas shows, and the zoom step"
        onclick={() => { viewOpen = !viewOpen; }}
      >View ▾</button>
      {#if viewOpen}
        <div class="view-list" role="group" aria-label="View options" use:floating={{ anchor: 'parent', placement: 'top-start', fallbackPlacements: ['bottom-start'] }}>
          <PropertyToggle label="Measure" title="Show pixel gaps between two selected layers" value={measureEnabled} onchange={(next) => setMeasureEnabled(next)} />
          <PropertyToggle label="Bounds" value={showBounds} onchange={(next) => { setPreviewFlag('showBounds', next) }} />
          <PropertyToggle label="Generated names" title="Show generated layer names on the canvas" value={showGeneratedLabels} onchange={(next) => { setPreviewFlag('showGeneratedLabels', next) }} />
          <PropertyToggle label="Hit zones" value={showHitZones} onchange={(next) => { setPreviewFlag('showHitZones', next) }} />
          <!-- Dimmed and All also switch hit zones on (the designer's setZoneDisplayMode). -->
          <div class="zone-mode-control" role="radiogroup" aria-label="Which hit zones are drawn">
            <button type="button" role="radio" aria-checked={zoneDisplayMode === 'selected'} class:active={zoneDisplayMode === 'selected'} onclick={() => setZoneDisplayMode('selected')} title="Show only the selected hit zone">Selected</button>
            <button type="button" role="radio" aria-checked={zoneDisplayMode === 'dim'} class:active={zoneDisplayMode === 'dim'} onclick={() => setZoneDisplayMode('dim')} title="Show all hit zones dimmed">Dimmed</button>
            <button type="button" role="radio" aria-checked={zoneDisplayMode === 'all'} class:active={zoneDisplayMode === 'all'} onclick={() => setZoneDisplayMode('all')} title="Show all hit zones">All</button>
          </div>
          <PropertyToggle label="Rulers" value={surfaceShowRulers} onchange={(next) => setSurfaceShowRulers(next)} />
          <label class="snap-size" title="How far − and + in the status bar zoom, in percent">
            <span>Zoom step</span>
            <span class="nc-wrap"><NumberCell value={surfaceZoomIncrement} onchange={(value) => setZoomIncrement(value)} min={1} max={100} /></span>
            <span>%</span>
          </label>
        </div>
      {/if}
    </div>

    <button type="button" class="surface-command" class:accent={helpOverlayOpen} onclick={() => setHelpOverlayOpen(!helpOverlayOpen)} title="Shortcuts &amp; glossary (?)">?</button>

    <!-- Last, so the controls above stay where they are when an arpeggiator comes and goes. -->
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
    /* A second row rather than a sideways scroll: a control scrolled out of sight is one nobody
       finds. With the View list holding the rest, it takes two rows only on a narrow canvas
       column (1366 wide), and one from about 1500. */
    flex-wrap: wrap;
    row-gap: 4px;
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
    min-height: 31px;
    padding: 3px 8px;
    background: linear-gradient(180deg, #172027, #11181F);
    border-bottom: none;
    border-top: 1px solid #26313A;
  }

  .view-host {
    display: inline-flex;
  }

  /* The View list: the same switches, one under another, over the canvas. It is position: fixed
     (floatingUi.js), so the strip does not clip it. */
  .view-list {
    z-index: 1600;
    display: grid;
    gap: 4px;
    width: 196px;
    padding: 6px;
    border: 1px solid #31434F;
    border-radius: 5px;
    background: #111A21;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.42);
  }

  .view-list .zone-mode-control {
    display: flex;
  }

  .surface-options-strip .view-list .zone-mode-control button {
    flex: 1;
    justify-content: center;
  }

  .surface-options-strip .view-list .snap-size {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
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
