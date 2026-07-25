<script>
  // Chord Pad — the panel's instrument. Draws either the WHEEL (circle of fifths:
  // majors outside, relative minors inside, the in-key chords lit as one wedge) or
  // the GRID (one pad per scale degree / note), plus a piano strip showing what's
  // sounding. Visual only; the playing is driven by the preview surface, which
  // shares chordPadLayout geometry. Held pads arrive via ChordPad.__held (a list
  // of pad ids) and the sounding notes via ChordPad.__notes.
  import {
    chordPadConfig, chordPadKey, chordPadScaleName, chordPadLayout, chordPadPads,
    wheelSlots, gridGeometry, gridCell, wheelGeometry, wheelSlotCenter,
    noteName, useFlats, SCALE_LABELS, padNotes,
  } from '../utils/chordPadLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 10;
  const HEADER = 30;
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

  let cfg = $derived(chordPadConfig(control));
  let layout = $derived(chordPadLayout(control));
  let keyPc = $derived(chordPadKey(control));
  let scaleName = $derived(chordPadScaleName(control));
  let flats = $derived(useFlats(keyPc, scaleName));
  let held = $derived(new Set(Array.isArray(cfg.__held) ? cfg.__held : []));
  let sounding = $derived(Array.isArray(cfg.__notes) ? cfg.__notes : []);
  // Notes arriving on the MIDI input (note input echo). Drawn distinctly from
  // locally-played pads: an outline ring rather than a fill, so you can always
  // tell what you pressed from what the outside world is playing.
  let echoNotes = $derived(Array.isArray(cfg.__echo) ? cfg.__echo : []);
  let echoSet = $derived(new Set(echoNotes));
  let echoOn = $derived(echoNotes.length > 0);

  let padCss = $derived(css(cfg.padColour, 'rgba(23,23,32,1)'));
  let inKeyCss = $derived(css(cfg.inKeyColour, 'rgba(91,155,213,1)'));
  let tonicCss = $derived(css(cfg.tonicColour, 'rgba(242,201,76,1)'));
  let minorCss = $derived(css(cfg.minorColour, 'rgba(155,138,255,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));
  let echoCss = $derived(css(cfg.echoColour, 'rgba(57,217,138,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let pianoH = $derived(cfg.showPiano !== false ? 26 : 0);
  let keyLabel = $derived(`${noteName(keyPc, flats)} ${SCALE_LABELS[scaleName] ?? scaleName}`);

  // --- grid model ---
  let pads = $derived(layout === 'grid' ? chordPadPads(control) : []);
  let gGeom = $derived(layout === 'grid'
    ? gridGeometry(width, height, Math.max(1, pads.length), Math.max(1, Math.round(n(cfg.gridCols, 4))), PAD, HEADER, pianoH)
    : null);
  let gridCells = $derived(gGeom ? pads.map((p, i) => ({ p, i, c: gridCell(gGeom, i) })) : []);

  // --- wheel model ---
  let slots = $derived(layout === 'wheel' ? wheelSlots(control) : []);
  let wGeom = $derived(layout === 'wheel' ? wheelGeometry(width, height - pianoH, PAD, HEADER) : null);
  let wheelNodes = $derived.by(() => {
    if (!wGeom) return [];
    const out = [];
    for (const s of slots) {
      out.push({ ...wheelSlotCenter(wGeom, s.index, 'major'), r: wGeom.rMajor, ch: s.major, ring: 'major', index: s.index });
      out.push({ ...wheelSlotCenter(wGeom, s.index, 'minor'), r: wGeom.rMinor, ch: s.minor, ring: 'minor', index: s.index });
    }
    return out;
  });

  // A pad is "echoed" when every one of its notes is arriving on the input —
  // which is what makes the wheel double as a chord analyser.
  function padEchoed(pad) {
    if (!echoOn || !pad) return false;
    const notes = padNotes(control, pad);
    return notes.length > 0 && notes.every((n) => echoSet.has(n));
  }
  // Pitch classes currently sounding (for the piano strip).
  let litPcs = $derived(new Set(sounding.map((m) => ((m % 12) + 12) % 12)));
  let echoPcs = $derived(new Set(echoNotes.map((m) => ((m % 12) + 12) % 12)));
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_AFTER = [0, 1, 3, 4, 5];
  const BLACK_PC = [1, 3, 6, 8, 10];
  let pianoY = $derived(height - pianoH + 2);
  let pianoW = $derived(Math.max(10, width - PAD * 2));
  let whiteW = $derived(pianoW / 14);
  let heldLabel = $derived.by(() => {
    if (!held.size) return '';
    const all = layout === 'wheel'
      ? slots.flatMap((s) => [s.major, s.minor])
      : pads;
    const hit = all.find((p) => held.has(p.id));
    return hit ? hit.name : '';
  });
</script>

<svg class="chordpad" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <!-- header: key + scale, mode -->
  <rect x={PAD} y={PAD - 4} width={Math.max(10, width - PAD * 2)} height={HEADER - 6} rx="8" fill="rgba(20,20,32,1)" stroke="rgba(42,42,54,1)" />
  <text x={PAD + 10} y={PAD + 13} font-size="12" fill="rgba(232,232,238,1)" style="font-weight:600">{keyLabel}</text>
  <text x={width - PAD - 10} y={PAD + 13} font-size="10" fill={heldLabel ? tonicCss : (echoOn ? echoCss : tonicCss)} text-anchor="end" style="font-weight:600">
    {heldLabel || (echoOn ? `IN · ${echoNotes.length}` : (String(cfg.mode ?? 'chords') === 'notes' ? 'Notes' : 'Chords'))}
  </text>

  {#if layout === 'wheel' && wGeom}
    <!-- guide rings -->
    <circle cx={wGeom.cx} cy={wGeom.cy} r={wGeom.ringMajor} fill="none" stroke="rgba(255,255,255,0.05)" />
    <circle cx={wGeom.cx} cy={wGeom.cy} r={wGeom.ringMinor} fill="none" stroke="rgba(255,255,255,0.05)" />

    {#each wheelNodes as nd (nd.ch.id)}
      {@const isHeld = held.has(nd.ch.id)}
      {@const accent = nd.ch.isTonic ? tonicCss : (nd.ring === 'minor' ? minorCss : inKeyCss)}
      {#if isHeld}
        <circle cx={nd.x} cy={nd.y} r={nd.r + 6} fill={accent} opacity="0.25" />
      {:else if padEchoed(nd.ch)}
        <circle cx={nd.x} cy={nd.y} r={nd.r + 4} fill="none" stroke={echoCss} stroke-width="2" opacity="0.9" />
      {/if}
      <circle cx={nd.x} cy={nd.y} r={nd.r}
              fill={isHeld ? 'rgba(42,42,52,1)' : padCss}
              stroke={isHeld ? accent : (nd.ch.inKey ? accent : 'rgba(42,42,52,1)')}
              stroke-width={isHeld ? 2.5 : (nd.ch.inKey ? 1.5 : 1)}
              opacity={nd.ch.inKey ? 1 : 0.45} />
      <text x={nd.x} y={nd.y + (nd.ring === 'minor' ? 3.5 : 4.5)}
            font-size={nd.ring === 'minor' ? Math.max(7, nd.r * 0.62) : Math.max(8, nd.r * 0.66)}
            fill={isHeld ? '#fff' : (nd.ch.inKey ? 'rgba(232,232,238,1)' : 'rgba(120,120,132,1)')}
            text-anchor="middle" style="font-weight:700">{nd.ch.name}</text>
      <!-- Romans sit OUTSIDE their ring: above the outer majors, below the inner
           minors — otherwise the two rings' labels collide in the middle. -->
      {#if cfg.showRomans !== false && nd.ch.inKey}
        <text x={nd.x} y={nd.ring === 'minor' ? nd.y + nd.r + 9 : nd.y - nd.r - 4}
              font-size="8.5" fill={accent} text-anchor="middle" style="font-weight:600" opacity="0.95">{nd.ch.roman}</text>
      {/if}
    {/each}

    <!-- hub: key + IV/V hints -->
    <circle cx={wGeom.cx} cy={wGeom.cy} r={wGeom.hubR} fill="rgba(12,12,18,1)" stroke="rgba(42,42,54,1)" />
    <text x={wGeom.cx} y={wGeom.cy - 1} font-size={Math.max(9, wGeom.hubR * 0.36)} fill="rgba(232,232,238,1)" text-anchor="middle" style="font-weight:700">{noteName(keyPc, flats)}</text>
    <text x={wGeom.cx} y={wGeom.cy + wGeom.hubR * 0.42} font-size={Math.max(7, wGeom.hubR * 0.24)} fill={labelCss} text-anchor="middle" opacity="0.7">{SCALE_LABELS[scaleName] ?? scaleName}</text>
    <text x={wGeom.cx - wGeom.hubR - 4} y={wGeom.cy - wGeom.hubR * 0.5} font-size="8" fill={inKeyCss} text-anchor="end" opacity="0.75">IV</text>
    <text x={wGeom.cx + wGeom.hubR + 4} y={wGeom.cy - wGeom.hubR * 0.5} font-size="8" fill={inKeyCss} text-anchor="start" opacity="0.75">V</text>
  {/if}

  {#if layout === 'grid' && gGeom}
    {#each gridCells as g (g.p.id)}
      {@const isHeld = held.has(g.p.id)}
      {@const accent = g.p.isRoot ? tonicCss : inKeyCss}
      {#if isHeld}
        <rect x={g.c.x - 3} y={g.c.y - 3} width={g.c.w + 6} height={g.c.h + 6} rx="11" fill={accent} opacity="0.22" />
      {:else if padEchoed(g.p)}
        <rect x={g.c.x - 2} y={g.c.y - 2} width={g.c.w + 4} height={g.c.h + 4} rx="10" fill="none" stroke={echoCss} stroke-width="2" opacity="0.9" />
      {/if}
      <rect x={g.c.x} y={g.c.y} width={g.c.w} height={g.c.h} rx="8"
            fill={isHeld ? 'rgba(32,32,42,1)' : padCss}
            stroke={isHeld ? accent : 'rgba(44,44,56,1)'} stroke-width={isHeld ? 2 : 1} />
      <rect x={g.c.x + 7} y={g.c.y + 7} width={Math.max(2, g.c.w - 14)} height="3" rx="1.5" fill={accent} opacity={isHeld ? 1 : 0.65} />
      <text x={g.c.x + g.c.w / 2} y={g.c.y + g.c.h / 2 + 5}
            font-size={Math.max(11, Math.min(20, g.c.h * 0.34))}
            fill={isHeld ? '#fff' : 'rgba(232,232,238,1)'} text-anchor="middle" style="font-weight:700">{g.p.name}</text>
      <!-- Roman sits under the colour strip; the chord tones own the bottom row,
           so a wide numeral (♭VII) can't run into a wide note list. -->
      {#if cfg.showRomans !== false && g.p.roman}
        <text x={g.c.x + 8} y={g.c.y + 22} font-size="9" fill={labelCss} opacity="0.8">{g.p.roman}</text>
      {/if}
      {#if g.p.noteNames && g.p.noteNames.length > 1 && g.c.h > 46}
        <text x={g.c.x + g.c.w / 2} y={g.c.y + g.c.h - 7} font-size="8.5" fill={isHeld ? accent : 'rgba(122,122,132,1)'} text-anchor="middle">{g.p.noteNames.join('·')}</text>
      {/if}
    {/each}
  {/if}

  <!-- piano strip: what's sounding -->
  {#if cfg.showPiano !== false}
    <rect x={PAD - 1} y={pianoY - 1} width={pianoW + 2} height={pianoH - 2} rx="4" fill="rgba(8,8,12,1)" stroke="rgba(32,32,42,1)" />
    {#each Array(14) as _, i (i)}
      {@const pc = WHITE[i % 7]}
      {@const lit = litPcs.has(pc)}
      {@const ech = echoPcs.has(pc)}
      <rect x={PAD + i * whiteW + 0.5} y={pianoY} width={Math.max(1, whiteW - 1)} height={pianoH - 4} rx="2"
            fill={lit ? tonicCss : (ech ? echoCss : 'rgba(233,233,238,0.92)')} />
    {/each}
    {#each [0, 1] as oct (oct)}
      {#each BLACK_AFTER as wi, j (`${oct}_${j}`)}
        {@const lit = litPcs.has(BLACK_PC[j])}
        {@const ech = echoPcs.has(BLACK_PC[j])}
        <rect x={PAD + (oct * 7 + wi + 1) * whiteW - whiteW * 0.32} y={pianoY} width={whiteW * 0.64} height={(pianoH - 4) * 0.62} rx="1.5"
              fill={lit ? tonicCss : (ech ? echoCss : 'rgba(21,21,27,1)')} stroke="rgba(0,0,0,0.8)" stroke-width="0.5" />
      {/each}
    {/each}
  {/if}
</svg>

<style>
  .chordpad { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
