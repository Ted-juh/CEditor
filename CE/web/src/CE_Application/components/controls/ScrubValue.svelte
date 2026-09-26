<script>
  /**
   * A value you drag or type. Drag up or down to change it; click (without dragging) to type a
   * new one; arrow keys step it. The way the rest of CEditor wants numbers set: no slider, and
   * no dropdown for a value that is really a number.
   *
   * With `choices` ([[value, label], ...]) it steps through those instead of a range, and typing
   * accepts a label ("1/16") or a number.
   */
  let {
    value = 0,
    min = 0,
    max = 127,
    step = 1,
    choices = null,
    format = (v) => String(v),
    unit = '',
    label = '',
    title = 'Drag up or down (Shift for fine), or click to type',
    pixelsPerStep = 4,
    fineStep = null,          // with Shift held (drag or arrows): this step instead; null = step / 10
    stepper = null,           // (value, steps, fine) => next: for values that step by ratio, like a rate in Hz
    onchange = () => {},
    testid = undefined,
  } = $props();

  let editing = $state(false);
  let draft = $state('');
  let drag = null;

  const clamp = (v) => Math.max(min, Math.min(max, v));
  const indexOf = (v) => {
    if (!choices) return -1;
    let best = 0;
    choices.forEach(([c], i) => { if (Math.abs(c - v) < Math.abs(choices[best][0] - v)) best = i; });
    return best;
  };
  const shown = $derived(choices ? (choices[indexOf(value)]?.[1] ?? format(value)) : format(value));

  function stepBy(n, fine = false) {
    if (n === 0) return;
    if (stepper) {
      const next = clamp(stepper(value, n, fine));
      if (next !== value) onchange(next);
      return;
    }
    if (choices) {
      const i = Math.max(0, Math.min(choices.length - 1, indexOf(value) + n));
      if (choices[i][0] !== value) onchange(choices[i][0]);
      return;
    }
    const s = fine ? (fineStep ?? step / 10) : step;
    const next = clamp(Math.round((value + n * s) / s) * s);
    if (next !== value) onchange(Number(next.toFixed(6)));
  }

  function down(e) {
    if (e.button !== 0 || editing) return;
    drag = { lastY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e) {
    if (!drag) return;
    const steps = Math.trunc((drag.lastY - e.clientY) / pixelsPerStep);
    if (steps === 0) return;
    drag.lastY -= steps * pixelsPerStep;
    drag.moved = true;
    stepBy(steps, e.shiftKey);
  }
  function up(e) {
    if (!drag) return;
    const clicked = !drag.moved;
    drag = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (clicked) { draft = shown; editing = true; }
  }

  function commit(text) {
    editing = false;
    const t = String(text).trim();
    if (!t) return;
    if (choices) {
      const byLabel = choices.find(([, l]) => l.toLowerCase() === t.toLowerCase());
      if (byLabel) { onchange(byLabel[0]); return; }
    }
    const n = Number(t.replace(/[^0-9.+-]/g, ''));
    if (!Number.isFinite(n)) return;
    onchange(choices ? choices[indexOf(n)][0] : clamp(n));
  }

  const focusAndSelect = (node) => { node.focus(); node.select(); };
</script>

{#if editing}
  <input class="scrub editing" type="text" bind:value={draft} use:focusAndSelect aria-label={label}
         data-testid={testid}
         onkeydown={(e) => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') editing = false; }}
         onblur={() => { if (editing) commit(draft); }} />
{:else}
  <span class="scrub" role="spinbutton" tabindex="0" aria-label={label} aria-valuenow={value}
        aria-valuemin={choices ? undefined : min} aria-valuemax={choices ? undefined : max} aria-valuetext={shown}
        {title} data-testid={testid}
        onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
        onkeydown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { stepBy(1, e.shiftKey); e.preventDefault(); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { stepBy(-1, e.shiftKey); e.preventDefault(); }
          else if (e.key === 'Enter') { draft = shown; editing = true; }
        }}>{shown}{#if unit}<small>{unit}</small>{/if}</span>
{/if}

<style>
  .scrub {
    display: inline-flex; align-items: baseline; justify-content: center; gap: 3px;
    min-width: 58px; min-height: 26px; box-sizing: border-box; padding: 4px 9px;
    font: 600 12px var(--host-font-mono, 'JetBrains Mono', monospace); font-variant-numeric: tabular-nums;
    color: var(--host-text, #d9e0e6); background: var(--host-field, #12171b);
    border: 1px solid var(--host-line, #3b4652); border-radius: var(--host-radius-control, 3px);
    cursor: ns-resize; user-select: none; touch-action: none;
  }
  .scrub:hover { border-color: var(--host-line-strong, #526170); }
  .scrub:focus-visible { outline: 2px solid var(--host-accent-strong, #79b9ee); outline-offset: 1px; }
  .scrub small { font-weight: 400; color: var(--host-text-dim, #7f8b96); }
  input.scrub { width: 88px; cursor: text; user-select: text; text-align: center; border-color: var(--host-accent, #5b9bd5); outline: none; }
</style>
