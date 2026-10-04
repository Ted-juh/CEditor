<script>
  /**
   * A modulator's movement, drawn, with its range as two lines you drag: the top line is the
   * maximum, the bottom the minimum. The wave is drawn already squeezed into that range (the
   * caller's `path`, in the same box), so dragging a line reshapes what you see as you go; the
   * modulator hears about it once, on release.
   */
  let {
    path = '', width = 360, height = 96, pad = 4, minimum = 0, maximum = 1,
    dot = null, playhead = null, onrange = () => {}, draft = $bindable(null), label = '', testid = 'scope',
  } = $props();

  const lo = $derived(draft?.minimum ?? minimum);
  const hi = $derived(draft?.maximum ?? maximum);
  const y = (v) => pad + (1 - v) * (height - pad * 2);

  function drag(event, key) {
    event.preventDefault();
    const target = event.currentTarget;
    const svg = target.ownerSVGElement;
    target.setPointerCapture?.(event.pointerId);
    draft = { minimum, maximum };
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const v = Math.round(Math.max(0, Math.min(1, 1 - ((ev.clientY - r.top) / r.height * height - pad) / (height - pad * 2))) * 100) / 100;
      draft = key === 'maximum' ? { ...draft, maximum: Math.max(v, draft.minimum) } : { ...draft, minimum: Math.min(v, draft.maximum) };
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      const fields = draft;
      draft = null;
      if (fields.minimum !== minimum || fields.maximum !== maximum) onrange(fields);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }
  function key(event, which) {
    const step = event.shiftKey ? 0.01 : 0.05;
    const delta = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    event.preventDefault();
    const v = Math.round(Math.max(0, Math.min(1, (which === 'maximum' ? maximum : minimum) + delta)) * 100) / 100;
    onrange(which === 'maximum' ? { maximum: Math.max(v, minimum) } : { minimum: Math.min(v, maximum) });
  }
</script>

<svg class="scope" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="group" aria-label={label}
     data-testid={testid}>
  <rect class="band" x="0" y={y(hi)} width={width} height={Math.max(0, y(lo) - y(hi))} />
  {#each [0.25, 0.5, 0.75] as f (f)}<line class="grid" x1={width * f} x2={width * f} y1="0" y2={height} />{/each}
  <path class="wave" d={path} />
  {#if playhead !== null}<line class="playhead" x1={playhead} x2={playhead} y1="0" y2={height} />{/if}
  {#if dot}<circle class="dot" cx={dot.x} cy={dot.y} r="3.2" />{/if}
  {#each [['maximum', hi], ['minimum', lo]] as [which, v] (which)}
    <line class="range-line" x1="0" x2={width} y1={y(v)} y2={y(v)} />
    <rect class="range-grip" x="0" y={y(v) - 5} width={width} height="10" data-testid={`${testid}-${which === 'maximum' ? 'max' : 'min'}`}
          role="slider" tabindex="0" aria-label={which === 'maximum' ? 'Highest value: drag up or down' : 'Lowest value: drag up or down'}
          aria-valuenow={Math.round(v * 100)} aria-valuemin="0" aria-valuemax="100"
          onpointerdown={(e) => drag(e, which)} onkeydown={(e) => key(e, which)}><title>{which === 'maximum' ? 'Highest' : 'Lowest'} {Math.round(v * 100)}%: drag</title></rect>
  {/each}
</svg>
<div class="scale" aria-hidden="true"><span>{Math.round(lo * 100)}–{Math.round(hi * 100)}%</span></div>

<style>
  .scope { display: block; width: 100%; height: 96px; background: #101417; border: 1px solid #2d343a; border-radius: 4px; touch-action: none; }
  .band { fill: #d7863b; opacity: .07; }
  .grid { stroke: #252c32; stroke-width: 1; vector-effect: non-scaling-stroke; }
  .wave { fill: none; stroke: #e39a55; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .playhead { stroke: #f2c28e; stroke-width: 1; opacity: .5; vector-effect: non-scaling-stroke; }
  .dot { fill: #ffd8b0; vector-effect: non-scaling-stroke; }
  .range-line { stroke: #8f5a35; stroke-width: 1; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
  .range-grip { fill: transparent; cursor: ns-resize; }
  .range-grip:hover, .range-grip:focus-visible { fill: #d7863b; opacity: .18; outline: none; }
  .scale { display: flex; justify-content: flex-end; margin-top: -2px; font: 10px var(--host-font-mono, monospace); color: #77838d; }
</style>
