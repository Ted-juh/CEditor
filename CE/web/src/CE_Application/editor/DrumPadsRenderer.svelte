<script>
  // Drum Pads — a grid of fixed-note trigger pads. Each shows its drum name and
  // MIDI note; pads in a choke group carry a small marker so you can see which
  // ones cut each other. Visual only; the playing lives in the preview surface,
  // which shares drumPadLayout geometry (pad = 8). Live state arrives via
  // DrumPads.__hits (pad ids currently sounding) and __last (the last hit).
  import {
    drumConfig, drumRows, drumCols, drumPads, drumMap, drumChannel,
    drumGeometry, padRect, PAD_MAP_LABELS,
    PAD_CORNERS, zonesEnabled, cornerAction, cornerRect,
  } from '../utils/drumPadLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  import PerformanceCell from './PerformanceCell.svelte';
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
  let face = $derived(cfg.padAppearance ?? 'flat');
  let radius = $derived(Math.max(0, Math.min(40, Number(cfg.padRadius) || 0)));
  let pads = $derived(drumPads(control));
  let origin = $derived(String(cfg.origin ?? 'bottomLeft'));
  // The corners carrying an action, once. Sixteen pads x four corners is a lot of ink for a map
  // that is the same on every pad, so it is computed here and drawn as a hint rather than a legend.
  let zoneCorners = $derived(zonesEnabled(cfg)
    ? PAD_CORNERS.map((c) => ({ corner: c, action: cornerAction(cfg, c) })).filter((z) => z.action !== 'none')
    : []);
  let hits = $derived(new Set(Array.isArray(cfg.__hits) ? cfg.__hits : []));
  let last = $derived(cfg.__last ?? null);
  // Notes arriving on the MIDI input (note input echo) — an outline, so a pad
  // a sequencer is playing never looks like one you struck.
  let echoSet = $derived(new Set(Array.isArray(cfg.__echo) ? cfg.__echo : []));

  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(16,16,23,1)'));
  let padCss = $derived(css(cfg.padColour, 'rgba(23,23,32,1)'));
  let accentCss = $derived(css(cfg.accentColour, 'rgba(91,155,213,1)'));
  let hitCss = $derived(css(cfg.hitColour, 'rgba(242,201,76,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));
  let echoCss = $derived(css(cfg.echoColour, 'rgba(57,217,138,1)'));
  // Echo intensity: how hard each incoming note is being played (poly pressure
  // while a finger leans on the key, else its struck velocity). Undefined when
  // the sender gives us nothing to go on, in which case the echo just draws
  // full — never dimmer than it would have been before this existed.
  let echoLevels = $derived(cfg.__echoLevels ?? null);
  function echoAlpha(note, floor = 0.4) {
    const l = echoLevels?.[note];
    return l === undefined ? 1 : floor + (1 - floor) * Math.max(0, Math.min(1, l));
  }


  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let showHeader = $derived(cfg.showHeader !== false);
  let headerH = $derived(showHeader ? 22 : 0);
  let geom = $derived(drumGeometry(width, height, drumRows(control), drumCols(control), PAD, headerH, 5, cfg));

  let cells = $derived(pads.map((p) => ({ p, r: padRect(geom, p.index, origin) })));
  // Text drops out on small pads rather than overflowing them.
  let labelFits = $derived(cfg.showLabels !== false && geom.cellH >= 26 && geom.cellW >= 34);
  let noteFits = $derived(cfg.showNotes !== false && geom.cellH >= 34 && geom.cellW >= 26);
  let narrow = $derived(width < 230);
  let headRight = $derived(last ? `${last.label} · ${last.note}`
    : (echoSet.size ? `IN · ${echoSet.size}` : `ch ${drumChannel(control)}`));
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
    <text x={width - PAD - 8} y={PAD + 9} font-size="10" fill={last ? hitCss : (echoSet.size ? echoCss : labelCss)} text-anchor="end" style="font-weight:600" opacity={last || echoSet.size ? 1 : 0.6}>
      {headRight}
    </text>
  {/if}

  <rect x={geom.x0 - 2} y={geom.y0 - 2} width={geom.w + 4} height={geom.h + 4} rx="5" fill={fieldCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />

  {#each cells as c (c.p.id)}
    {@const isHit = hits.has(c.p.id)}
    {@const accent = c.p.colour ? css(c.p.colour, accentCss) : accentCss}
    {@const isEcho = echoSet.has(c.p.note)}
    {#if geom.form !== 'rect'}
      <PerformanceCell form={geom.form} x={c.r.x} y={c.r.y} w={c.r.w} h={c.r.h} face={padCss} ink={labelCss} accent={isHit?hitCss:accent} active={isHit} echo={isEcho} />
    {:else}
    {#if isHit}
      <rect x={c.r.x - 3} y={c.r.y - 3} width={c.r.w + 6} height={c.r.h + 6} rx="9" fill={hitCss} opacity="0.22" />
    {:else if isEcho}
      <rect x={c.r.x - 2} y={c.r.y - 2} width={c.r.w + 4} height={c.r.h + 4} rx="8" fill="none"
            stroke={echoCss} stroke-width="2" opacity={0.9 * echoAlpha(c.p.note)} />
    {/if}
    {#if face === 'raised'}
      <rect x={c.r.x + 2} y={c.r.y + 3} width={c.r.w} height={c.r.h} rx={radius} fill="black" opacity="0.55" />
    {/if}
    <rect x={c.r.x} y={c.r.y} width={c.r.w} height={c.r.h} rx={face === 'chamfer' ? 0 : radius}
          style={face === 'chamfer' ? `clip-path:polygon(8% 0,92% 0,100% 12%,100% 88%,92% 100%,8% 100%,0 88%,0 12%);transform-box:fill-box;` : ''}
          fill={isHit ? hitCss : (isEcho ? 'rgba(30,40,36,1)' : (face === 'outline' ? 'none' : padCss))}
          stroke={isHit ? hitCss : (isEcho ? echoCss : 'rgba(44,44,56,1)')}
          stroke-opacity={isEcho && !isHit ? echoAlpha(c.p.note) : 1}
          stroke-width={isHit || isEcho ? 2 : 1} />
    {#if face === 'glass'}
      <rect x={c.r.x + 2} y={c.r.y + 2} width={Math.max(1, c.r.w - 4)} height={c.r.h * 0.42} rx={Math.min(radius, 8)} fill="white" opacity={isHit ? 0.08 : 0.19} />
    {:else if face === 'raised' || face === 'inset'}
      <path d={`M ${c.r.x + 5} ${c.r.y + c.r.h - 5} V ${c.r.y + 5} H ${c.r.x + c.r.w - 5}`} fill="none" stroke={face === 'raised' ? 'white' : 'black'} stroke-width="2" opacity={isHit ? 0.1 : 0.3} />
    {/if}
    <!-- the pad's own accent stripe: its per-pad colour, or the section accent -->
    <rect x={c.r.x + 6} y={c.r.y + 6} width={Math.max(2, c.r.w - 12)} height="3" rx="1.5"
          fill={isHit ? hitCss : accent} opacity={isHit ? 1 : 0.7} />
    {/if}
    {#if labelFits && c.r.w>=34 && c.r.h>=26}
      <text x={c.r.x + c.r.w / 2} y={c.r.y + c.r.h / 2 + (noteFits ? 1 : 4)}
            font-size={Math.max(8, Math.min(12, c.r.w * 0.19))}
            fill={geom.form === 'rect' && face === 'flat' ? (isHit ? '#fff' : 'rgba(232,232,238,1)') : labelCss} text-anchor="middle" style="font-weight:600">{c.p.label}</text>
    {/if}
    {#if noteFits && c.r.w>=26 && c.r.h>=34}
      <text x={c.r.x + c.r.w / 2} y={c.r.y + c.r.h - 7} font-size="8.5"
            fill={isHit ? hitCss : labelCss} text-anchor="middle" opacity={isHit ? 1 : 0.6}>{c.p.note}</text>
    {/if}
    <!-- corner zones: a wedge in each corner that does something other than a plain hit. Drawn
         faintly and only when the pad is big enough to aim at one. -->
    {#each zoneCorners as z (z.corner)}
      {@const zr = cornerRect(c.r, cfg, z.corner)}
      {#if c.r.w >= 44 && c.r.h >= 34}
        <!-- An L along the two INNER edges of the corner square: it draws the boundary you have
             to land inside, which a filled wedge also does but with eight times the ink. Four
             corners on every pad of a sixteen-pad grid is sixty-four marks, so this has to be
             quiet or the labels lose. -->
        <path d={z.corner === 'topLeft' ? `M${zr.x} ${zr.y + zr.h} L${zr.x + zr.w} ${zr.y + zr.h} L${zr.x + zr.w} ${zr.y}`
               : z.corner === 'topRight' ? `M${zr.x} ${zr.y} L${zr.x} ${zr.y + zr.h} L${zr.x + zr.w} ${zr.y + zr.h}`
               : z.corner === 'bottomLeft' ? `M${zr.x} ${zr.y} L${zr.x + zr.w} ${zr.y} L${zr.x + zr.w} ${zr.y + zr.h}`
               : `M${zr.x + zr.w} ${zr.y} L${zr.x} ${zr.y} L${zr.x} ${zr.y + zr.h}`}
              fill="none" stroke={accent} stroke-width="1" opacity="0.5" stroke-linecap="round" />
      {/if}
    {/each}
    <!-- roll marker: this pad restrikes for as long as it is held. Three descending ticks, on the
         LEFT so it never fights the choke digit — a hi-hat is commonly both. -->
    {#if c.p.roll && c.r.w >= 30}
      {#each [0, 1, 2] as t (t)}
        <rect x={c.r.x + 7 + t * 3.5} y={c.r.y + c.r.h - 13 + t * 1.5} width="2" height={8 - t * 1.5}
              rx="1" fill={accent} opacity={0.9 - t * 0.2} />
      {/each}
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
