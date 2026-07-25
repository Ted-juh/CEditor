<script>
  // Harmoniser — a keyboard showing what you played and what came out, and the
  // name of the chord. The keyboard fits the sounding range rather than a fixed
  // one, so a wide voicing isn't cropped. Visual only; the input, the chord and
  // the MIDI live in the preview surface, which shares this geometry (pad = 8).
  // Sounding pitches arrive as Harmoniser.__sounding, the played keys as
  // Harmoniser.__played.
  import {
    harmoniserConfig, harmoniserMode, harmoniserKey, harmoniserScaleName,
    harmoniserUseFlats, harmoniserRange, harmoniserKeys, chordLabel,
    HARMONY_MODE_LABELS, memoryShape, harmoniserSize, harmoniserVoicing,
    VOICING_LABELS,
  } from '../utils/harmoniserLayout.js';
  import { NOTE_SHARP, NOTE_FLAT, SCALE_LABELS, noteName } from '../utils/chordPadLayout.js';

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

  let cfg = $derived(harmoniserConfig(control));
  let showHeader = $derived(cfg.showHeader !== false);
  let headerH = $derived(showHeader ? 22 : 0);

  // The two live sets. Played keys are drawn differently from the ones the
  // harmoniser added — otherwise you can't tell what you did from what it did,
  // which is the one thing this display exists to show.
  let sounding = $derived(new Set((Array.isArray(cfg.__sounding) ? cfg.__sounding : []).map(Number)));
  let played = $derived(new Set((Array.isArray(cfg.__played) ? cfg.__played : []).map(Number)));

  let range = $derived(harmoniserRange(
    { counts: Object.fromEntries([...sounding].map((n) => [n, 1])), byNote: {} },
    control,
    Math.max(0, Math.round(Number(cfg.displayLow ?? 48) || 48)),
    Math.max(12, Math.round(Number(cfg.displaySpan ?? 24) || 24)),
  ));
  let keys = $derived(harmoniserKeys(range, width, height, PAD, headerH));

  let faceCss = $derived(css(cfg.faceColour, 'rgba(20,20,32,1)'));
  let whiteCss = $derived(css(cfg.whiteColour, 'rgba(232,232,238,1)'));
  let blackCss = $derived(css(cfg.blackColour, 'rgba(26,26,34,1)'));
  let playedCss = $derived(css(cfg.playedColour, 'rgba(242,201,76,1)'));
  let addedCss = $derived(css(cfg.addedColour, 'rgba(187,107,217,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let flats = $derived(harmoniserUseFlats(control));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  let modeLabel = $derived(harmoniserMode(control) === 'memory'
    ? `memory · ${memoryShape(control).join(' ')}`
    : `${keyNames[harmoniserKey(control)]} ${SCALE_LABELS[harmoniserScaleName(control)] ?? harmoniserScaleName(control)}`);
  // The chord name for the LOWEST played key. With two fingers down there are
  // two chords and no single name; naming the lowest is the useful lie, and the
  // count says the rest.
  let chordName = $derived.by(() => {
    const lows = [...played].sort((a, b) => a - b);
    if (!lows.length) return '—';
    const label = chordLabel(control, lows[0]);
    return lows.length > 1 ? `${label}  +${lows.length - 1}` : label;
  });
  let voiceCount = $derived(sounding.size);
  let voicingLabel = $derived(`${VOICING_LABELS[harmoniserVoicing(control)] ?? ''}${harmoniserMode(control) === 'diatonic' ? ` · ${harmoniserSize(control)}` : ''}`);
</script>

<svg class="harmoniser" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={PAD - 4} y={PAD - 4} width={Math.max(8, width - PAD * 2 + 8)} height={Math.max(8, height - PAD * 2 + 8)}
        rx="6" fill={faceCss} stroke="rgba(42,42,54,1)" />

  {#if showHeader}
    <circle cx={PAD + 3} cy={PAD + 5} r="3.5" fill={voiceCount ? addedCss : 'rgba(90,90,100,1)'} />
    <text x={PAD + 12} y={PAD + 9} font-size="10" fill={labelCss} opacity="0.95">{chordName}</text>
    <text x={width - PAD} y={PAD + 9} font-size="8.5" fill={labelCss} text-anchor="end" opacity="0.65">
      {modeLabel} · {voicingLabel}
    </text>
  {/if}

  {#each keys as k (k.note)}
    <rect x={k.x} y={k.y} width={Math.max(1, k.w - (k.black ? 0 : 1))} height={k.h}
          rx={k.black ? 1.5 : 2}
          fill={played.has(k.note) ? playedCss : sounding.has(k.note) ? addedCss : k.black ? blackCss : whiteCss}
          stroke={k.black ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)'} stroke-width="0.7" />
  {/each}

  {#if voiceCount === 0}
    <text x={width / 2} y={PAD + headerH + (height - PAD * 2 - headerH) / 2 + 3} font-size="9.5"
          fill="rgba(0,0,0,0.35)" text-anchor="middle">play one note</text>
  {/if}
</svg>

<style>
  .harmoniser { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
