<script>
  /**
   * The Step Sequencer's pattern, drawn.
   *
   * This is the first thing in the application that can write `StepSequencer.pattern`. The layout
   * module has had the hit test and both writers since it was written — `cellAtPoint`, `toggleCell`,
   * `setCellVelocity` — and nothing imported them, so a Step Sequencer drew an empty grid and played
   * silence everywhere it appeared. See utils/designerModel.js.
   *
   * THE PICTURE IS THE SHIPPED RENDERER. `StepSequencerRenderer` draws the grid on the canvas; it
   * draws it here too, at dock size, with a transparent hit layer over it. The alternative is a
   * second grid that is free to disagree with the first, which is the argument `EffectPreview`
   * already settled for this repo.
   */
  import { updateControlProperty } from '../../stores/controls.js';
  import StepSequencerRenderer from '../../editor/StepSequencerRenderer.svelte';
  import NumberCell from '../../properties/NumberCell.svelte';
  import Eraser from 'lucide-svelte/icons/eraser';
  import FlipHorizontal from 'lucide-svelte/icons/flip-horizontal';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import {
    sequencerGeometry, cellAtPoint, sequencerPattern, cellKey,
  } from '../../utils/stepSequencerLayout.js';
  import {
    sequencerRows, sequencerShape, litCells, fillEvery, clearRow, shiftRow, invertRow,
    clearCell, setCell, cellVelocity, writeCellVelocity,
  } from '../../utils/designerModel.js';

  let { control = null, controlId = '' } = $props();

  let stageW = $state(0);
  let stageH = $state(0);

  let rows = $derived(sequencerRows(control));
  let shape = $derived(sequencerShape(control));
  let lit = $derived(litCells(control));
  let pattern = $derived(sequencerPattern(control));
  let geom = $derived(sequencerGeometry(stageW, stageH, control));

  let wantedTrack = $state('');
  let trackId = $derived(rows.some((row) => row.id === wantedTrack) ? wantedTrack : (rows[0]?.id ?? ''));
  let track = $derived(rows.find((row) => row.id === trackId) ?? null);

  // The cell the velocity box edits. Cleared whenever the pattern loses it.
  let picked = $state(null);
  let pickedVelocity = $derived(picked ? cellVelocity(pattern, picked.trackId, picked.step) : null);

  // Painting: the first cell decides whether the drag turns cells on or off, so dragging across a
  // row does one thing rather than alternating under the pointer.
  let paint = $state(null);

  function write(next) {
    if (!controlId) return;
    updateControlProperty(controlId, 'StepSequencer.pattern', next);
  }

  function hit(event) {
    const box = event.currentTarget.getBoundingClientRect();
    return cellAtPoint(geom, event.clientX - box.left, event.clientY - box.top);
  }

  function down(event) {
    const cell = hit(event);
    if (!cell) return;
    const row = rows[cell.trackIndex];
    if (!row) return;
    const on = pattern[cellKey(row.id, cell.step)]?.on === true;
    paint = { on: !on };
    wantedTrack = row.id;
    picked = on ? null : { trackId: row.id, step: cell.step };
    write(on ? clearCell(pattern, row.id, cell.step) : setCell(pattern, row.id, cell.step, 100));
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function move(event) {
    if (!paint) return;
    const cell = hit(event);
    if (!cell) return;
    const row = rows[cell.trackIndex];
    if (!row) return;
    const on = pattern[cellKey(row.id, cell.step)]?.on === true;
    if (on === paint.on) return;
    write(paint.on ? setCell(pattern, row.id, cell.step, 100) : clearCell(pattern, row.id, cell.step));
  }

  function up() { paint = null; }

  const rowTool = (fn) => () => { if (trackId) write(fn(pattern, trackId, shape.steps)); };
</script>

<div class="seqdes">
  <div class="stagecol">
    <div class="colh">
      Pattern
      <s>{lit} {lit === 1 ? 'cell' : 'cells'} lit · {shape.steps} × {shape.tracks}</s>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="stage"
      bind:clientWidth={stageW}
      bind:clientHeight={stageH}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    >
      {#if stageW > 0 && stageH > 0}
        <div class="fill">
          <StepSequencerRenderer {control} width={stageW} height={stageH} />
        </div>
      {/if}
      {#if !lit}
        <p class="blank">Click a cell. Nothing in the application could do this before — the grid
          ships empty and stays empty.</p>
      {/if}
    </div>
  </div>

  <div class="railcol">
    <div class="colh">Tracks <s>{rows.length}</s></div>
    <div class="tracks">
      {#each rows as row (row.id)}
        <button
          type="button" class="track" class:sel={row.id === trackId} class:off={row.muted}
          onclick={() => { wantedTrack = row.id; }}
        >
          <i class="swatch" style={`background:${row.colour ? `#${String(row.colour).slice(2)}` : '#5B9BD5'}`}></i>
          <span class="tname">{row.label}</span>
          <span class="tcount">{row.onCount}</span>
        </button>
      {/each}
    </div>

    <div class="box">
      <div class="grp">Fill {track?.label ?? 'this track'}</div>
      <div class="fills">
        {#each [1, 2, 3, 4, 8] as every (every)}
          <button type="button" class="chip" title={`Light every ${every} steps`}
                  onclick={() => trackId && write(fillEvery(pattern, trackId, shape.steps, every))}>
            /{every}
          </button>
        {/each}
        <button type="button" class="chip" title="Light every 4 steps, starting at step 3 — off-beat hats"
                onclick={() => trackId && write(fillEvery(pattern, trackId, shape.steps, 4, 2))}>
          off
        </button>
      </div>

      <div class="grp">Move it</div>
      <div class="fills">
        <button type="button" class="chip" title="Shift this row one step earlier"
                onclick={() => trackId && write(shiftRow(pattern, trackId, shape.steps, -1))}>
          <ChevronLeft size={11} />
        </button>
        <button type="button" class="chip" title="Shift this row one step later"
                onclick={() => trackId && write(shiftRow(pattern, trackId, shape.steps, 1))}>
          <ChevronRight size={11} />
        </button>
        <button type="button" class="chip" title="Every lit step goes out, every dark step comes on"
                onclick={rowTool(invertRow)}><FlipHorizontal size={11} /> invert</button>
        <button type="button" class="chip" title="Clear this row" onclick={rowTool(clearRow)}>
          <Eraser size={11} /> row
        </button>
      </div>

      <div class="grp">Velocity</div>
      {#if picked && pickedVelocity !== null}
        <div class="r">
          <label for="seq-vel">Step {picked.step + 1}</label>
          <div class="cell">
            <NumberCell label="vel" min={1} max={127} step={1} value={pickedVelocity}
              onchange={(value) => write(writeCellVelocity(pattern, picked.trackId, picked.step, value))} />
          </div>
        </div>
        <p class="vhint">The grid draws a cell's velocity as its opacity. Nothing could set it
          before this, so every lit cell drew the same.</p>
      {:else}
        <p class="vhint">Click a cell to set its velocity.</p>
      {/if}

      <button type="button" class="wipe" disabled={!lit} onclick={() => write({})}>
        <Eraser size={11} /> Clear the whole pattern
      </button>
    </div>
  </div>
</div>

<style>
  .seqdes { display: flex; gap: 10px; padding: 10px; align-items: stretch; min-height: 0; flex: 1 1 auto; }
  .stagecol { flex: 1 1 0; min-width: 260px; display: flex; flex-direction: column; }
  .railcol { flex: 0 0 232px; min-width: 0; display: flex; flex-direction: column; }

  .colh {
    display: flex; align-items: center; gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em; text-transform: uppercase; color: #616C75;
    margin-bottom: 7px; white-space: nowrap; overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; letter-spacing: 0.06em; }

    /* The renderer and the hit layer are taken OUT OF FLOW on purpose.

     `.stage` is `flex: 1 1 auto` and reports its size back through `bind:clientWidth/clientHeight`,
     which the renderer is then drawn at. Leave the renderer in flow and that is a loop: the SVG's
     height contributes to the container's height, which resizes the SVG, which... Svelte stops it
     with `effect_update_depth_exceeded` and the tab freezes on whatever it had. Absolute positioning
     means the drawing can never influence the box it is measured from. */
  .fill { position: absolute; inset: 0; }

  .stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 180px;
    border: 1px solid #2E3540;
    border-radius: 4px;
    background: #0C0F12;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
  }
  .blank {
    position: absolute; inset: auto 12px 10px 12px; margin: 0;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #69737B;
    pointer-events: none;
  }

  .tracks { display: flex; flex-direction: column; gap: 2px; }
  .track {
    display: grid; grid-template-columns: 9px minmax(0, 1fr) auto;
    align-items: center; gap: 6px; padding: 5px 6px;
    border: 1px solid #2E3540; border-radius: 3px; background: #12171A;
    cursor: pointer; text-align: left;
  }
  .track:hover { border-color: #4A555E; }
  .track.sel { border-color: #5B9BD5; background: #173449; }
  .track.off { opacity: 0.45; }
  .swatch { width: 9px; height: 9px; border-radius: 2px; display: block; }
  .tname { font: 500 10px/1.2 'IBM Plex Sans', system-ui, sans-serif; color: #C3D0DA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tcount { font: 400 8.5px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; }

  .box { margin-top: 8px; border: 1px solid #333; border-radius: 4px; background: #1A1D20; padding: 6px 8px 9px; }
  .grp {
    font: 600 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em; text-transform: uppercase; color: #4B545C;
    margin: 9px 0 2px; padding-bottom: 3px; border-bottom: 1px solid #262B30;
  }
  .grp:first-child { margin-top: 2px; }

  .fills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 3px;
    border: 1px solid #333B42; background: #12171A; color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 7px; border-radius: 3px; cursor: pointer;
  }
  .chip:hover { border-color: #5B9BD5; color: #E8EEF5; }

  .r { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 6px; align-items: center; margin-top: 6px; }
  .r > label { font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif; color: #616C75; text-align: right; }
  .cell { min-width: 0; display: flex; }

  .vhint { margin: 6px 0 0; font: 400 9px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #69737B; }

  .wipe {
    width: 100%; margin-top: 10px;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    border: 1px solid #5C3A3A; background: #1A1315; color: #D98C8C;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 6px; border-radius: 3px; cursor: pointer;
  }
  .wipe:hover:not(:disabled) { border-color: #8A4A4A; color: #F0B8B8; }
  .wipe:disabled { opacity: 0.35; cursor: default; }
</style>
