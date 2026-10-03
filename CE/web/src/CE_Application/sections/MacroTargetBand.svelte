<script>
  /**
   * One macro target as a band across the parameter's range: the hollow end is where the
   * parameter sits with the macro at 0, the filled end where it sits at 100%, and the line is
   * where the macro puts it right now. Drag either end; drag them past each other and the target
   * turns down as the macro goes up. The target hears about it once, on release.
   */
  import { bindingEnds, bindingFromEnds, mapPosition } from '../utils/rangeMapping.js';

  let { target, position = 0, onset = () => {}, testid = 'macro-band' } = $props();

  let draft = $state(null);
  const ends = $derived(draft ?? bindingEnds(target));
  const now = $derived(mapPosition({ ...target, ...bindingFromEnds(ends.start, ends.end), steps: 0 }, position));
  const pct = (v) => `${Math.round(v * 100)}%`;
  const reversed = $derived(ends.start > ends.end);

  function drag(event, which) {
    event.preventDefault();
    const handle = event.currentTarget;
    const track = handle.parentElement;
    handle.setPointerCapture?.(event.pointerId);
    draft = { ...bindingEnds(target) };
    const move = (ev) => {
      const r = track.getBoundingClientRect();
      const v = Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * 100) / 100;
      draft = { ...draft, [which]: v };
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      const { start, end } = draft;
      draft = null;
      const original = bindingEnds(target);
      if (start !== original.start || end !== original.end) onset(bindingFromEnds(start, end));
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
    const current = bindingEnds(target);
    onset(bindingFromEnds(which === 'start' ? current.start + delta : current.start,
                          which === 'end' ? current.end + delta : current.end));
  }
</script>

<div class="band-row" data-testid={testid}>
  <div class="track" class:reversed>
    <i class="span" style:left={pct(Math.min(ends.start, ends.end))} style:width={pct(Math.abs(ends.end - ends.start))}></i>
    <i class="now" style:left={pct(now)} title={`Now ${pct(now)}`}></i>
    <button type="button" class="ctl end start" style:left={pct(ends.start)} data-testid={`${testid}-start`}
            role="slider" aria-valuenow={Math.round(ends.start * 100)} aria-valuemin="0" aria-valuemax="100"
            aria-label="Where the macro at 0 puts it" title={`Macro at 0: ${pct(ends.start)}. Drag`}
            onpointerdown={(e) => drag(e, 'start')} onkeydown={(e) => key(e, 'start')}></button>
    <button type="button" class="ctl end stop" style:left={pct(ends.end)} data-testid={`${testid}-end`}
            role="slider" aria-valuenow={Math.round(ends.end * 100)} aria-valuemin="0" aria-valuemax="100"
            aria-label="Where the macro at 100% puts it" title={`Macro at 100%: ${pct(ends.end)}. Drag`}
            onpointerdown={(e) => drag(e, 'end')} onkeydown={(e) => key(e, 'end')}></button>
  </div>
  <span class="read">{pct(ends.start)} → {pct(ends.end)}{reversed ? ' · reversed' : ''}</span>
</div>

<style>
  .band-row { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
  .track { position: relative; flex: 1; min-width: 120px; height: 18px; margin: 0 7px; border-radius: 3px;
           background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); }
  .span { position: absolute; top: 4px; bottom: 4px; border-radius: 2px;
          background: linear-gradient(90deg, #2a4c6b, var(--host-accent, #5b9bd5)); }
  .reversed .span { background: linear-gradient(270deg, #2a4c6b, var(--host-accent, #5b9bd5)); }
  .now { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: #ff9408; border-radius: 1px;
         box-shadow: 0 0 4px #ff9408; pointer-events: none; }
  .end { position: absolute; top: 50%; width: 13px; height: 13px; margin: -7px 0 0 -7px; padding: 0; border-radius: 50%;
         cursor: ew-resize; touch-action: none; border: 2px solid var(--host-accent-strong, #79b9ee); }
  .end.start { background: var(--host-field, #12171b); }
  .end.stop { background: var(--host-accent-strong, #79b9ee); }
  .end:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  .read { flex: 0 0 auto; font: 11px var(--host-font-mono, monospace); color: var(--host-text-dim, #7f8b96); white-space: nowrap; }
</style>
