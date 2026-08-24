<script>
  import { dragScrub } from '../scrub/dragScrubAction';
  import { presets } from '../scrub/dragScrub';
  import { appScrubOverrides } from '../utils/scrubRuntime.js';

  // A number well that carries its own label: [label | value input | ▴▾].
  // Three ways in, no modes — the input is always live (Enter commits, Esc
  // reverts), the steppers give exact one-click increments (Shift = ×10), and
  // the label doubles as a horizontal drag handle for scrubbing. Zoning keeps
  // the methods from fighting: a drag on the label can never steal a click
  // from the text, and a click on the text never nudges the value.
  let {
    value = 0,
    step = 1,
    min = undefined,
    max = undefined,
    label = '',
    defaultValue = undefined,
    disabled = false,
    onchange = null,
  } = $props();

  let editing = $state(false);
  let draft = $state('');
  let inputEl = $state(null);

  let bounded = $derived(Number.isFinite(min) && Number.isFinite(max));
  let fillPct = $derived(bounded ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0);

  // Display the stored value faithfully (typed values are not snapped to
  // step); toFixed(6) only strips float noise like 0.30000000000000004.
  function format(v) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? String(parseFloat(n.toFixed(6))) : '0';
  }

  function clamp(v) {
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }

  // The scrub core needs finite bounds; unbounded axes get a huge range and
  // rely on clamp-at-commit like the steppers do.
  const scrubParams = $derived({
    ...presets.numberField,
    ...appScrubOverrides(),
    min: min ?? -1e9,
    max: max ?? 1e9,
    step,
    sensitivity: step, // one step per pixel of travel
    value,
    defaultValue,
    disabled,
    manageCursor: false,
    onChange: (v) => {
      if (v !== value) onchange?.(v);
    },
  });

  function nudge(dir, mult) {
    if (disabled) return;
    const quantum = step > 0 ? step : 1;
    const next = clamp(parseFloat((Math.round((value + dir * quantum * mult) / quantum) * quantum).toFixed(6)));
    if (next !== value) onchange?.(next);
  }

  function beginEdit(e) {
    editing = true;
    draft = format(value);
    e.target.select();
  }

  function commit() {
    const v = parseFloat(draft);
    if (!isNaN(v)) {
      const next = clamp(v);
      if (next !== value) onchange?.(next);
    }
    editing = false;
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') {
      commit();
      e.target.blur();
    } else if (e.key === 'Escape') {
      editing = false;
      e.target.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      commit();
      nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1);
      editing = false;
      queueMicrotask(() => inputEl?.select());
      e.preventDefault();
    }
  }
</script>

<div class="number-cell" class:disabled>
  {#if bounded}
    <span class="nc-fill" style="width:{fillPct}%"></span>
  {/if}
  {#if label}
    <span class="nc-label" title="Drag to scrub" use:dragScrub={scrubParams}>{label}</span>
  {/if}
  <input class="nc-value"
         type="text"
         inputmode="decimal"
         aria-label={label || 'Value'}
         {disabled}
         bind:this={inputEl}
         value={editing ? draft : format(value)}
         oninput={(e) => { draft = e.target.value; }}
         onfocus={beginEdit}
         onblur={commit}
         onkeydown={handleKeydown} />
  <span class="nc-steps">
    <button type="button" tabindex="-1" aria-label="Increment" {disabled}
            onclick={(e) => nudge(1, e.shiftKey ? 10 : 1)}>
      <svg width="7" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </button>
    <button type="button" tabindex="-1" aria-label="Decrement" {disabled}
            onclick={(e) => nudge(-1, e.shiftKey ? 10 : 1)}>
      <svg width="7" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </button>
  </span>
</div>

<style>
  .number-cell {
    position: relative;
    display: flex;
    align-items: stretch;
    /* On the panel token like every other field, so a stepper and a toggle in one grid row are
       the same height. It was 24px against the toggle's 26 — two pixels, but visible as a wobble
       down a column of paired rows. */
    box-sizing: border-box;
    height: var(--pp-field-height, 26px);
    flex: 1;
    min-width: 0;
    background: var(--pp-field-bg, #1A1A1A);
    border: 1px solid var(--pp-field-border, #333);
    border-radius: var(--pp-field-radius, 3px);
    overflow: hidden;
  }

  .number-cell:hover {
    border-color: #4A6E8C;
  }

  .number-cell:focus-within {
    border-color: var(--pp-field-focus, #5B9BD5);
  }

  .number-cell.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .nc-fill {
    position: absolute;
    inset: 0;
    background: rgba(9, 71, 113, 0.45);
    pointer-events: none;
  }

  .nc-label {
    position: relative;
    display: flex;
    align-items: center;
    font-size: 9px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 0 5px;
    flex-shrink: 0;
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
  }

  .nc-label:hover {
    background: #0D2A3E;
  }

  .nc-value {
    position: relative;
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: #DDD;
    font-size: 11px;
    text-align: right;
    padding: 0 4px;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    outline: none;
    cursor: text;
  }

  .nc-steps {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 12px;
    flex-shrink: 0;
    border-left: 1px solid #262626;
  }

  .nc-steps button {
    flex: 1;
    min-height: 0;
    border: none;
    background: #252525;
    color: #6E7880;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nc-steps button:first-child {
    border-bottom: 1px solid #262626;
  }

  .nc-steps button:hover {
    color: #5B9BD5;
    background: #26303A;
  }

  .nc-steps button:active {
    background: #094771;
    color: #CDE4F5;
  }

  .nc-steps svg {
    display: block;
  }
</style>
