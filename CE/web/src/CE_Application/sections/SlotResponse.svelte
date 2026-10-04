<script>
  /**
   * What a control does to its parameter, drawn: across is the knob's (or fader's) whole
   * travel, up is the parameter. The line runs from where the parameter sits with the control at
   * the bottom to where it sits at the top; a stepped control is a staircase with a tick per
   * step. Drag either end up or down; drag them past each other and the control works the other
   * way round. The dashed line is where the control is now (the host reports its position), so
   * turning the real knob moves it along the line.
   */
  import { bindingEnds, bindingFromEnds, snapPosition, stepPositions } from '../utils/rangeMapping.js';

  let { slot, onset = () => {}, testid = 'slot-response' } = $props();

  const H = 150, PAD_X = 26, PAD_Y = 14;
  let width = $state(320);
  let draft = $state(null);
  const ends = $derived(draft ?? bindingEnds(slot));
  const binding = $derived({ ...bindingFromEnds(ends.start, ends.end), steps: slot.steps ?? 0 });
  const X = (p) => PAD_X + p * (width - PAD_X * 2);
  const Y = (v) => H - PAD_Y - v * (H - PAD_Y * 2);
  const out = (p) => ends.start + snapPosition(p, binding.steps) * (ends.end - ends.start);

  const path = $derived.by(() => {
    if (!(binding.steps >= 2)) return `M${X(0)},${Y(ends.start)} L${X(1)},${Y(ends.end)}`;
    // Snapping rounds to the nearest step, so each level holds from halfway before its step to
    // halfway after it.
    const n = binding.steps - 1;
    const parts = [];
    for (let i = 0; i <= n; i += 1) {
      const from = Math.max(0, (i - 0.5) / n), to = Math.min(1, (i + 0.5) / n);
      const y = Y(out(i / n));
      parts.push(`${i ? 'L' : 'M'}${X(from)},${y} L${X(to)},${y}`);
    }
    return parts.join(' ');
  });
  const ticks = $derived(stepPositions(binding.steps));
  const position = $derived(Math.max(0, Math.min(1, Number(slot.value) || 0)));
  const pct = (v) => `${Math.round(v * 100)}%`;

  function drag(event, which) {
    event.preventDefault();
    const handle = event.currentTarget;
    const svg = handle.ownerSVGElement;
    handle.setPointerCapture?.(event.pointerId);
    draft = { ...bindingEnds(slot) };
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const v = Math.round(Math.max(0, Math.min(1, (H - PAD_Y - (ev.clientY - r.top)) / (H - PAD_Y * 2))) * 100) / 100;
      draft = { ...draft, [which]: v };
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      const next = draft;
      draft = null;
      const was = bindingEnds(slot);
      if (next.start !== was.start || next.end !== was.end) onset(bindingFromEnds(next.start, next.end));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }
  function key(event, which) {
    const step = event.shiftKey ? 0.01 : 0.05;
    const delta = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    event.preventDefault();
    const was = bindingEnds(slot);
    onset(bindingFromEnds(which === 'start' ? was.start + delta : was.start, which === 'end' ? was.end + delta : was.end));
  }
</script>

<div class="response" bind:clientWidth={width} data-testid={testid}>
  <svg viewBox={`0 0 ${width} ${H}`} role="group" aria-label="How the control drives the parameter: drag the ends up or down">
    <line class="axis" x1={X(0)} x2={X(1)} y1={Y(0)} y2={Y(0)} />
    <line class="axis" x1={X(0)} x2={X(0)} y1={Y(0)} y2={Y(1)} />
    <line class="grid" x1={X(0)} x2={X(1)} y1={Y(1)} y2={Y(1)} />
    <text class="lbl" x={X(0) - 5} y={Y(1) + 4} text-anchor="end">100</text>
    <text class="lbl" x={X(0) - 5} y={Y(0) + 4} text-anchor="end">0</text>
    <text class="lbl" x={X(0)} y={H - 1}>bottom</text>
    <text class="lbl" x={X(1)} y={H - 1} text-anchor="end">top</text>
    {#each ticks as t (t)}<line class="tick" x1={X(t)} x2={X(t)} y1={Y(0)} y2={Y(0) + 5} />{/each}
    <rect class="span" x={X(0)} width={X(1) - X(0)} y={Y(Math.max(ends.start, ends.end))}
          height={Math.abs(Y(ends.start) - Y(ends.end))} />
    <line class="now" x1={X(position)} x2={X(position)} y1={Y(0)} y2={Y(1)} />
    <circle class="now-dot" cx={X(position)} cy={Y(out(position))} r="4" data-testid={`${testid}-now`} />
    <path class="curve" d={path} />
    {#each [['start', 0, ends.start, 'With the control at the bottom'], ['end', 1, ends.end, 'With the control at the top']] as [which, p, v, name] (which)}
      <circle class="end" class:top={which === 'end'} cx={X(p)} cy={Y(v)} r="7" role="slider" tabindex="0"
              data-testid={`${testid}-${which}`} aria-label={`${name}: ${pct(v)}`} aria-valuenow={Math.round(v * 100)}
              aria-valuemin="0" aria-valuemax="100"
              onpointerdown={(e) => drag(e, which)} onkeydown={(e) => key(e, which)}><title>{name}: {pct(v)}. Drag up or down</title></circle>
    {/each}
  </svg>
  <div class="read">
    <span>bottom <b>{pct(ends.start)}</b></span>
    <span>top <b>{pct(ends.end)}</b></span>
    {#if ends.start > ends.end}<span class="flip">works the other way round</span>{/if}
    <span class="now-read">now <b>{slot.valueText || pct(out(position))}</b></span>
  </div>
</div>

<style>
  .response { min-width: 0; }
  svg { display: block; width: 100%; height: 150px; background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e);
        border-radius: 4px; touch-action: none; user-select: none; }
  .axis { stroke: var(--host-line, #3b4652); }
  .grid { stroke: var(--host-line-soft, #2c353e); stroke-dasharray: 2 4; }
  .tick { stroke: var(--host-text-dim, #7f8b96); }
  .lbl { font: 9px var(--host-font-mono, monospace); fill: var(--host-text-dim, #7f8b96); }
  .span { fill: var(--host-accent, #5b9bd5); opacity: .08; }
  .curve { fill: none; stroke: var(--host-accent-strong, #79b9ee); stroke-width: 2.2; stroke-linejoin: round; }
  .now { stroke: #ff9408; stroke-dasharray: 4 3; opacity: .7; }
  .now-dot { fill: #ff9408; }
  .end { fill: var(--host-field, #12171b); stroke: var(--host-accent-strong, #79b9ee); stroke-width: 2; cursor: ns-resize; }
  .end.top { fill: var(--host-accent-strong, #79b9ee); }
  .end:focus-visible { outline: none; stroke: #fff; }
  .read { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 4px; font: 11px var(--host-font-mono, monospace); color: var(--host-text-dim, #7f8b96); }
  .read b { color: var(--host-text, #d9e0e6); font-weight: 600; }
  .flip { color: #d7a44e; }
  .now-read { margin-left: auto; }
</style>
