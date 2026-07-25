<script>
  // Drum Pads — a grid of fixed-note trigger pads. Each shows its drum name and
  // MIDI note; pads in a choke group carry a small marker so you can see which
  // ones cut each other. Visual only; the playing lives in the preview surface,
  // which shares drumPadLayout geometry (pad = 8). Live state arrives via
  // DrumPads.__hits (pad ids currently sounding) and __last (the last hit).
  import {
    drumConfig, drumRows, drumCols, drumPads, drumMap, drumChannel,
    drumGeometry, padRect, PAD_MAP_LABELS,
  } from '../utils/drumPadLayout.js';

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

  let cfg = $derived(drumConfig(control));
  let pads = $derived(drumPads(control));
  let origin = $derived(String(cfg.origin ?? 'bottomLeft'));
  let hits = $derived(new Set(Array.isArray(cfg.__hits) ? cfg.__hits : []));
  let last = $derived(cfg.__last ?? null);

  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(16,16,23,1)'));
  let padCss = $derived(css(cfg.padColour, 'rgba(23,23,32,1)'));
  let accentCss = $derived(css(cfg.accentColour, 'rgba(91,155,213,1)'));
  let hitCss = $derived(css(cfg.hitColour, 'rgba(242,201,76,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let showHeader = $derived(cfg.showHeader !== false);
  let headerH = $derived(showHeader ? 22 : 0);
  let geom = $derived(drumGeometry(width, height, drumRows(control), drumCols(control), PAD, headerH, 5));

  let cells = $derived(pads.map((p) => ({ p, r: padRect(geom, p.index, origin) })));
  // Text drops out on small pads rather than overflowing them.
  let labelFits = $derived(cfg.showLabels !== false && geom.cellH >= 26 && geom.cellW >= 34);
  let noteFits = $derived(cfg.showNotes !== false && geom.cellH >= 34 && geom.cellW >= 26);
  let narrow = $derived(width < 230);
  let headRight = $derived(last ? `${last.label} · ${last.note}` : `ch ${drumChannel(control)}`);
</script>

<svg class="drumpads" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  {#if showHeader}
    <rect x={PAD} y={PAD - 4} width={Math.max(10, width - PAD * 2)} height={headerH - 4} rx="6" fill="rgba(20,20,32,1)" stroke="rgba(42,42,54,1)" />
    <text x={PAD + 9} y={PAD + 9} font-size="10" fill="rgba(232,232,238,1)" style="font-weight:600">
      {PAD_MAP_LABELS[drumMap(control)] ?? drumMap(control)}
    </text>
    {#if !narrow}
      <text x={width / 2} y={PAD + 9} font-size="9" fill={labelCss} text-anchor="middle" opacity="0.75">
        {drumRows(control)}×{drumCols(control)}
      </text>
    {/if}
    <text x={width - PAD - 8} y={PAD + 9} font-size="10" fill={last ? hitCss : labelCss} text-anchor="end" style="font-weight:600" opacity={last ? 1 : 0.6}>
      {headRight}
    </text>
  {/if}

  <rect x={geom.x0 - 2} y={geom.y0 - 2} width={geom.w + 4} height={geom.h + 4} rx="5" fill={fieldCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />

  {#each cells as c (c.p.id)}
    {@const isHit = hits.has(c.p.id)}
    {@const accent = c.p.colour ? css(c.p.colour, accentCss) : accentCss}
    {#if isHit}
      <rect x={c.r.x - 3} y={c.r.y - 3} width={c.r.w + 6} height={c.r.h + 6} rx="9" fill={hitCss} opacity="0.22" />
    {/if}
    <rect x={c.r.x} y={c.r.y} width={c.r.w} height={c.r.h} rx="6"
          fill={isHit ? 'rgba(38,38,48,1)' : padCss}
          stroke={isHit ? hitCss : 'rgba(44,44,56,1)'} stroke-width={isHit ? 2 : 1} />
    <!-- the pad's own accent stripe: its per-pad colour, or the section accent -->
    <rect x={c.r.x + 6} y={c.r.y + 6} width={Math.max(2, c.r.w - 12)} height="3" rx="1.5"
          fill={isHit ? hitCss : accent} opacity={isHit ? 1 : 0.7} />
    {#if labelFits}
      <text x={c.r.x + c.r.w / 2} y={c.r.y + c.r.h / 2 + (noteFits ? 1 : 4)}
            font-size={Math.max(8, Math.min(12, c.r.w * 0.19))}
            fill={isHit ? '#fff' : 'rgba(232,232,238,1)'} text-anchor="middle" style="font-weight:600">{c.p.label}</text>
    {/if}
    {#if noteFits}
      <text x={c.r.x + c.r.w / 2} y={c.r.y + c.r.h - 7} font-size="8.5"
            fill={isHit ? hitCss : labelCss} text-anchor="middle" opacity={isHit ? 1 : 0.6}>{c.p.note}</text>
    {/if}
    <!-- choke marker: pads carrying the same digit cut each other -->
    {#if c.p.choke > 0 && c.r.w >= 30}
      <circle cx={c.r.x + c.r.w - 10} cy={c.r.y + c.r.h - 10} r="6" fill="rgba(0,0,0,0.45)" stroke={accent} stroke-width="1" opacity="0.85" />
      <text x={c.r.x + c.r.w - 10} y={c.r.y + c.r.h - 7} font-size="7.5" fill={accent} text-anchor="middle" style="font-weight:700">{c.p.choke}</text>
    {/if}
  {/each}
</svg>

<style>
  .drumpads { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
