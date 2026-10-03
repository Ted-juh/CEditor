<script>
  /**
   * A range as one band with two ends you drag: the low end cannot pass the high one. While a
   * drag is on, the band is a draft; `onchange({ min, max })` fires once, on release, or on each
   * arrow key. `active` false draws it dimmed, for a filter that is not applied yet.
   */
  let {
    min = 0, max = 1, active = true, format = (v) => `${Math.round(v * 100)}%`, label = 'Range',
    onchange = () => {}, testid = undefined,
  } = $props();

  let draft = $state(null);
  const lo = $derived(draft?.min ?? min);
  const hi = $derived(draft?.max ?? max);
  const pct = (v) => `${v * 100}%`;

  function drag(event, which) {
    event.preventDefault();
    const handle = event.currentTarget;
    const track = handle.parentElement;
    handle.setPointerCapture?.(event.pointerId);
    draft = { min, max };
    const move = (ev) => {
      const r = track.getBoundingClientRect();
      const v = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100) / 100;
      draft = which === 'min' ? { ...draft, min: Math.min(v, draft.max) } : { ...draft, max: Math.max(v, draft.min) };
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      const next = draft;
      draft = null;
      if (next.min !== min || next.max !== max) onchange(next);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }
  function key(event, which) {
    const step = event.shiftKey ? 0.01 : 0.05;
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    event.preventDefault();
    const v = Math.round(Math.max(0, Math.min(1, (which === 'min' ? min : max) + delta)) * 100) / 100;
    onchange(which === 'min' ? { min: Math.min(v, max), max } : { min, max: Math.max(v, min) });
  }
</script>

<div class="range-band" class:inactive={!active} data-testid={testid}>
  <div class="track">
    <i class="span" style:left={pct(lo)} style:width={pct(hi - lo)}></i>
    {#each [['min', lo], ['max', hi]] as [which, v] (which)}
      <span class="end" style:left={pct(v)} role="slider" tabindex="0" data-testid={testid ? `${testid}-${which}` : undefined}
            aria-label={`${label} ${which === 'min' ? 'lowest' : 'highest'}`} aria-valuetext={format(v)}
            aria-valuenow={Math.round(v * 100)} aria-valuemin="0" aria-valuemax="100"
            title={`${which === 'min' ? 'From' : 'To'} ${format(v)}: drag`}
            onpointerdown={(e) => drag(e, which)} onkeydown={(e) => key(e, which)}></span>
    {/each}
  </div>
</div>

<style>
  .range-band { flex: 1; min-width: 90px; padding: 0 7px; }
  .track { position: relative; height: 16px; border-radius: 3px; background: var(--host-field, #12171b);
           border: 1px solid var(--host-line-soft, #2c353e); }
  .span { position: absolute; top: 3px; bottom: 3px; border-radius: 2px; background: var(--host-accent, #5b9bd5); opacity: .8; }
  .inactive .span { background: var(--host-line-strong, #526170); opacity: .6; }
  .end { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; cursor: ew-resize;
         touch-action: none; background: var(--host-text, #d9e0e6); border: 2px solid var(--host-accent-strong, #79b9ee); box-sizing: border-box; }
  .inactive .end { border-color: var(--host-line-strong, #526170); }
  .end:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
</style>
