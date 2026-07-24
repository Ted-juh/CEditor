<script>
  // Crossfader — a 1-D A/B blend fader: a groove with an A-side and B-side fill,
  // a centre detent tick, the draggable handle, A/B end labels and optional
  // per-side gain bars. Visual only; the drag is driven by the preview surface,
  // which shares crossfaderLayout geometry (pad = 10). Live mix arrives via
  // Crossfader.__mix.
  import {
    crossfaderConfig, crossfaderMix, crossfaderVertical, crossfaderGains,
    crossfaderGeometry, crossfaderHandlePos,
  } from '../utils/crossfaderLayout.js';

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

  let cfg = $derived(crossfaderConfig(control));
  let vertical = $derived(crossfaderVertical(control));
  let mix = $derived(cfg.__mix !== undefined ? Math.max(0, Math.min(1, n(cfg.__mix, 0.5))) : crossfaderMix(control));
  let geom = $derived(crossfaderGeometry(width, height, control, PAD));
  let handle = $derived(crossfaderHandlePos(mix, geom));
  let gains = $derived(crossfaderGains(mix, cfg.law));

  let trackCss = $derived(css(cfg.trackColour, 'rgba(27,27,27,1)'));
  let fillACss = $derived(css(cfg.fillAColour, 'rgba(91,155,213,1)'));
  let fillBCss = $derived(css(cfg.fillBColour, 'rgba(242,153,74,1)'));
  let handleCss = $derived(css(cfg.handleColour, 'rgba(242,242,242,1)'));
  let detentCss = $derived(css(cfg.detentColour, 'rgba(255,255,255,0.33)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));
  let handleSize = $derived(Math.max(6, n(cfg.handleSize, 14)));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(8, n(font?.size, 11)));

  // Groove is a slim bar centred in the track; the handle rides along it.
  let groove = $derived.by(() => {
    const thin = Math.max(4, Math.min(vertical ? geom.w : geom.h, 10));
    if (vertical) return { x: geom.x0 + (geom.w - thin) / 2, y: geom.y0, w: thin, h: geom.h };
    return { x: geom.x0, y: geom.y0 + (geom.h - thin) / 2, w: geom.w, h: thin };
  });
  let centerPx = $derived(vertical ? geom.y0 + geom.h / 2 : geom.x0 + geom.w / 2);
</script>

<svg class="xfader" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={groove.x} y={groove.y} width={groove.w} height={groove.h} rx={Math.min(groove.w, groove.h) / 2} fill={trackCss} />

  {#if vertical}
    <!-- A fill (bottom → handle), B fill (handle → top) -->
    <rect x={groove.x} y={handle.py} width={groove.w} height={Math.max(0, geom.y0 + geom.h - handle.py)} rx={groove.w / 2} fill={fillACss} opacity="0.85" />
    <rect x={groove.x} y={geom.y0} width={groove.w} height={Math.max(0, handle.py - geom.y0)} rx={groove.w / 2} fill={fillBCss} opacity="0.85" />
    <line x1={groove.x - 2} y1={centerPx} x2={groove.x + groove.w + 2} y2={centerPx} stroke={detentCss} stroke-width="1.5" />
  {:else}
    <rect x={geom.x0} y={groove.y} width={Math.max(0, handle.px - geom.x0)} height={groove.h} rx={groove.h / 2} fill={fillACss} opacity="0.85" />
    <rect x={handle.px} y={groove.y} width={Math.max(0, geom.x0 + geom.w - handle.px)} height={groove.h} rx={groove.h / 2} fill={fillBCss} opacity="0.85" />
    <line x1={centerPx} y1={groove.y - 2} x2={centerPx} y2={groove.y + groove.h + 2} stroke={detentCss} stroke-width="1.5" />
  {/if}

  {#if cfg.showLabels !== false}
    {#if vertical}
      <text x={geom.x0 + geom.w / 2} y={geom.y0 + geom.h - 1} font-size={labelSize} fill={labelCss} text-anchor="middle" dominant-baseline="auto" opacity="0.9">{cfg.labelA ?? 'A'}</text>
      <text x={geom.x0 + geom.w / 2} y={geom.y0 + 1} font-size={labelSize} fill={labelCss} text-anchor="middle" dominant-baseline="hanging" opacity="0.9">{cfg.labelB ?? 'B'}</text>
    {:else}
      <text x={geom.x0} y={geom.y0 - 1} font-size={labelSize} fill={labelCss} text-anchor="start" dominant-baseline="auto" opacity="0.9">{cfg.labelA ?? 'A'}</text>
      <text x={geom.x0 + geom.w} y={geom.y0 - 1} font-size={labelSize} fill={labelCss} text-anchor="end" dominant-baseline="auto" opacity="0.9">{cfg.labelB ?? 'B'}</text>
    {/if}
  {/if}

  {#if cfg.showGains === true}
    {#if vertical}
      <rect x={geom.x0} y={geom.y0 + geom.h - gains.a * geom.h} width="3" height={gains.a * geom.h} fill={fillACss} />
      <rect x={geom.x0 + geom.w - 3} y={geom.y0 + geom.h - gains.b * geom.h} width="3" height={gains.b * geom.h} fill={fillBCss} />
    {:else}
      <rect x={geom.x0} y={geom.y0 + geom.h - 3} width={gains.a * (geom.w / 2 - 4)} height="3" fill={fillACss} />
      <rect x={geom.x0 + geom.w - gains.b * (geom.w / 2 - 4)} y={geom.y0 + geom.h - 3} width={gains.b * (geom.w / 2 - 4)} height="3" fill={fillBCss} />
    {/if}
  {/if}

  <!-- Handle -->
  {#if vertical}
    <rect x={geom.x0 + geom.w / 2 - handleSize / 2} y={handle.py - handleSize * 0.34} width={handleSize} height={handleSize * 0.68} rx="3" fill={handleCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />
  {:else}
    <rect x={handle.px - handleSize * 0.34} y={geom.y0 + geom.h / 2 - handleSize / 2} width={handleSize * 0.68} height={handleSize} rx="3" fill={handleCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />
  {/if}
</svg>

<style>
  .xfader { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
