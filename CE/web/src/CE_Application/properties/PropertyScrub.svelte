<script>
  import { dragScrub } from '../scrub/dragScrubAction';
  import { presets } from '../scrub/dragScrub';
  import { appScrubOverrides } from '../utils/scrubRuntime.js';

  let { value = 100, min = 0, max = 200, step = 1, label = '', defaultValue = undefined, onchange = null } = $props();

  // Typed values clamp but are NOT snapped to step — the step quantum applies
  // to stepping and scrubbing only, so exact values can always be entered.
  let decimals = $derived((String(step).split('.')[1] || '').length);
  let editing = $state(false);
  let draft = $state('');
  let inputEl = $state(null);

  function pctFromValue(v) {
    return ((v - min) / (max - min)) * 100;
  }

  function format(v) {
    const n = Number(v ?? 0);
    return decimals > 0 ? String(parseFloat(n.toFixed(decimals))) : String(Math.round(n));
  }

  function clamp(v) {
    return Math.max(min, Math.min(max, v));
  }

  const scrubParams = $derived({
    ...presets.linearHorizontal,
    ...appScrubOverrides(),
    min,
    max,
    step,
    value,
    defaultValue,
    manageCursor: false,
    onChange: (v) => {
      if (v !== value) onchange?.(v);
    },
  });

  function nudge(dir, mult) {
    const quantum = step > 0 ? step : 1;
    const next = clamp(Math.round((value + dir * quantum * mult) / quantum) * quantum);
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

<div class="property-scrub">
  {#if label}
    <span class="scrub-label">{label}</span>
  {/if}
  <div class="scrub-track"
       role="slider"
       tabindex="0"
       aria-label={label || 'Value'}
       aria-valuemin={min}
       aria-valuemax={max}
       aria-valuenow={value}
       use:dragScrub={scrubParams}>
    <div class="scrub-fill" style="width:{pctFromValue(value)}%"></div>
    <div class="scrub-thumb" style="left:{pctFromValue(value)}%"></div>
  </div>
  <div class="scrub-num">
    <input class="scrub-value"
           type="text"
           inputmode="decimal"
           aria-label={label ? `${label} value` : 'Value'}
           bind:this={inputEl}
           value={editing ? draft : format(value)}
           oninput={(e) => { draft = e.target.value; }}
           onfocus={beginEdit}
           onblur={commit}
           onkeydown={handleKeydown} />
    <span class="scrub-steps">
      <button type="button" tabindex="-1" aria-label="Increment"
              onclick={(e) => nudge(1, e.shiftKey ? 10 : 1)}>
        <svg width="7" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
      <button type="button" tabindex="-1" aria-label="Decrement"
              onclick={(e) => nudge(-1, e.shiftKey ? 10 : 1)}>
        <svg width="7" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
    </span>
  </div>
</div>

<style>
  .property-scrub {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    flex: 1;
    min-width: 0;
  }

  .scrub-label {
    font-size: 9px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
    min-width: 24px;
    user-select: none;
  }

  .scrub-track {
    flex: 1;
    min-width: 0;
    height: 16px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    position: relative;
    cursor: ew-resize;
    overflow: hidden;
    touch-action: none;
  }

  .scrub-track:hover {
    border-color: #555;
  }

  .scrub-track:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }

  .scrub-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: #094771;
    pointer-events: none;
  }

  .scrub-thumb {
    position: absolute;
    top: 0;
    width: 3px;
    height: 100%;
    background: #5B9BD5;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .scrub-num {
    display: flex;
    width: 50px;
    flex-shrink: 0;
    height: 22px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    overflow: hidden;
  }

  .scrub-num:focus-within {
    border-color: #5B9BD5;
  }

  .scrub-value {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: transparent;
    border: none;
    color: #DDD;
    font-size: 10px;
    text-align: right;
    padding: 0 3px;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    outline: none;
    cursor: text;
  }

  .scrub-steps {
    display: flex;
    flex-direction: column;
    width: 12px;
    flex-shrink: 0;
    border-left: 1px solid #262626;
  }

  .scrub-steps button {
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

  .scrub-steps button:first-child {
    border-bottom: 1px solid #262626;
  }

  .scrub-steps button:hover {
    color: #5B9BD5;
    background: #26303A;
  }

  .scrub-steps button:active {
    background: #094771;
    color: #CDE4F5;
  }

  .scrub-steps svg {
    display: block;
  }
</style>
