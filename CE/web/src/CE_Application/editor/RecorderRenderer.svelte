<script>
  // Phrase Recorder — a piano roll of what you played, with a playhead. The
  // roll fits itself to the take's note range; a note held across the loop seam
  // is drawn as two bars so it looks as long as it sounds. Visual only; the
  // clock, the capture and the note output live in the preview surface, which
  // shares this geometry (pad = 8). The live phase arrives as Recorder.__phase.
  import {
    recorderConfig, recorderState, recorderTake, recorderPhase, recorderPlaying,
    recorderGeometry, eventRects, playheadX, takeNoteRange, rowLabelFor,
    recorderUseFlats, recorderSynced, recorderBars, recorderSeconds,
    takeEventCount, lastPass, isRecordingState, RECORDER_STATE_LABELS,
  } from '../utils/noteRecorderLayout.js';

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

  let cfg = $derived(recorderConfig(control));
  let state = $derived(recorderState(control));
  let take = $derived(recorderTake(control));
  let phase = $derived(recorderPhase(control));
  let showHeader = $derived(cfg.showHeader !== false);
  let showGutter = $derived(cfg.showGutter !== false);
  let headerH = $derived(showHeader ? 20 : 0);
  let gutterW = $derived(showGutter ? 26 : 0);
  let geom = $derived(recorderGeometry(width - gutterW, height, PAD, headerH));
  // The roll is inset by the gutter; the gutter itself sits to the left of it.
  let rollGeom = $derived({ ...geom, x0: geom.x0 + gutterW });

  let faceCss = $derived(css(cfg.faceColour, 'rgba(20,20,32,1)'));
  let noteCss = $derived(css(cfg.noteColour, 'rgba(86,204,242,1)'));
  let recCss = $derived(css(cfg.recordColour, 'rgba(235,87,87,1)'));
  let headCss = $derived(css(cfg.playheadColour, 'rgba(242,201,76,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let range = $derived(takeNoteRange(take.events, Math.max(4, Math.round(n(cfg.minSpan, 12)))));
  let recording = $derived(isRecordingState(state));
  // The bar/beat grid behind the roll: a phrase you can't see the downbeat of
  // is a phrase you can't tell is late.
  let divisions = $derived(Math.max(1, Math.round(n(cfg.gridDivisions, recorderSynced(control) ? recorderBars(control) * 4 : 8))));

  let bars = $derived.by(() => {
    const out = [];
    // Newest pass on top: an overdub you just played should not hide behind the
    // layer underneath it.
    const top = lastPass(take);
    for (const e of take.events) {
      for (const [i, r] of eventRects(rollGeom, e, range).entries()) {
        out.push({
          key: `${e.pass}:${e.t}:${e.note}:${i}`, ...r,
          fresh: e.pass === top && top > 0,
          vel: e.velocity,
        });
      }
    }
    return out;
  });

  let rowLabels = $derived.by(() => {
    if (!showGutter) return [];
    const rows = Math.max(1, range.hi - range.lo + 1);
    const rowH = rollGeom.h / rows;
    const stride = rowH < 9 ? Math.ceil(9 / Math.max(1, rowH)) : 1;
    const flats = recorderUseFlats(control);
    const out = [];
    for (let r = 0; r < rows; r += stride) {
      out.push({ r, label: rowLabelFor(range.lo + r, flats), y: rollGeom.y0 + (rows - 1 - r) * rowH + rowH / 2 + 3 });
    }
    return out;
  });

  let lenLabel = $derived(recorderSynced(control)
    ? `⧗ ${recorderBars(control)} bar${recorderBars(control) === 1 ? '' : 's'}`
    : `${recorderSeconds(control).toFixed(1)}s`);
  let countLabel = $derived(takeEventCount(take) === 0 ? 'empty' : `${takeEventCount(take)} notes`);
</script>

<svg class="recorder" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={PAD - 4} y={PAD - 4} width={Math.max(8, width - PAD * 2 + 8)} height={Math.max(8, height - PAD * 2 + 8)}
        rx="6" fill={faceCss} stroke="rgba(42,42,54,1)" />

  {#if showHeader}
    <!-- The state dot is red only when it is actually capturing. Armed pulses
         in the preview; here it is simply a distinct, dimmer red. -->
    <circle cx={PAD + 3} cy={PAD + 5} r="3.5"
            fill={recording ? recCss : state === 'armed' ? recCss : recorderPlaying(control) ? noteCss : 'rgba(90,90,100,1)'}
            opacity={state === 'armed' ? 0.45 : 1} />
    <text x={PAD + 12} y={PAD + 9} font-size="9.5" fill={recording ? recCss : labelCss} opacity="0.9">
      {RECORDER_STATE_LABELS[state]} · {countLabel}
    </text>
    <text x={width - PAD} y={PAD + 9} font-size="9" fill={labelCss} text-anchor="end" opacity="0.7">{lenLabel}</text>
  {/if}

  <!-- the grid, behind everything -->
  {#each Array.from({ length: divisions + 1 }, (_, i) => i) as i (i)}
    {@const x = rollGeom.x0 + (i / divisions) * rollGeom.w}
    <line x1={x} y1={rollGeom.y0} x2={x} y2={rollGeom.y0 + rollGeom.h}
          stroke="rgba(255,255,255,0.07)" stroke-width={i % 4 === 0 ? 1.2 : 0.6} />
  {/each}

  {#if takeEventCount(take) === 0}
    <text x={rollGeom.x0 + rollGeom.w / 2} y={rollGeom.y0 + rollGeom.h / 2 + 3} font-size="10"
          fill={labelCss} text-anchor="middle" opacity="0.4">arm, then play</text>
  {/if}

  <!-- the notes -->
  {#each bars as b (b.key)}
    <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5"
          fill={b.fresh ? recCss : noteCss}
          opacity={0.35 + 0.65 * Math.min(1, b.vel / 110)} />
  {/each}

  <!-- the playhead, over the notes so you can see what it is on -->
  {#if recorderPlaying(control) || recording}
    {@const x = playheadX(rollGeom, phase)}
    <line x1={x} y1={rollGeom.y0 - 2} x2={x} y2={rollGeom.y0 + rollGeom.h + 2}
          stroke={recording ? recCss : headCss} stroke-width="1.5" />
  {/if}

  <!-- row gutter -->
  {#each rowLabels as r (r.r)}
    <text x={rollGeom.x0 - 4} y={r.y} font-size="8" fill={labelCss} text-anchor="end" opacity="0.55">{r.label}</text>
  {/each}
</svg>

<style>
  .recorder { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
