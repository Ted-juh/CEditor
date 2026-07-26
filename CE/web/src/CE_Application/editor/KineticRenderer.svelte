<script>
  // Kinetic Modulator — a box with a bouncing ball, a fading comet trail and a
  // gravity hint. Visual only; the physics integration + fling are driven by the
  // preview surface, which shares kineticLayout geometry (pad = 8). Live state
  // arrives via Kinetic.__state, the trail via Kinetic.__trail, drag via __drag.
  import {
    kineticConfig, kineticInitial, kineticParams, kineticSpeed,
    kineticGeometry, kineticToPx,
  } from '../utils/kineticLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 8;
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

  let cfg = $derived(kineticConfig(control));
  let geom = $derived(kineticGeometry(width, height, PAD));
  let st = $derived(kineticInitial(control));
  let params = $derived(kineticParams(control));
  let speed = $derived(kineticSpeed(st, params.maxSpeed));
  let dragging = $derived(cfg.__drag === true);

  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(13,13,18,1)'));
  let ballCss = $derived(css(cfg.ballColour, 'rgba(57,217,138,1)'));
  let trailCss = $derived(css(cfg.trailColour, 'rgba(57,217,138,0.4)'));
  let wallCss = $derived(css(cfg.wallColour, 'rgba(42,107,168,0.2)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let ball = $derived(kineticToPx(st, geom));
  let ballR = $derived(5 + speed * 5);
  let trail = $derived(Array.isArray(cfg.__trail) ? cfg.__trail.map((p) => kineticToPx(p, geom)) : []);
  // Gravity hint: a short arrow pointing down when gravity is on.
  let showGrav = $derived(params.gravity > 0.01);
</script>

<svg class="kinetic" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx="6" fill={fieldCss} stroke="rgba(36,36,48,1)" />
  {#if cfg.showWalls !== false}
    <rect x={geom.x0 + 1} y={geom.y0 + 1} width={geom.w - 2} height={geom.h - 2} rx="5" fill="none" stroke={wallCss} stroke-width="2" />
  {/if}

  <!-- gravity hint -->
  {#if showGrav}
    <line x1={geom.x0 + geom.w - 12} y1={geom.y0 + 8} x2={geom.x0 + geom.w - 12} y2={geom.y0 + 8 + Math.min(18, params.gravity * 8)} stroke={labelCss} stroke-width="1.5" opacity="0.4" />
    <path d={`M ${geom.x0 + geom.w - 15} ${geom.y0 + 4 + Math.min(18, params.gravity * 8)} L ${geom.x0 + geom.w - 12} ${geom.y0 + 8 + Math.min(18, params.gravity * 8)} L ${geom.x0 + geom.w - 9} ${geom.y0 + 4 + Math.min(18, params.gravity * 8)}`} fill="none" stroke={labelCss} stroke-width="1.5" opacity="0.4" />
  {/if}

  <!-- comet trail -->
  {#if cfg.showTrail !== false && trail.length > 1}
    {#each trail as p, i (i)}
      <circle cx={p.px} cy={p.py} r={Math.max(1, ballR * (0.3 + 0.5 * (i / trail.length)))} fill={trailCss} opacity={(i / trail.length) * 0.6} />
    {/each}
  {/if}

  <!-- ball: glow halo + body + specular -->
  <circle cx={ball.px} cy={ball.py} r={ballR + 6} fill={ballCss} opacity={0.14 + speed * 0.2} />
  <circle cx={ball.px} cy={ball.py} r={ballR} fill={ballCss} stroke={dragging ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.5)'} stroke-width={dragging ? 2 : 1} />
  <circle cx={ball.px - ballR * 0.3} cy={ball.py - ballR * 0.3} r={Math.max(1, ballR * 0.3)} fill="rgba(255,255,255,0.85)" />
</svg>

<style>
  .kinetic { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
