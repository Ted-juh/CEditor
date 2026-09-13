<script>
  /**
   * The screen, at a size you can work on, with its regions drawn on it.
   *
   * TWO KINDS, TWO ROUTES, AND THE ASYMMETRY IS THE POINT.
   *
   * `PixelDisplay` elements are ALREADY draggable and resizable — `PixelDisplayRenderer` does it
   * itself when `editable` is set, with snap-to-grid and grouped moves, writing through
   * `updateControlProperty`. So the pixel half of this stage is that renderer, given room. Writing a
   * second drag here would be a second answer to a question already answered, and the two would
   * drift.
   *
   * `LcdDisplay` zones have no such thing. `LcdDisplayRenderer` takes no `editable` prop and
   * contains no drag code at all: a zone is `row`, `colStart`, `colEnd` in a nine-column table, and
   * that is the only way to place it. So the overlay below is the LCD half, and it is the part of
   * this tab that did not exist anywhere.
   *
   * The overlay's geometry comes from `cellGeometry`, which mirrors the renderer's own three lines
   * and is guarded by a test that reads the renderer. A box that does not sit around the letters
   * would be worse than no box.
   */
  import LcdDisplayRenderer from '../../editor/LcdDisplayRenderer.svelte';
  import PixelDisplayRenderer from '../../editor/PixelDisplayRenderer.svelte';
  import { getSection } from '../../stores/controls.js';
  import {
    cellGeometry,
    rectBox,
    pointToCell,
    itemRect,
    fitRect,
    placementIssue,
    renderedRect,
    offGridEdge,
  } from '../../utils/screenModel.js';

  let {
    control = null,
    allControls = [],
    kind = 'lcd',
    screen = null,
    grid = { unitsX: 16, unitsY: 2, unit: 'cell' },
    items = [],
    selectedIndex = -1,
    onselect = () => {},
    onmove = () => {},
  } = $props();

  const MAX_HEIGHT = 200;

  let hostWidth = $state(560);
  let stageEl = $state(null);

  let transform = $derived(getSection(control, 'Transform'));
  let aspect = $derived.by(() => {
    const w = Math.max(1, Number(transform?.width) || 260);
    const h = Math.max(1, Number(transform?.height) || 100);
    return h / w;
  });

  // Fit the control's own shape into the column, capped so the dock is not swallowed.
  let renderW = $derived(Math.max(120, Math.min(hostWidth, MAX_HEIGHT / aspect)));
  let renderH = $derived(Math.max(60, Math.round(renderW * aspect)));

  let geometry = $derived(cellGeometry({ width: renderW, height: renderH, grid, kind, screen }));

  // A box is drawn WHERE THE RENDERER WILL PAINT IT, not where its numbers say. A zone whose
  // columns run off the right really is painted, clamped to one cell at the edge, so that is what
  // the box shows; one whose row is off the screen is painted nowhere, so it gets no box at all and
  // a marker on the edge it fell off instead. Drawing the literal numbers would put an amber
  // rectangle over the settings column, which is a picture of something that never happens.
  let boxes = $derived((items ?? []).map((item, index) => {
    const issue = placementIssue(item, grid, kind);
    const drawn = renderedRect(item, grid, kind);
    return {
      index,
      item,
      rect: itemRect(item, kind),
      drawn,
      box: drawn ? rectBox(drawn, geometry) : null,
      edge: drawn ? '' : offGridEdge(item, grid, kind),
      issue,
    };
  }));

  // --- Dragging (LCD only; the pixel renderer does its own) ---------------------

  let drag = $state(null);

  function begin(entry, mode, event) {
    if (kind !== 'lcd') return;
    event.preventDefault();
    event.stopPropagation();
    onselect(entry.index);
    const cell = pointToCell(offsetOf(event).x, offsetOf(event).y, geometry, grid);
    drag = { index: entry.index, mode, rect: { ...entry.rect }, from: cell };
    // Capture is an optimisation, not the mechanism: move and up are bound on the stage, so the
    // drag works without it. It throws NotFoundError when the id names no active pointer.
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
  }

  function offsetOf(event) {
    const box = stageEl?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function move(event) {
    if (!drag) return;
    const at = offsetOf(event);
    const cell = pointToCell(at.x, at.y, geometry, grid);
    const dx = cell.x - drag.from.x;
    const dy = cell.y - drag.from.y;
    const base = drag.rect;
    const next = drag.mode === 'move'
      ? { x: base.x + dx, y: base.y + dy, w: base.w, h: base.h }
      : drag.mode === 'start'
        // Resizing from the left keeps the right edge where it is.
        ? { x: base.x + dx, y: base.y, w: Math.max(1, base.w - dx), h: base.h }
        : { x: base.x, y: base.y, w: Math.max(1, base.w + dx), h: base.h };
    onmove(drag.index, fitRect(next, grid));
  }

  function end() { drag = null; }
</script>

<div class="stagewrap" bind:clientWidth={hostWidth}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="stage"
    bind:this={stageEl}
    style="width:{renderW}px;height:{renderH}px;"
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
  >
    {#if control && kind === 'lcd'}
      <LcdDisplayRenderer {control} {allControls} width={renderW} height={renderH} />

      <div class="overlay">
        {#each boxes as entry (entry.index)}
          {#if entry.box}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="zbox"
              class:sel={entry.index === selectedIndex}
              class:bad={!!entry.issue}
              style="left:{entry.box.left}px;top:{entry.box.top}px;width:{entry.box.width}px;height:{entry.box.height}px;"
              role="button"
              tabindex="0"
              aria-label={`Zone ${entry.index + 1}${entry.issue ? ', clamped' : ''}`}
              title={entry.issue ? `Zone ${entry.index + 1} — ${entry.issue.message}` : `Zone ${entry.index + 1} — drag to move, ends to resize`}
              onpointerdown={(event) => begin(entry, 'move', event)}
              onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(entry.index); } }}
            >
              <b>{entry.index + 1} {entry.item?.show ?? entry.item?.kind ?? ''}</b>
              {#if entry.index === selectedIndex && !entry.issue}
                <i class="h l" role="presentation" onpointerdown={(event) => begin(entry, 'start', event)}></i>
                <i class="h r" role="presentation" onpointerdown={(event) => begin(entry, 'end', event)}></i>
              {/if}
            </div>
          {:else}
            <!-- Painted nowhere: a tab on the edge it fell off, rather than a box over the
                 neighbouring column pretending it is somewhere. -->
            <button
              type="button"
              class="edge {entry.edge}"
              class:sel={entry.index === selectedIndex}
              title={`Zone ${entry.index + 1} — ${entry.issue?.message ?? 'off the screen'}`}
              onclick={() => onselect(entry.index)}
            >{entry.index + 1} off {entry.edge}</button>
          {/if}
        {/each}
      </div>
    {:else if control && kind === 'pixel'}
      <!-- The renderer's own element drag, given room to work in. `editable` is what turns it on. -->
      <PixelDisplayRenderer {control} {allControls} width={renderW} height={renderH} editable={true} scale={1} />
    {/if}
  </div>

  <div class="foot">
    <span class="grid">{grid.unitsX} × {grid.unitsY} {grid.unit === 'px' ? 'pixels' : 'characters'}</span>
    <span>·</span>
    <span>{kind === 'lcd' ? 'drag a zone to move it, its ends to resize' : 'drag an element to move it, its corner to resize'}</span>
  </div>
</div>

<style>
  .stagewrap { display: flex; flex-direction: column; gap: 6px; min-width: 0; align-items: flex-start; }

  .stage {
    position: relative;
    flex: 0 0 auto;
    border: 1px solid #333;
    border-radius: 5px;
    background: #0C0F12;
    touch-action: none;
    overflow: hidden;
  }

  .overlay { position: absolute; inset: 0; }

  .zbox {
    position: absolute;
    border: 1px solid #14B8A6;
    border-radius: 2px;
    background: rgba(20, 184, 166, 0.08);
    cursor: grab;
    outline: none;
  }
  .zbox:hover { background: rgba(20, 184, 166, 0.16); }
  .zbox:active { cursor: grabbing; }
  .zbox.sel { border-color: #8FEDE3; background: rgba(143, 238, 227, 0.14); box-shadow: 0 0 0 1px rgba(143, 237, 227, 0.35); }
  .zbox:focus-visible { box-shadow: 0 0 0 2px #5B9BD5; }
  /* An off-screen zone is drawn where its numbers say, in amber, rather than hidden — the thing
     that is wrong should be the thing you can see. */
  .zbox.bad { border-color: #E5A029; border-style: dashed; background: rgba(229, 160, 41, 0.1); }

  .zbox b {
    position: absolute;
    top: -9px;
    left: -1px;
    font: 600 7px/1 'IBM Plex Mono', ui-monospace, monospace;
    background: #0E7C70;
    color: #04211D;
    padding: 1px 3px;
    border-radius: 2px;
    white-space: nowrap;
    pointer-events: none;
  }
  .zbox.bad b { background: #6B4A1E; color: #F0D48A; }

  .h {
    position: absolute;
    width: 7px;
    height: 7px;
    background: #8FEDE3;
    border-radius: 1px;
    top: 50%;
    margin-top: -3.5px;
    cursor: ew-resize;
  }
  .h.l { left: -4px; }
  .h.r { right: -4px; }

  /* The stand-in for a zone that paints nowhere: a tab pinned to the edge it fell off. */
  .edge {
    position: absolute;
    border: 1px solid #E5A029;
    background: #2A2213;
    color: #F0D48A;
    font: 600 7.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    padding: 3px 5px;
    border-radius: 2px;
    cursor: pointer;
    white-space: nowrap;
  }
  .edge:hover, .edge.sel { background: #3A2E14; color: #FFF1D2; }
  .edge.bottom { bottom: 2px; left: 50%; transform: translateX(-50%); }
  .edge.top { top: 2px; left: 50%; transform: translateX(-50%); }
  .edge.right { right: 2px; top: 50%; transform: translateY(-50%); }
  .edge.left { left: 2px; top: 50%; transform: translateY(-50%); }

  .foot {
    display: flex;
    gap: 6px;
    font: 400 9.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    flex-wrap: wrap;
  }
  .foot .grid { color: #8A949C; }
</style>
