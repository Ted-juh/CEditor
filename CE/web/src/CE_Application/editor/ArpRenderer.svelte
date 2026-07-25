<script>
  // Arpeggiator — a lane of step cells (one per note in the walk), the playhead
  // lit, rests dimmed, note names in the cells, and a header strip with the
  // source / pattern / rate. Visual only; the clock and the note output live in
  // the preview surface, which shares arpLayout geometry (pad = 8). Live phase
  // arrives via Arp.__phase and the linked Chord Pad's held notes via
  // Arp.__sourceNotes.
  import {
    arpConfig, arpPattern, arpPhase, arpRate, arpBaseNotes, arpSequence,
    stepFires, stepIndexAt, arpUseFlats, midiNoteLabel,
    arpGeometry, arpCell, ARP_PATTERN_LABELS,
  } from '../utils/arpLayout.js';

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

  let cfg = $derived(arpConfig(control));
  let flats = $derived(arpUseFlats(control));
  let seq = $derived(arpSequence(control, arpBaseNotes(control)));
  let head = $derived(seq.length ? stepIndexAt(arpPhase(control), seq.length) : -1);

  let fieldCss = $derived(css(cfg.fieldColour, 'rgba(16,16,23,1)'));
  let stepCss = $derived(css(cfg.stepColour, 'rgba(91,155,213,1)'));
  let headCss = $derived(css(cfg.headColour, 'rgba(242,201,76,1)'));
  let restCss = $derived(css(cfg.restColour, 'rgba(42,42,52,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let showHeader = $derived(cfg.showHeader !== false);
  let headerH = $derived(showHeader ? 22 : 0);
  let geom = $derived(arpGeometry(width, height, Math.max(1, seq.length), PAD, headerH));

  let mutes = $derived(new Set((Array.isArray(cfg.mutes) ? cfg.mutes : []).map((m) => Math.round(n(m, 0)))));
  let cells = $derived.by(() => seq.map((notes, i) => ({
    i,
    notes,
    fires: stepFires(control, i),
    muted: mutes.has(i),
    isHead: i === head,
    c: arpCell(geom, i),
    label: notes.length === 1 ? midiNoteLabel(notes[0], flats) : `${notes.length}♪`,
  })));

  // Header: where the notes come from, how they walk, how fast.
  let sourceLabel = $derived(String(cfg.source ?? 'chord') === 'link'
    ? (Array.isArray(cfg.__sourceNotes) && cfg.__sourceNotes.length ? 'Linked' : 'Linked · idle')
    : 'Chord');
  let rateLabel = $derived(`${arpRate(control).toFixed(arpRate(control) < 10 ? 1 : 0)}/s`);
  let running = $derived(cfg.running !== false);
</script>

<svg class="arp" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  {#if showHeader}
    <rect x={PAD} y={PAD - 4} width={Math.max(10, width - PAD * 2)} height={headerH - 4} rx="6" fill="rgba(20,20,32,1)" stroke="rgba(42,42,54,1)" />
    <circle cx={PAD + 11} cy={PAD + 5} r="3.5" fill={running ? headCss : 'rgba(90,90,100,1)'} />
    <text x={PAD + 20} y={PAD + 9} font-size="10" fill="rgba(232,232,238,1)" style="font-weight:600">
      {ARP_PATTERN_LABELS[arpPattern(control)] ?? arpPattern(control)}
    </text>
    <text x={width / 2} y={PAD + 9} font-size="9" fill={labelCss} text-anchor="middle" opacity="0.8">{sourceLabel}</text>
    <text x={width - PAD - 8} y={PAD + 9} font-size="9" fill={labelCss} text-anchor="end" opacity="0.8">
      {rateLabel}{cfg.swing > 0 ? ` · sw ${Math.round(n(cfg.swing, 0) * 100)}%` : ''}
    </text>
  {/if}

  <rect x={geom.x0 - 2} y={geom.y0 - 2} width={geom.w + 4} height={geom.h + 4} rx="5" fill={fieldCss} stroke="rgba(0,0,0,0.5)" stroke-width="1" />

  {#if !seq.length}
    <text x={width / 2} y={geom.y0 + geom.h / 2 + 4} font-size="10" fill={labelCss} text-anchor="middle" opacity="0.55">
      {String(cfg.source ?? 'chord') === 'link' ? 'hold a pad on the linked Chord Pad' : 'no notes'}
    </text>
  {/if}

  {#each cells as s (s.i)}
    <!-- cell well -->
    <rect x={s.c.x} y={s.c.y} width={s.c.w} height={s.c.h} rx="4"
          fill={s.fires ? 'rgba(255,255,255,0.05)' : restCss}
          stroke={s.isHead ? headCss : 'rgba(255,255,255,0.06)'} stroke-width={s.isHead ? 2 : 1}
          opacity={s.fires ? 1 : 0.75} />
    <!-- the note block: taller for higher notes, so the shape of the walk reads -->
    {#if s.fires}
      {@const lo = 36}
      {@const hi = 96}
      {@const pitch = Math.max(0, Math.min(1, (s.notes[s.notes.length - 1] - lo) / (hi - lo)))}
      {@const bh = Math.max(4, (s.c.h - 18) * (0.25 + 0.75 * pitch))}
      <rect x={s.c.x + 3} y={s.c.y + s.c.h - 14 - bh} width={Math.max(2, s.c.w - 6)} height={bh} rx="2.5"
            fill={s.isHead ? headCss : stepCss} opacity={s.isHead ? 1 : 0.7} />
    {/if}
    {#if cfg.showNotes !== false && s.c.w >= 22 && s.c.h >= 26}
      <text x={s.c.x + s.c.w / 2} y={s.c.y + s.c.h - 4} font-size={Math.min(9, Math.max(7, s.c.w * 0.32))}
            fill={s.fires ? (s.isHead ? headCss : labelCss) : 'rgba(110,110,120,1)'} text-anchor="middle">{s.label}</text>
    {/if}
    <!-- A hand-mute gets a strike; a Euclidean rest just stays dark, so the two
         kinds of silence read differently. -->
    {#if s.muted}
      <line x1={s.c.x + 4} y1={s.c.y + s.c.h / 2} x2={s.c.x + s.c.w - 4} y2={s.c.y + s.c.h / 2}
            stroke={labelCss} stroke-width="1.5" opacity="0.6" />
    {/if}
  {/each}
</svg>

<style>
  .arp { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
