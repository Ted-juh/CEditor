<script>
  // Ribbon — a 1-D absolute-touch strip (flat groove + fill + indicator, touch
  // glow) or a 3-D wheel (gradient body + ridges + a notch at the value). Visual
  // only; the touch drag + return is driven by the preview surface, which shares
  // ribbonLayout geometry (pad = 8). Live value/touch arrive via
  // Ribbon.__value / Ribbon.__touch.
  import {
    ribbonConfig, ribbonValue, ribbonVertical, ribbonGeometry, ribbonIndicator, wheelRidges,
  } from '../utils/ribbonLayout.js';

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

  let cfg = $derived(ribbonConfig(control));
  let vertical = $derived(ribbonVertical(control));
  let wheel = $derived(String(cfg.style) === 'wheel' || String(cfg.style) === 'wheel3d');
  let realistic = $derived(String(cfg.style) === 'wheel3d');
  let value = $derived(cfg.__value !== undefined ? Math.max(0, Math.min(1, n(cfg.__value, 0.5))) : ribbonValue(control));
  let touched = $derived(cfg.__touch === true);
  let bipolar = $derived(cfg.bipolar === true);
  let geom = $derived(ribbonGeometry(width, height, PAD));
  let ind = $derived(ribbonIndicator(value, geom, vertical));

  let trackCss = $derived(css(cfg.trackColour, 'rgba(24,24,24,1)'));
  let fillCss = $derived(css(cfg.fillColour, 'rgba(91,155,213,1)'));
  let indCss = $derived(css(cfg.indicatorColour, 'rgba(255,255,255,1)'));
  let glowCss = $derived(css(cfg.glowColour, 'rgba(91,155,213,0.55)'));
  let wheelCss = $derived(css(cfg.wheelColour, 'rgba(42,42,42,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));
  let indSize = $derived(Math.max(1, n(cfg.indicatorSize, 3)));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(8, n(font?.size, 11)));

  let centerAxis = $derived(vertical ? geom.y0 + geom.h / 2 : geom.x0 + geom.w / 2);
  let originAxis = $derived(bipolar ? centerAxis : (vertical ? geom.y0 + geom.h : geom.x0)); // fill origin
  let readout = $derived.by(() => {
    if (cfg.showValue !== true) return '';
    const p = Math.max(0, Math.round(n(cfg.valuePrecision, 2)));
    return (bipolar ? (value * 2 - 1) : value).toFixed(p);
  });
  let gid = $derived(`rib-${String(control?._children?.Core?.id ?? 'x')}`);
  let wheelRx = $derived(Math.min(geom.w, geom.h) * 0.28);
  let ridges = $derived(realistic ? wheelRidges(value, Math.max(6, Math.round((vertical ? geom.h : geom.w) / 6))) : []);
</script>

<svg class="ribbon" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <defs>
    <linearGradient id={`${gid}-wheel`} x1="0" y1="0" x2={vertical ? '1' : '0'} y2={vertical ? '0' : '1'}>
      <stop offset="0" stop-color="rgba(0,0,0,0.55)" />
      <stop offset="0.5" stop-color="rgba(255,255,255,0.14)" />
      <stop offset="1" stop-color="rgba(0,0,0,0.55)" />
    </linearGradient>
    <!-- Glossy cylinder cross-section (perpendicular to the axis). -->
    <linearGradient id={`${gid}-body`} x1="0" y1="0" x2={vertical ? '1' : '0'} y2={vertical ? '0' : '1'}>
      <stop offset="0" stop-color="rgba(0,0,0,0.62)" />
      <stop offset="0.13" stop-color="rgba(255,255,255,0.05)" />
      <stop offset="0.40" stop-color="rgba(255,255,255,0.38)" />
      <stop offset="0.52" stop-color="rgba(255,255,255,0.06)" />
      <stop offset="0.72" stop-color="rgba(255,255,255,0.03)" />
      <stop offset="1" stop-color="rgba(0,0,0,0.66)" />
    </linearGradient>
    <!-- Axial darkening: the cylinder curves away at the ends. -->
    <linearGradient id={`${gid}-axial`} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
      <stop offset="0" stop-color="rgba(0,0,0,0.6)" />
      <stop offset="0.18" stop-color="rgba(0,0,0,0)" />
      <stop offset="0.82" stop-color="rgba(0,0,0,0)" />
      <stop offset="1" stop-color="rgba(0,0,0,0.6)" />
    </linearGradient>
    <clipPath id={`${gid}-clip`}>
      <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx={wheelRx} />
    </clipPath>
  </defs>

  {#if realistic}
    <!-- Recessed slot bezel -->
    <rect x={geom.x0 - 2} y={geom.y0 - 2} width={geom.w + 4} height={geom.h + 4} rx={wheelRx + 2} fill="rgba(0,0,0,0.55)" />
    <!-- Wheel body + gloss -->
    <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx={wheelRx} fill={wheelCss} />
    <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx={wheelRx} fill={`url(#${gid}-body)`} />
    <g clip-path={`url(#${gid}-clip)`}>
      {#each ridges as ridge (ridge.pos)}
        {#if ridge.pos > 0.02 && ridge.pos < 0.98}
          {#if vertical}
            {@const y = geom.y0 + ridge.pos * geom.h}
            <line x1={geom.x0} y1={y} x2={geom.x0 + geom.w} y2={y} stroke={`rgba(0,0,0,${(0.16 + 0.42 * ridge.shade).toFixed(3)})`} stroke-width="1" />
            <line x1={geom.x0} y1={y + 0.9} x2={geom.x0 + geom.w} y2={y + 0.9} stroke={`rgba(255,255,255,${(0.04 + 0.22 * ridge.shade).toFixed(3)})`} stroke-width="1" />
          {:else}
            {@const xr = geom.x0 + ridge.pos * geom.w}
            <line x1={xr} y1={geom.y0} x2={xr} y2={geom.y0 + geom.h} stroke={`rgba(0,0,0,${(0.16 + 0.42 * ridge.shade).toFixed(3)})`} stroke-width="1" />
            <line x1={xr + 0.9} y1={geom.y0} x2={xr + 0.9} y2={geom.y0 + geom.h} stroke={`rgba(255,255,255,${(0.04 + 0.22 * ridge.shade).toFixed(3)})`} stroke-width="1" />
          {/if}
        {/if}
      {/each}
    </g>
    <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx={wheelRx} fill={`url(#${gid}-axial)`} />
    {#if bipolar}
      {#if vertical}
        <line x1={geom.x0 - 1} y1={centerAxis} x2={geom.x0 + geom.w + 1} y2={centerAxis} stroke="rgba(255,255,255,0.45)" stroke-width="1.25" />
      {:else}
        <line x1={centerAxis} y1={geom.y0 - 1} x2={centerAxis} y2={geom.y0 + geom.h + 1} stroke="rgba(255,255,255,0.45)" stroke-width="1.25" />
      {/if}
    {/if}
    <!-- Rim highlight -->
    <rect x={geom.x0 + 0.5} y={geom.y0 + 0.5} width={geom.w - 1} height={geom.h - 1} rx={wheelRx} fill="none" stroke={touched ? glowCss : 'rgba(255,255,255,0.08)'} stroke-width={touched ? 2 : 1} />
  {:else if wheel}
    <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx={Math.min(geom.w, geom.h) * 0.28} fill={wheelCss} />
    <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx={Math.min(geom.w, geom.h) * 0.28} fill={`url(#${gid}-wheel)`} />
    {#if bipolar}
      <line x1={vertical ? geom.x0 : centerAxis} y1={vertical ? centerAxis : geom.y0} x2={vertical ? geom.x0 + geom.w : centerAxis} y2={vertical ? centerAxis : geom.y0 + geom.h} stroke="rgba(255,255,255,0.2)" stroke-width="1" />
    {/if}
    <!-- value notch -->
    {#if vertical}
      <rect x={geom.x0 + 1} y={ind.axis - indSize} width={geom.w - 2} height={indSize * 2} rx={indSize} fill={indCss} opacity={touched ? 1 : 0.85} />
    {:else}
      <rect x={ind.axis - indSize} y={geom.y0 + 1} width={indSize * 2} height={geom.h - 2} rx={indSize} fill={indCss} opacity={touched ? 1 : 0.85} />
    {/if}
    {#if touched}
      <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx={Math.min(geom.w, geom.h) * 0.28} fill="none" stroke={glowCss} stroke-width="2" />
    {/if}
  {:else}
    <!-- flat strip -->
    <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx={Math.min(geom.w, geom.h) * 0.18} fill={trackCss} />
    {#if vertical}
      <rect x={geom.x0} y={Math.min(originAxis, ind.axis)} width={geom.w} height={Math.abs(ind.axis - originAxis)} fill={fillCss} opacity="0.8" />
      {#if touched && cfg.showGlow !== false}
        <rect x={geom.x0 - 1} y={ind.axis - 10} width={geom.w + 2} height="20" fill={glowCss} opacity="0.5" />
      {/if}
      <rect x={geom.x0} y={ind.axis - indSize / 2} width={geom.w} height={indSize} fill={indCss} />
    {:else}
      <rect x={Math.min(originAxis, ind.axis)} y={geom.y0} width={Math.abs(ind.axis - originAxis)} height={geom.h} fill={fillCss} opacity="0.8" />
      {#if touched && cfg.showGlow !== false}
        <rect x={ind.axis - 10} y={geom.y0 - 1} width="20" height={geom.h + 2} fill={glowCss} opacity="0.5" />
      {/if}
      <rect x={ind.axis - indSize / 2} y={geom.y0} width={indSize} height={geom.h} fill={indCss} />
    {/if}
  {/if}

  {#if cfg.label}
    <text x={geom.x0 + geom.w / 2} y={geom.y0 + geom.h + 1} font-size={labelSize} fill={labelCss} text-anchor="middle" dominant-baseline="hanging" opacity="0.85">{cfg.label}</text>
  {/if}
  {#if readout}
    <text x={geom.x0 + geom.w / 2} y={geom.y0 - 1} font-size={labelSize} fill={labelCss} text-anchor="middle" dominant-baseline="auto" opacity="0.9">{readout}</text>
  {/if}
</svg>

<style>
  .ribbon { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
