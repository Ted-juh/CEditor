<script>
  /**
   * The per-step values of a lane, as rows under it: velocity, length, chance, nudge and
   * ratchet for notes and drums, chance and nudge for a value lane. Drag along a row to draw it
   * across the steps, like the arpeggiator's lane. Only steps that play are drawn; a rest has no
   * velocity to set. Nudge is drawn from the middle: up is late, down is early.
   */
  import { STEP_ROWS, stepRowHeight, stepRowsFor, stepRowValue } from '../../utils/modulatorShapes.js';

  // The gutters line the columns up with whatever is drawn above: the roll has a note ruler on
  // its left and the octave buttons on its right.
  let { lane, playing = -1, selected = -1, gutterLeft = 0, gutterRight = 0, onset = () => {}, onselect = () => {} } = $props();

  const rows = $derived(stepRowsFor(lane.type));
  let drag = null;
  let hover = $state(null);           // { row, index } under the pointer, for the readout

  function at(event) {
    const r = event.currentTarget.getBoundingClientRect();
    return {
      index: Math.max(0, Math.min(lane.stepCount - 1, Math.floor(((event.clientX - r.left) / r.width) * lane.stepCount))),
      height: Math.max(0, Math.min(1, 1 - (event.clientY - r.top) / r.height)),
    };
  }
  function apply(row, event) {
    const { index, height } = at(event);
    hover = { row, index };
    const step = lane.steps[index];
    if (!step?.active) return;
    const value = stepRowValue(row, height);
    const field = STEP_ROWS[row].field;
    if (drag.sent[index] === value || step[field] === value) return;
    drag.sent[index] = value;
    onset(index, { [field]: value });
  }
  function down(row, event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag = { row, sent: {} };
    const { index } = at(event);
    onselect(index);
    apply(row, event);
  }
  function move(row, event) {
    if (drag?.row === row) apply(row, event);
    else hover = { row, index: at(event).index };
  }
  const up = () => (drag = null);
  const readout = (row) => {
    if (hover?.row !== row) return STEP_ROWS[row].label;
    const step = lane.steps[hover.index];
    const spec = STEP_ROWS[row];
    return step?.active ? `${spec.label} · ${spec.format(step[spec.field])}` : `${spec.label} · rest`;
  };
</script>

<div class="rows" data-testid={`step-rows-${lane.laneId}`} style:padding-left={`${gutterLeft}px`} style:padding-right={`${gutterRight}px`}>
  {#each rows as row (row)}
    {@const spec = STEP_ROWS[row]}
    <div class="row">
      <span class="name" class:live={hover?.row === row}>{readout(row)}</span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="bars" class:bipolar={spec.bipolar} data-testid={`step-row-${row}`}
           title={`${spec.label} per step: drag along the row`}
           onpointerdown={(e) => down(row, e)} onpointermove={(e) => move(row, e)}
           onpointerup={up} onpointercancel={up} onpointerleave={() => { if (!drag) hover = null; }}>
        {#each lane.steps as step, index (index)}
          {@const h = step.active ? stepRowHeight(row, step[spec.field]) : 0}
          <div class="col" class:idle={!step.active} class:beat={index % lane.stepsPerBeat === 0}
               class:playing={playing === index} class:selected={selected === index}>
            {#if step.active}
              {#if spec.bipolar}
                <i class="fill" style:bottom={`${Math.min(h, 0.5) * 100}%`} style:height={`${Math.max(1.5, Math.abs(h - 0.5) * 100)}%`}></i>
              {:else}
                <i class="fill" style:bottom="0" style:height={`${Math.max(4, h * 100)}%`}></i>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .rows { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
  .row { position: relative; }
  /* The name sits on the row without hiding it: text with a shadow, no backing. */
  .name { position: absolute; left: 4px; top: 1px; z-index: 1; pointer-events: none; white-space: nowrap;
          font: 10px var(--host-font-mono, monospace); color: #9aa5ae; text-shadow: 0 0 3px #000, 0 0 2px #000, 0 0 1px #000; }
  .name.live { color: #f0b47d; }
  .bars { display: flex; gap: 1px; height: 28px; touch-action: none; cursor: crosshair; user-select: none; }
  .bars.bipolar { background: linear-gradient(#0000 calc(50% - 0.5px), #3a434b calc(50% - 0.5px), #3a434b calc(50% + 0.5px), #0000 calc(50% + 0.5px)); }
  .col { position: relative; flex: 1; min-width: 0; background: #151a1f; border-radius: 2px; }
  .col.beat { background: #1a2027; }
  .col.idle { background: #111519; }
  .col.selected { box-shadow: inset 0 0 0 1px #79b9ee; }
  .col.playing { box-shadow: inset 0 0 0 1px #efad70; }
  .fill { position: absolute; left: 1px; right: 1px; background: #d7863b; border-radius: 1px; opacity: .85; }
</style>
