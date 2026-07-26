<script>
  // Vector Joystick — an XY pad: grid, crosshair, corner markers/labels, an
  // optional motion trail and the draggable puck. Visual only; the drag +
  // spring-return is driven by the preview surface, which shares joystickLayout
  // geometry (pad = 10). Live position arrives via Joystick.__x/__y, the trail
  // via Joystick.__trail.
  import {
    joystickConfig, joystickPos, joystickGeometry, joyToPx, joystickCornerLabels,
  } from '../utils/joystickLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 10;
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

  let cfg = $derived(joystickConfig(control));
  let geom = $derived(joystickGeometry(width, height, PAD));
  let pos = $derived({
    x: cfg.__x !== undefined ? n(cfg.__x, 0.5) : joystickPos(control).x,
    y: cfg.__y !== undefined ? n(cfg.__y, 0.5) : joystickPos(control).y,
  });
  let puckPx = $derived(joyToPx(pos, geom));
  let labels = $derived(joystickCornerLabels(control));
  let trail = $derived(Array.isArray(cfg.__trail) ? cfg.__trail.map((p) => joyToPx(p, geom)) : []);

  let padCss = $derived(css(cfg.padColour, 'rgba(20,20,20,1)'));
  let gridCss = $derived(css(cfg.gridColour, 'rgba(255,255,255,0.09)'));
  let crossCss = $derived(css(cfg.crosshairColour, 'rgba(255,255,255,0.25)'));
  let puckCss = $derived(css(cfg.puckColour, 'rgba(91,155,213,1)'));
  let trailCss = $derived(css(cfg.trailColour, 'rgba(91,155,213,0.4)'));
  let cornerCss = $derived(css(cfg.cornerColour, 'rgba(242,201,76,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));
  let puckR = $derived(Math.max(3, n(cfg.puckRadius, 9)));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(8, n(font?.size, 11)));

  let grid = $derived.by(() => {
    if (cfg.showGrid === false) return { v: [], h: [] };
    const d = Math.max(1, Math.round(n(cfg.gridDiv, 4)));
    const v = []; const h = [];
    for (let i = 1; i < d; i += 1) { v.push(geom.x0 + (geom.w * i) / d); h.push(geom.y0 + (geom.h * i) / d); }
    return { v, h };
  });
  let corners = $derived([
    { x: geom.x0 + 3, y: geom.y0 + 3, ax: 'start', ay: 'hanging', label: labels[0] },              // TL
    { x: geom.x0 + geom.w - 3, y: geom.y0 + 3, ax: 'end', ay: 'hanging', label: labels[1] },        // TR
    { x: geom.x0 + 3, y: geom.y0 + geom.h - 3, ax: 'start', ay: 'auto', label: labels[2] },         // BL
    { x: geom.x0 + geom.w - 3, y: geom.y0 + geom.h - 3, ax: 'end', ay: 'auto', label: labels[3] },  // BR
  ]);
  let baseY = $derived(geom.y0 + geom.h);
  let rightX = $derived(geom.x0 + geom.w);
</script>

<svg class="joystick" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} fill={padCss} stroke={gridCss} stroke-width="1" rx="3" />

  {#each grid.v as x (`v${x}`)}<line x1={x} y1={geom.y0} x2={x} y2={baseY} stroke={gridCss} stroke-width="1" />{/each}
  {#each grid.h as y (`h${y}`)}<line x1={geom.x0} y1={y} x2={rightX} y2={y} stroke={gridCss} stroke-width="1" />{/each}

  {#if cfg.showCorners !== false}
    {#each corners as c (c.label + c.x)}
      <circle cx={c.x < geom.x0 + geom.w / 2 ? geom.x0 + 5 : rightX - 5} cy={c.y < geom.y0 + geom.h / 2 ? geom.y0 + 5 : baseY - 5} r="2.5" fill={cornerCss} />
      <text x={c.x} y={c.y} font-size={labelSize} fill={labelCss} text-anchor={c.ax} dominant-baseline={c.ay} opacity="0.85">{c.label}</text>
    {/each}
  {/if}

  {#if cfg.showTrail === true && trail.length > 1}
    <polyline points={trail.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ')} fill="none" stroke={trailCss} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  {/if}

  {#if cfg.showCrosshair !== false}
    <line x1={geom.x0} y1={puckPx.py} x2={rightX} y2={puckPx.py} stroke={crossCss} stroke-width="1" />
    <line x1={puckPx.px} y1={geom.y0} x2={puckPx.px} y2={baseY} stroke={crossCss} stroke-width="1" />
  {/if}

  <circle cx={puckPx.px} cy={puckPx.py} r={puckR} fill={puckCss} stroke="rgba(0,0,0,0.55)" stroke-width="1.5" />
  <circle cx={puckPx.px} cy={puckPx.py} r={Math.max(1, puckR * 0.35)} fill="rgba(255,255,255,0.85)" />
</svg>

<style>
  .joystick { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
