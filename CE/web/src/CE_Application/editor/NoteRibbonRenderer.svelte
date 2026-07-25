<script>
  // Ribbon Keyboard — a strip of pitch. Scale-snap draws one wide zone per in-key
  // note; chromatic draws every semitone with the out-of-key ones sunk like black
  // keys; glide draws the same landmarks but plays continuously between them.
  // Visual only; the playing (note-on/off, pitch bend, the expression CC) lives
  // in the preview surface, which shares noteRibbonLayout geometry (pad = 8).
  // The live touch arrives via NoteRibbon.__touch.
  import {
    ribbonConfig, ribbonMode, ribbonKey, ribbonScaleName, ribbonZones, ribbonHorizontal,
    ribbonGeometry, zoneRect, touchLabel, RIBBON_MODE_LABELS,
  } from '../utils/noteRibbonLayout.js';
  import { noteName, useFlats, SCALE_LABELS } from '../utils/chordPadLayout.js';

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
  let mode = $derived(ribbonMode(control));
  let keyPc = $derived(ribbonKey(control));
  let scaleName = $derived(ribbonScaleName(control));
  let flats = $derived(useFlats(keyPc, scaleName));
  let horizontal = $derived(ribbonHorizontal(control));
  let zones = $derived(ribbonZones(control));
  let touch = $derived(cfg.__touch ?? null);

  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(16,16,23,1)'));
  let zoneCss = $derived(css(cfg.zoneColour, 'rgba(23,23,32,1)'));
  let inKeyCss = $derived(css(cfg.inKeyColour, 'rgba(91,155,213,1)'));
  let rootCss = $derived(css(cfg.rootColour, 'rgba(242,201,76,1)'));
  let touchCss = $derived(css(cfg.touchColour, 'rgba(242,201,76,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let showHeader = $derived(cfg.showHeader !== false);
  let headerH = $derived(showHeader ? 22 : 0);
  let geom = $derived(ribbonGeometry(width, height, PAD, headerH, horizontal ? 'horizontal' : 'vertical'));

  let cells = $derived(zones.map((z) => ({ z, r: zoneRect(geom, z.index, zones.length) })));
  // Names only fit when the zone is wide (or tall) enough for them.
  let nameFits = $derived.by(() => {
    if (cfg.showNames === false || !cells.length) return false;
    const r = cells[0].r;
    return horizontal ? r.w >= 15 : r.h >= 12;
  });

  // The touch marker runs across the strip at the played position.
  let markPos = $derived.by(() => {
    if (!touch || !Number.isFinite(Number(touch.t))) return null;
    const t = Math.max(0, Math.min(1, Number(touch.t)));
    return horizontal ? geom.x0 + t * geom.w : geom.y0 + (1 - t) * geom.h;
  });
  // …and the expression axis puts a bead along the short axis.
  let acrossPos = $derived.by(() => {
    if (!touch || !Number.isFinite(Number(touch.across)) || String(cfg.modAxis ?? 'none') !== 'cc') return null;
    const a = Math.max(0, Math.min(1, Number(touch.across)));
    return horizontal ? geom.y0 + (1 - a) * geom.h : geom.x0 + a * geom.w;
  });
  let label = $derived(touchLabel(control, touch));
  // The header carries three things; a narrow strip (a vertical ribbon, say)
  // can't fit them, so they drop in order of usefulness — the live note last.
  let narrow = $derived(width < 240);
  let veryNarrow = $derived(width < 150);
  let keyLabel = $derived(veryNarrow
    ? noteName(keyPc, flats)
    : `${noteName(keyPc, flats)} ${SCALE_LABELS[scaleName] ?? scaleName}`);
</script>

<svg class="ribbon" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  {#if showHeader}
    <rect x={PAD} y={PAD - 4} width={Math.max(10, width - PAD * 2)} height={headerH - 4} rx="6" fill="rgba(20,20,32,1)" stroke="rgba(42,42,54,1)" />
    <text x={PAD + 9} y={PAD + 9} font-size="10" fill="rgba(232,232,238,1)" style="font-weight:600">{keyLabel}</text>
    {#if !narrow}
      <text x={width / 2} y={PAD + 9} font-size="9" fill={labelCss} text-anchor="middle" opacity="0.8">{RIBBON_MODE_LABELS[mode] ?? mode}</text>
    {/if}
    <text x={width - PAD - 8} y={PAD + 9} font-size="10" fill={label ? touchCss : labelCss} text-anchor="end" style="font-weight:600" opacity={label ? 1 : 0.55}>
      {label || (veryNarrow ? `${zones.length}` : `${zones.length} zones`)}
    </text>
  {/if}

  <rect x={geom.x0 - 2} y={geom.y0 - 2} width={geom.w + 4} height={geom.h + 4} rx="5" fill={fieldCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />

  {#each cells as c (c.z.note)}
    {@const accent = c.z.isRoot ? rootCss : inKeyCss}
    <!-- Out-of-key semitones sit darker and inset, so a chromatic strip still
         reads as a keyboard rather than as a flat row of identical cells. -->
    {@const inset = c.z.inScale ? 0 : (horizontal ? Math.min(10, c.r.h * 0.2) : Math.min(10, c.r.w * 0.2))}
    <rect x={c.r.x + 0.5} y={c.r.y + 0.5 + (horizontal ? inset : 0)}
          width={Math.max(1, c.r.w - 1 - (horizontal ? 0 : inset))} height={Math.max(1, c.r.h - 1 - (horizontal ? inset : 0))}
          rx="3"
          fill={c.z.inScale ? zoneCss : 'rgba(9,9,13,1)'}
          stroke={c.z.isRoot ? accent : 'rgba(255,255,255,0.05)'}
          stroke-width={c.z.isRoot ? 1.4 : 1}
          opacity={c.z.inScale ? 1 : 0.9} />
    <!-- an accent stripe along the far edge marks in-key zones at a glance -->
    {#if c.z.inScale}
      {#if horizontal}
        <rect x={c.r.x + 2} y={c.r.y + 3} width={Math.max(1, c.r.w - 4)} height="3" rx="1.5" fill={accent} opacity={c.z.isRoot ? 1 : 0.55} />
      {:else}
        <rect x={c.r.x + 3} y={c.r.y + 2} width="3" height={Math.max(1, c.r.h - 4)} rx="1.5" fill={accent} opacity={c.z.isRoot ? 1 : 0.55} />
      {/if}
    {/if}
    {#if nameFits && (mode === 'snap' || c.z.isRoot || c.z.inScale)}
      <text x={c.r.x + c.r.w / 2} y={c.r.y + c.r.h - 5}
            font-size={Math.max(7, Math.min(9.5, (horizontal ? c.r.w : c.r.h) * 0.42))}
            fill={c.z.isRoot ? rootCss : labelCss} text-anchor="middle" opacity={c.z.isRoot ? 1 : 0.75}>
        {c.z.isRoot ? c.z.name : c.z.shortName}
      </text>
    {/if}
  {/each}

  <!-- the touch: a bright rail across the strip plus a bubble with the note -->
  {#if markPos !== null}
    {#if horizontal}
      <line x1={markPos} y1={geom.y0 - 2} x2={markPos} y2={geom.y0 + geom.h + 2} stroke={touchCss} stroke-width="2" />
      <circle cx={markPos} cy={geom.y0 + geom.h / 2} r="5" fill={touchCss} opacity="0.9" />
      <circle cx={markPos} cy={geom.y0 + geom.h / 2} r="11" fill={touchCss} opacity="0.18" />
    {:else}
      <line x1={geom.x0 - 2} y1={markPos} x2={geom.x0 + geom.w + 2} y2={markPos} stroke={touchCss} stroke-width="2" />
      <circle cx={geom.x0 + geom.w / 2} cy={markPos} r="5" fill={touchCss} opacity="0.9" />
      <circle cx={geom.x0 + geom.w / 2} cy={markPos} r="11" fill={touchCss} opacity="0.18" />
    {/if}
  {/if}

  <!-- the expression axis bead, when the cross axis is sending a CC -->
  {#if markPos !== null && acrossPos !== null}
    {#if horizontal}
      <circle cx={markPos} cy={acrossPos} r="3.5" fill="#fff" opacity="0.95" />
    {:else}
      <circle cx={acrossPos} cy={markPos} r="3.5" fill="#fff" opacity="0.95" />
    {/if}
  {/if}
</svg>

<style>
  .ribbon { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
