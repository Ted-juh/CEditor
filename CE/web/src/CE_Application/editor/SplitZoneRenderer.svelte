<script>
  // Zone Splitter — a keyboard graphic with the zone bands above it. Keys held
  // on the hardware input light up in the colour of the zone that claimed them,
  // so you can see the split working rather than infer it from what you hear.
  // Visual only; the routing and the note output live in the preview surface,
  // which shares splitZoneLayout geometry (pad = 8). Live held notes arrive as
  // SplitZone.__held, and the in-progress drag as __dragEdge.
  import {
    splitConfig, splitZones, splitRange, splitGeometry, keyRect, isBlackKey,
    zoneBandRect, zonesAt, unclaimedNotes, splitUnmatched, zoneSwitchesOnVelocity,
  } from '../utils/splitZoneLayout.js';
  import { midiNoteLabel } from '../utils/arpLayout.js';

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

  let cfg = $derived(splitConfig(control));
  let zones = $derived(splitZones(control));
  let range = $derived(splitRange(control));
  let showHeader = $derived(cfg.showHeader !== false);
  let headerH = $derived(showHeader ? 20 : 0);
  // Bands stack into one lane per zone, so overlapping zones are visibly
  // stacked rather than hidden behind each other.
  let lanes = $derived(Math.max(1, zones.length));
  let geom = $derived(splitGeometry(width, height, PAD, headerH, Math.min(26, Math.max(10, lanes * 8))));

  let faceCss = $derived(css(cfg.faceColour, 'rgba(20,20,32,1)'));
  let whiteCss = $derived(css(cfg.whiteColour, 'rgba(232,232,238,1)'));
  let blackCss = $derived(css(cfg.blackColour, 'rgba(26,26,34,1)'));
  let litCss = $derived(css(cfg.litColour, 'rgba(242,201,76,1)'));
  let gapCss = $derived(css(cfg.gapColour, 'rgba(58,58,70,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let held = $derived(Array.isArray(cfg.__held) ? cfg.__held.map((v) => Math.round(n(v, -1))) : []);
  let gaps = $derived(cfg.showGaps !== false && splitUnmatched(control) === 'drop'
    ? new Set(unclaimedNotes(control, range.lowNote, range.highNote)) : new Set());

  // Every key in the drawn range, with the colour it should take. Whites first
  // then blacks, so the blacks paint on top the way a piano looks.
  let keys = $derived.by(() => {
    const out = [];
    for (let note = range.lowNote; note <= range.highNote; note += 1) {
      const claim = zonesAt(control, note);
      const zoneCss = claim.length ? css(claim[0].colour, null) : null;
      out.push({
        note,
        rect: keyRect(geom, note, range.lowNote, range.highNote),
        black: isBlackKey(note),
        lit: held.includes(note),
        gap: gaps.has(note),
        zoneCss,
      });
    }
    return out.sort((a, b) => Number(a.black) - Number(b.black));
  });

  let bands = $derived(zones.map((z, i) => ({
    zone: z,
    rect: zoneBandRect(geom, z, range.lowNote, range.highNote, i, lanes),
    fill: css(z.colour, 'rgba(91,155,213,1)'),
  })).filter((b) => b.rect));

  // The header says what the split actually does, since that is the question
  // you have when you look at it: which channel, transposed how far.
  // Terse markers for the things that are invisible on the keyboard: a velocity
  // window, a blocked pedal, a CC filter. Without these a zone that has stopped
  // answering looks identical to one that hasn't.
  function marks(z) {
    const m = [];
    if (zoneSwitchesOnVelocity(z)) m.push(`v${z.velSwitchLow}-${z.velSwitchHigh}`);
    if (z.sustain === false) m.push('no ped');
    if (z.ccMode === 'none') m.push('no cc');
    else if (z.ccMode === 'list') m.push(`cc ${(z.ccList ?? []).join('/') || '—'}`);
    return m.length ? ` (${m.join(' ')})` : '';
  }
  let summary = $derived(zones.filter((z) => z.enabled)
    .map((z) => `${z.label} → ch${z.channel}${z.transpose ? (z.transpose > 0 ? ` +${z.transpose}` : ` ${z.transpose}`) : ''}${marks(z)}`)
    .join('   ·   '));
  let inLabel = $derived(cfg.inputChannel ? `in ch${cfg.inputChannel}` : 'in omni');
  let dragEdge = $derived(cfg.__dragEdge ?? null);
</script>

<svg class="split" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={PAD - 4} y={PAD - 4} width={Math.max(8, width - PAD * 2 + 8)} height={Math.max(8, height - PAD * 2 + 8)}
        rx="6" fill={faceCss} stroke="rgba(42,42,54,1)" />

  {#if showHeader}
    <text x={PAD} y={PAD + 9} font-size="9.5" fill={labelCss} opacity="0.85">{summary || 'No zones'}</text>
    <text x={width - PAD} y={PAD + 9} font-size="9" fill={labelCss} text-anchor="end" opacity="0.6">{inLabel}</text>
  {/if}

  <!-- zone bands, one lane each so an overlap is visible as a stack -->
  {#each bands as b (b.zone.id)}
    <rect x={b.rect.x} y={b.rect.y} width={b.rect.w} height={b.rect.h} rx="2"
          fill={b.fill} opacity={b.zone.enabled ? 0.85 : 0.25} />
    {#if cfg.showLabels !== false && b.rect.w > 34}
      <text x={b.rect.x + 4} y={b.rect.y + b.rect.h - 2} font-size={Math.min(9, b.rect.h - 1)}
            fill="rgba(11,11,16,0.95)" style="font-weight:600">{b.zone.label}</text>
    {/if}
  {/each}

  <!-- keys -->
  {#each keys as k (k.note)}
    <rect x={k.rect.x} y={k.rect.y} width={Math.max(1, k.rect.w - (k.black ? 0 : 1))} height={k.rect.h}
          rx={k.black ? 1.5 : 2}
          fill={k.lit ? litCss : k.gap ? gapCss : k.black ? blackCss : whiteCss}
          stroke="rgba(0,0,0,0.55)" stroke-width={k.black ? 0.5 : 1} />
    <!-- a thin strip of the owning zone's colour along the bottom of each key -->
    {#if k.zoneCss && !k.black}
      <rect x={k.rect.x} y={k.rect.y + k.rect.h - 3} width={Math.max(1, k.rect.w - 1)} height="3" fill={k.zoneCss} opacity="0.9" />
    {/if}
  {/each}

  <!-- the split point being dragged, called out with the note it has landed on -->
  {#if dragEdge}
    {@const r = keyRect(geom, dragEdge.note, range.lowNote, range.highNote)}
    <line x1={r.x + r.w / 2} y1={geom.bandY} x2={r.x + r.w / 2} y2={geom.keysY + geom.keysH}
          stroke={litCss} stroke-width="1.5" opacity="0.9" />
    <text x={r.x + r.w / 2} y={geom.bandY - 2} font-size="9" fill={litCss} text-anchor="middle" style="font-weight:700">
      {midiNoteLabel(dragEdge.note)}
    </text>
  {/if}
</svg>

<style>
  .split { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
