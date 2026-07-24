<script>
  // Orbit Modulator — a spatial poly-LFO. Satellites orbit a centre; each emits a
  // live 0..1 value from its position (fan-out, one port each). Renders faint
  // orbit rings, spokes, comet trails and the glowing satellites. Visual only —
  // the animation clock and satellite drag are driven by the preview surface,
  // which shares orbitLayout geometry (pad = 10). Live clock arrives via
  // Orbit.__phase; a dragged satellite index via Orbit.__drag.
  import {
    orbitConfig, orbitPhase, orbitNodes, orbitGeometry, nodeToPx, nodeOutput,
  } from '../utils/orbitLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 10;
  const TRAIL_STEPS = 14;      // comet-trail samples
  const TRAIL_SPAN = 0.16;     // fraction of a cycle the trail spans

  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    return fallback;
  }
  function n(v, f = 0) { const x = Number(v); return Number.isFinite(x) ? x : f; }
  const NODE_PALETTE = ['rgba(57,217,138,1)', 'rgba(91,155,213,1)', 'rgba(242,153,74,1)', 'rgba(155,138,255,1)', 'rgba(242,201,76,1)', 'rgba(235,87,87,1)'];

  let cfg = $derived(orbitConfig(control));
  let phase = $derived(orbitPhase(control));
  let geom = $derived(orbitGeometry(width, height, PAD));
  let nodes = $derived(orbitNodes(control));
  let dragIndex = $derived(cfg.__drag !== undefined && cfg.__drag !== null ? n(cfg.__drag, -1) : -1);

  let ringCss = $derived(css(cfg.ringColour, 'rgba(42,107,168,0.2)'));
  let centreCss = $derived(css(cfg.centreColour, 'rgba(58,58,68,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(7, Math.min(n(font?.size, 10), 12)));

  // Per-satellite geometry: live px, colour, output value, spoke, comet trail.
  let sats = $derived.by(() => nodes.map((s, i) => {
    const colour = s.colour ? css(s.colour) : NODE_PALETTE[i % NODE_PALETTE.length];
    const here = nodeToPx(s, phase, geom);
    const out = s.enabled ? nodeOutput(s, phase) : 0;
    const r = 4 + out * 6;                        // radius grows with output
    let trail = [];
    if (cfg.showTrails !== false && s.enabled) {
      for (let k = 1; k <= TRAIL_STEPS; k += 1) {
        const p = nodeToPx(s, phase - (TRAIL_SPAN * k) / TRAIL_STEPS, geom);
        trail.push({ px: p.px, py: p.py, o: (1 - k / TRAIL_STEPS) * 0.5 });
      }
    }
    return { i, s, colour, here, out, r, trail, ringR: s.radius * geom.maxR };
  }));
</script>

<svg class="orbit" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <!-- Orbit rings -->
  {#if cfg.showRings !== false}
    {#each sats as sat (sat.i)}
      {#if sat.s.enabled}
        <circle cx={geom.cx} cy={geom.cy} r={sat.ringR} fill="none" stroke={ringCss} stroke-width="1" stroke-dasharray="2 4" />
      {/if}
    {/each}
  {/if}

  <!-- Centre hub -->
  <circle cx={geom.cx} cy={geom.cy} r="3.5" fill={centreCss} />
  <circle cx={geom.cx} cy={geom.cy} r="7" fill="none" stroke={centreCss} stroke-width="1" opacity="0.5" />

  {#each sats as sat (sat.i)}
    <!-- Spoke -->
    {#if cfg.showSpokes !== false && sat.s.enabled}
      <line x1={geom.cx} y1={geom.cy} x2={sat.here.px} y2={sat.here.py} stroke={sat.colour} stroke-width="1" opacity="0.28" />
    {/if}
    <!-- Comet trail -->
    {#each sat.trail as t, k (k)}
      <circle cx={t.px} cy={t.py} r={Math.max(1, sat.r * (0.35 + 0.4 * t.o))} fill={sat.colour} opacity={t.o} />
    {/each}
  {/each}

  {#each sats as sat (sat.i)}
    <!-- Satellite: glow halo + body + specular -->
    {#if sat.s.enabled}
      <circle cx={sat.here.px} cy={sat.here.py} r={sat.r + 5} fill={sat.colour} opacity={0.16 + sat.out * 0.22} />
      <circle cx={sat.here.px} cy={sat.here.py} r={sat.r} fill={sat.colour}
              stroke={dragIndex === sat.i ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.5)'} stroke-width={dragIndex === sat.i ? 2 : 1} />
      <circle cx={sat.here.px - sat.r * 0.3} cy={sat.here.py - sat.r * 0.3} r={Math.max(1, sat.r * 0.3)} fill="rgba(255,255,255,0.85)" />
    {:else}
      <circle cx={sat.here.px} cy={sat.here.py} r="4" fill="none" stroke={sat.colour} stroke-width="1" opacity="0.4" stroke-dasharray="2 2" />
    {/if}
    <!-- Optional value readout -->
    {#if cfg.showValues === true && sat.s.enabled}
      <text x={sat.here.px} y={sat.here.py - sat.r - 4} font-size={labelSize} fill={labelCss} text-anchor="middle"
            style="font-variant-numeric:tabular-nums" opacity="0.9">{Math.round(sat.out * 100)}</text>
    {/if}
  {/each}
</svg>

<style>
  .orbit { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
