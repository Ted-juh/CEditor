<script>
  import {
    normalizeResponseCurvePoints, responseCurveDisplayPoints,
  } from '../utils/responseCurve.js';

  let {
    label = 'Response', curve = 'linear', points = [],
    onchange = () => {}, onmakecustom = () => {},
  } = $props();

  let shown = $derived(responseCurveDisplayPoints(curve, points));
  let line = $derived(shown.map((value, index) => {
    const x = 8 + index * 144 / Math.max(1, shown.length - 1);
    const y = 92 - value * 84 / 127;
    return `${x},${y}`;
  }).join(' '));

  function setPoint(index, value) {
    const next = normalizeResponseCurvePoints(points);
    next[index] = Math.max(0, Math.min(127, Math.round(Number(value) || 0)));
    onchange(next);
  }
</script>

<div class="curve-designer" data-testid="response-curve-designer">
  <div class="curve-head">
    <span>{label}</span>
    {#if curve !== 'custom'}
      <button type="button" onclick={() => onmakecustom([...shown])}>Edit this curve</button>
    {:else}
      <span class="custom">9-point custom</span>
    {/if}
  </div>
  <div class="curve-field">
    <svg viewBox="0 0 160 100" role="img" aria-label={`${label} response curve`} preserveAspectRatio="none">
      <path class="grid" d="M8 8H152 M8 50H152 M8 92H152 M8 8V92 M80 8V92 M152 8V92" />
      <polyline points={line} />
      {#each shown as value, index (index)}
        <rect class:editable={curve === 'custom'}
              x={5 + index * 144 / Math.max(1, shown.length - 1)}
              y={89 - value * 84 / 127} width="6" height="6" rx="0" />
      {/each}
    </svg>
    <div class="curve-faders">
      {#each shown as value, index (index)}
        <label title={`Point ${index + 1}: ${value}`}>
          <input type="range" min="0" max="127" step="1" value={value}
                 disabled={curve !== 'custom'} aria-label={`${label} point ${index + 1}`}
                 oninput={(event) => setPoint(index, event.currentTarget.value)} />
          <span>{index === 0 || index === 4 || index === 8 ? value : ''}</span>
        </label>
      {/each}
    </div>
  </div>
  <div class="axis"><span>soft</span><span>input force / expression</span><span>hard</span></div>
</div>

<style>
  .curve-designer { min-width: 270px; flex: 1 1 340px; display: flex; flex-direction: column;
                    gap: 4px; color: var(--host-text-soft); }
  .curve-head { display: flex; align-items: center; justify-content: space-between; min-height: 22px;
                color: var(--host-text); font-size: 11px; font-weight: 600; }
  .curve-head button { border: 1px solid var(--host-line); border-radius: var(--host-radius-control);
                       background: var(--host-surface-raised); color: var(--host-accent);
                       font: inherit; font-size: 10px; padding: 2px 7px; cursor: pointer; }
  .custom { color: var(--host-accent); font-size: 10px; font-weight: 500; }
  .curve-field { position: relative; height: 116px; border: 1px solid var(--host-line-soft);
                 border-radius: var(--host-radius-control); overflow: hidden;
                 background: linear-gradient(180deg, #111922, #0d141b); }
  svg { position: absolute; inset: 5px 6px 16px; width: calc(100% - 12px); height: calc(100% - 21px);
        pointer-events: none; }
  .grid { fill: none; stroke: var(--host-line-soft); stroke-width: 0.8; vector-effect: non-scaling-stroke; }
  polyline { fill: none; stroke: var(--host-accent); stroke-width: 2;
             vector-effect: non-scaling-stroke; }
  rect { fill: var(--host-text-soft); }
  rect.editable { fill: var(--host-accent); }
  .curve-faders { position: absolute; inset: 8px 8px 2px; display: grid;
                   grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 0; }
  .curve-faders label { min-width: 0; display: flex; flex-direction: column; align-items: center;
                        justify-content: flex-end; }
  .curve-faders input { width: 82px; height: 12px; margin: 0 0 39px; opacity: 0;
                        transform: rotate(-90deg); cursor: ns-resize; }
  .curve-faders input:focus-visible { opacity: 0.35; outline: 1px solid var(--host-accent); }
  .curve-faders input:disabled { cursor: default; }
  .curve-faders span { height: 12px; font-size: 9px; color: var(--host-text-dim); }
  .axis { display: flex; justify-content: space-between; font-size: 9px; color: var(--host-text-dim); }
</style>
