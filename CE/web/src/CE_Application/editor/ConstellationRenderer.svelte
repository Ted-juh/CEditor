<script>
  // Preset Constellation — a field of preset "stars", faint links between sonic
  // neighbours, and a probe that recalls (snap) or morphs (blend) the nearest
  // stars. The selected star is haloed and named. Visual only; the probe / star
  // drag + wander are driven by the preview surface, which shares constellation
  // geometry (pad = 10). Live probe arrives via Constellation.__probeX/__probeY,
  // a drag via __drag.
  import {
    constellationConfig, constellationTargets, constellationPresets, constellationProbe,
    constellationGeometry, constellationToPx, constellationLinks, selectedPreset,
  } from '../utils/constellationLayout.js';

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
  const STAR_PALETTE = ['rgba(91,155,213,1)', 'rgba(155,138,255,1)', 'rgba(57,217,138,1)', 'rgba(242,201,76,1)', 'rgba(242,153,74,1)', 'rgba(235,87,87,1)'];

  let cfg = $derived(constellationConfig(control));
  let geom = $derived(constellationGeometry(width, height, PAD));
  let targets = $derived(constellationTargets(control));
  let presets = $derived(constellationPresets(control));
  let probe = $derived({
    x: cfg.__probeX !== undefined ? n(cfg.__probeX, 0.5) : n(cfg.probeX, 0.5),
    y: cfg.__probeY !== undefined ? n(cfg.__probeY, 0.5) : n(cfg.probeY, 0.5),
  });
  let dragKind = $derived(String(cfg.__drag ?? ''));

  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(12,12,18,1)'));
  let probeCss = $derived(css(cfg.probeColour, 'rgba(242,201,76,1)'));
  let linkCss = $derived(css(cfg.linkColour, 'rgba(42,107,168,0.2)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let labelSize = $derived(Math.max(7, Math.min(n(font?.size, 10), 12)));

  let starPx = $derived(presets.map((p, i) => ({
    p, i, q: constellationToPx(p, geom),
    colour: p.colour ? css(p.colour) : STAR_PALETTE[i % STAR_PALETTE.length],
  })));
  let probePx = $derived(constellationToPx(probe, geom));
  let sel = $derived(selectedPreset(control));
  let links = $derived(cfg.showLinks !== false ? constellationLinks(control, n(cfg.linkCount, 2)) : []);
  let modeSnap = $derived(String(cfg.mode ?? 'blend') === 'snap');

  function anchorText(q) {
    const right = q.px > geom.x0 + geom.w * 0.7;
    return { x: right ? q.px - 9 : q.px + 9, anchor: right ? 'end' : 'start' };
  }
</script>

<svg class="constellation" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={geom.x0} y={geom.y0} width={geom.w} height={geom.h} rx="8" fill={fieldCss} stroke="rgba(36,36,48,1)" />

  <!-- constellation links (sonic neighbours) -->
  {#each links as l (`${l.a}_${l.b}`)}
    {@const qa = starPx[l.a]?.q}
    {@const qb = starPx[l.b]?.q}
    {#if qa && qb}
      <line x1={qa.px} y1={qa.py} x2={qb.px} y2={qb.py} stroke={linkCss} stroke-width="1" />
    {/if}
  {/each}

  <!-- probe → selected/blended lines -->
  {#if modeSnap}
    {#if starPx[sel]}
      <line x1={probePx.px} y1={probePx.py} x2={starPx[sel].q.px} y2={starPx[sel].q.py} stroke={probeCss} stroke-width="1" opacity="0.4" stroke-dasharray="2 3" />
    {/if}
  {/if}

  <!-- preset stars -->
  {#each starPx as s (s.i)}
    {@const at = anchorText(s.q)}
    {@const isSel = s.i === sel}
    {@const dragging = dragKind === `star:${s.i}`}
    {#if isSel}
      <circle cx={s.q.px} cy={s.q.py} r="12" fill={s.colour} opacity="0.2" />
    {/if}
    <circle cx={s.q.px} cy={s.q.py} r={isSel ? 6.5 : 5} fill={s.colour} stroke={dragging || isSel ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.5)'} stroke-width={dragging || isSel ? 1.5 : 1} />
    {#if cfg.showLabels !== false && (isSel || presets.length <= 8)}
      <text x={at.x} y={s.q.py + 3.5} font-size={labelSize} fill={labelCss} text-anchor={at.anchor} opacity={isSel ? 1 : 0.75} style={isSel ? 'font-weight:600' : ''}>{s.p.label}</text>
    {/if}
  {/each}

  <!-- probe -->
  <circle cx={probePx.px} cy={probePx.py} r="14" fill={probeCss} opacity="0.14" />
  <circle cx={probePx.px} cy={probePx.py} r="7" fill="none" stroke={probeCss} stroke-width="2" />
  <circle cx={probePx.px} cy={probePx.py} r="2" fill={probeCss} />

  <!-- mode + selected readout -->
  <text x={geom.x0 + 6} y={geom.y0 + 13} font-size={Math.max(8, labelSize - 1)} fill={labelCss} opacity="0.7" style="letter-spacing:.06em;text-transform:uppercase">{modeSnap ? 'recall' : 'morph'}</text>
  {#if starPx[sel]}
    <text x={geom.x0 + geom.w - 6} y={geom.y0 + 13} font-size={labelSize} fill={probeCss} text-anchor="end" opacity="0.9">{starPx[sel].p.label}</text>
  {/if}
</svg>

<style>
  .constellation { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
