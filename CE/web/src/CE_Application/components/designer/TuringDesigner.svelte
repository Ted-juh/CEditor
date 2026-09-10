<script>
  /**
   * The Turing Modulator's register, drawn as step bars you can draw on.
   *
   * The properties panel gives the register two buttons — Randomize and Flatten — and nothing else.
   * A specific sequence, the whole point of a shift-register modulator, can only be drawn in preview,
   * and preview is a rehearsal that puts the document back when it stops.
   *
   * Step bars with handles are the one shape the no-slider rule keeps, because a bar IS the value.
   *
   * The picture is `TuringRenderer`, the same component the canvas draws with.
   */
  import { updateControlProperty } from '../../stores/controls.js';
  import TuringRenderer from '../../editor/TuringRenderer.svelte';
  import NumberCell from '../../properties/NumberCell.svelte';
  import Dices from 'lucide-svelte/icons/dices';
  import Minus from 'lucide-svelte/icons/minus';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import {
    turingGeometry, stepAtPoint, valueFromY, turingConfig, turingLength, turingSteps,
  } from '../../utils/turingLayout.js';
  import { turingRows, writeStep, quantizeAll, rotateSteps, resizeSteps } from '../../utils/designerModel.js';

  let { control = null, controlId = '' } = $props();

  let stageW = $state(0);
  let stageH = $state(0);

  let config = $derived(turingConfig(control));
  let steps = $derived(turingSteps(control));
  let length = $derived(turingLength(control));
  let rows = $derived(turingRows(control));
  let geom = $derived(turingGeometry(stageW, stageH, length, 8));
  let quantized = $derived(Math.round(Number(config.quantizeLevels ?? 0)) >= 2);
  // The gate threshold's y in stage pixels. The panel sets this as a number and draws it nowhere.
  let gateY = $derived(geom.y0 + geom.h * (1 - Math.max(0, Math.min(1, Number(config.gateThreshold ?? 0.5)))));
  let markX = $derived(geom.x0 + Math.max(0, index) * (geom.stepW + geom.gap));

  let wanted = $state(-1);
  let index = $derived(wanted >= 0 && wanted < rows.length ? wanted : -1);
  let row = $derived(index >= 0 ? rows[index] : null);
  let drawing = $state(false);

  function write(next) {
    if (!controlId) return;
    updateControlProperty(controlId, 'Turing.steps', next);
  }

  function paint(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const at = stepAtPoint(geom, event.clientX - box.left, length);
    if (at < 0) return;
    wanted = at;
    write(writeStep(steps, at, valueFromY(geom, event.clientY - box.top)));
  }

  function down(event) {
    drawing = true;
    paint(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function move(event) { if (drawing) paint(event); }
  function up() { drawing = false; }

  function setLength(value) {
    if (!controlId) return;
    const next = resizeSteps(steps, value);
    updateControlProperty(controlId, 'Turing.length', next.length);
    updateControlProperty(controlId, 'Turing.steps', next);
  }
</script>

<div class="turdes">
  <div class="stagecol">
    <div class="colh">
      Register
      <s>{length} steps · {rows.filter((entry) => entry.gate).length} gate</s>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}
         onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
      {#if stageW > 0 && stageH > 0}
        <TuringRenderer {control} width={stageW} height={stageH} />
        <svg class="handles" width={stageW} height={stageH} viewBox={`0 0 ${stageW} ${stageH}`}>
          <!-- The gate threshold, which the panel sets as a number and shows nowhere. -->
          <line x1={geom.x0} y1={gateY} x2={geom.x0 + geom.w} y2={gateY}
                stroke="#F2C94C" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />
          {#if index >= 0}
            <rect x={markX - 1} y={geom.y0 - 1} width={geom.stepW + 2} height={geom.h + 2}
                  fill="none" stroke="#8FEDE3" stroke-width="1.5" rx="2" />
          {/if}
        </svg>
      {/if}
    </div>
  </div>

  <div class="railcol">
    <div class="colh">The register</div>
    <div class="box">
      <div class="r">
        <label for="tur-len">Length</label>
        <div class="cell">
          <NumberCell label="steps" min={2} max={64} step={1} value={length}
                      onchange={(value) => setLength(value)} />
        </div>
      </div>

      <div class="grp">Whole sequence</div>
      <div class="fills">
        <button type="button" class="chip" title="A fresh random register"
                onclick={() => write(steps.map(() => Math.round(Math.random() * 100) / 100))}>
          <Dices size={11} /> random
        </button>
        <button type="button" class="chip" title="Every step to the middle"
                onclick={() => write(steps.map(() => 0.5))}><Minus size={11} /> flat</button>
        <button type="button" class="chip" title="Rotate the sequence one step earlier"
                onclick={() => write(rotateSteps(steps, -1))}><ChevronLeft size={11} /></button>
        <button type="button" class="chip" title="Rotate the sequence one step later"
                onclick={() => write(rotateSteps(steps, 1))}><ChevronRight size={11} /></button>
      </div>

      {#if quantized}
        <button type="button" class="chip wide"
                title={`Snap every stored step onto the ${config.quantizeLevels} levels this component plays`}
                onclick={() => write(quantizeAll(steps, config.quantizeLevels))}>
          snap to {config.quantizeLevels} levels
        </button>
      {/if}

      <div class="grp">Step</div>
      {#if row}
        <div class="r">
          <label for="tur-val">{row.index + 1} of {length}</label>
          <div class="cell">
            <NumberCell label="val" min={0} max={1} step={0.05} value={Number(row.value.toFixed(2))}
                        onchange={(value) => write(writeStep(steps, row.index, value))} />
          </div>
        </div>
        <p class="hint">
          Gate {row.gate ? 'fires' : 'stays down'} at {Number(config.gateThreshold ?? 0.5)}.
          {#if quantized}This step plays <b>{row.output.toFixed(2)}</b>, not {row.value.toFixed(2)} —
            quantizing to {config.quantizeLevels} levels moves it.{/if}
        </p>
      {:else}
        <p class="hint">Drag across the bars to draw a sequence. Pick one to type a value.</p>
      {/if}
    </div>

    <div class="list">
      {#each rows as entry (entry.index)}
        <button type="button" class="srow" class:sel={entry.index === index} class:gate={entry.gate}
                onclick={() => { wanted = entry.index; }}>
          <span class="sn">{entry.index + 1}</span>
          <span class="sv">{entry.value.toFixed(2)}</span>
          <span class="sg">{entry.gate ? '●' : '·'}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .turdes { display: flex; gap: 10px; padding: 10px; align-items: stretch; min-height: 0; flex: 1 1 auto; }
  .stagecol { flex: 1 1 0; min-width: 260px; display: flex; flex-direction: column; }
  .railcol { flex: 0 0 214px; min-width: 0; display: flex; flex-direction: column; }

  .colh {
    display: flex; align-items: center; gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em; text-transform: uppercase; color: #616C75;
    margin-bottom: 7px; white-space: nowrap; overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; letter-spacing: 0.06em; }

  .stage {
    position: relative; flex: 1 1 auto; min-height: 180px;
    border: 1px solid #2E3540; border-radius: 4px; background: #0C0F12;
    overflow: hidden; cursor: crosshair; touch-action: none;
  }
  .handles { position: absolute; inset: 0; pointer-events: none; }

  .box { border: 1px solid #333; border-radius: 4px; background: #1A1D20; padding: 6px 8px 9px; }
  .grp {
    font: 600 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em; text-transform: uppercase; color: #4B545C;
    margin: 9px 0 2px; padding-bottom: 3px; border-bottom: 1px solid #262B30;
  }
  .r { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 6px; align-items: center; margin-top: 6px; }
  .r > label { font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif; color: #616C75; text-align: right; }
  .cell { min-width: 0; display: flex; }

  .fills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 3px;
    border: 1px solid #333B42; background: #12171A; color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 7px; border-radius: 3px; cursor: pointer;
  }
  .chip:hover { border-color: #5B9BD5; color: #E8EEF5; }
  .chip.wide { width: 100%; justify-content: center; margin-top: 6px; }

  .hint { margin: 6px 0 0; font: 400 9px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #69737B; }
  .hint b { color: #8FEDE3; font-weight: 600; }

  .list {
    margin-top: 8px; display: flex; flex-direction: column; gap: 1px;
    flex: 1 1 auto; min-height: 60px; overflow: hidden auto;
  }
  .srow {
    display: grid; grid-template-columns: 18px minmax(0, 1fr) 12px; align-items: center; gap: 6px;
    padding: 3px 6px; border: 1px solid transparent; border-radius: 3px; background: #12171A;
    cursor: pointer; text-align: left;
  }
  .srow:hover { border-color: #4A555E; }
  .srow.sel { border-color: #5B9BD5; background: #173449; }
  .sn { font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; }
  .sv { font: 400 9.5px/1 'IBM Plex Mono', ui-monospace, monospace; color: #C3D0DA; }
  .sg { font: 400 9px/1 'IBM Plex Mono', ui-monospace, monospace; color: #3A434A; text-align: right; }
  .srow.gate .sg { color: #F2C94C; }
</style>
