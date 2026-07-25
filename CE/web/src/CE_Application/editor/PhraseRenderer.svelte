<script>
  // Phrase Sequencer — a step grid. Columns are steps, rows are scale degrees
  // (low at the bottom), the playing column is lit, and a tied cell joins the
  // one before it with a bar rather than sitting apart. Visual only; the clock
  // and the note output live in the preview surface, which shares phraseLayout
  // geometry (pad = 8). The live step arrives as Phrase.__step.
  import {
    phraseConfig, phraseSteps, phraseRows, phrasePattern, phraseMode,
    phraseGeometry, cellRect, rowLabel, rowLabelY, cellAt, isCellOn,
    phraseDirection, phraseSynced, phraseDivisionLabel, phraseRate, phraseSwing,
    stepAtIndex, rowToNote, noteLabel, phraseUseFlats,
    PHRASE_DIRECTION_LABELS,
  } from '../utils/phraseLayout.js';

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

  let cfg = $derived(phraseConfig(control));
  let steps = $derived(phraseSteps(control));
  let rows = $derived(phraseRows(control));
  let pattern = $derived(phrasePattern(control));
  let showHeader = $derived(cfg.showHeader !== false);
  let showGutter = $derived(cfg.showGutter !== false);
  let headerH = $derived(showHeader ? 20 : 0);
  let gutterW = $derived(showGutter ? 26 : 0);
  let geom = $derived(phraseGeometry(width, height, steps, rows, PAD, headerH, gutterW));

  let faceCss = $derived(css(cfg.faceColour, 'rgba(20,20,32,1)'));
  let cellCss = $derived(css(cfg.cellColour, 'rgba(32,32,44,1)'));
  let noteCss = $derived(css(cfg.noteColour, 'rgba(57,217,138,1)'));
  let playCss = $derived(css(cfg.playColour, 'rgba(242,201,76,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let running = $derived(cfg.running !== false);
  let playStep = $derived(cfg.__step === undefined ? -1 : Math.round(n(cfg.__step, -1)));
  // The bar line every N steps, so 16 steps read as four beats rather than as
  // sixteen identical boxes.
  let accentEvery = $derived(Math.max(1, Math.round(n(cfg.accentEvery, 4))));

  let cells = $derived.by(() => {
    const out = [];
    for (let step = 0; step < steps; step += 1) {
      for (let row = 0; row < rows; row += 1) {
        const cell = cellAt(pattern, step, row);
        const rect = cellRect(geom, step, row);
        // A tie is drawn as a join to the cell before it: the note is held, so
        // it should look held rather than like two separate notes.
        const prevOn = step > 0 && isCellOn(pattern, step - 1, row);
        out.push({
          key: `${step}:${row}`, step, row, rect,
          on: cell !== null,
          tie: cell?.tie === true && prevOn,
          accent: step % accentEvery === 0,
          loud: cell?.velocity != null && cell.velocity > 100,
          quiet: cell?.velocity != null && cell.velocity < 60,
        });
      }
    }
    return out;
  });

  let rowLabels = $derived.by(() => {
    if (!showGutter) return [];
    const out = [];
    // Only label what there is room for — a 24-row grid in 120px is unreadable
    // if every row gets text.
    const stride = geom.cellH < 9 ? Math.ceil(9 / Math.max(1, geom.cellH)) : 1;
    for (let row = 0; row < rows; row += stride) {
      out.push({ row, label: rowLabel(control, row), y: rowLabelY(geom, row) });
    }
    return out;
  });

  let rateLabel = $derived(`${phraseSynced(control)
    ? `⧗ ${phraseDivisionLabel(control)}`
    : `${phraseRate(control).toFixed(phraseRate(control) < 10 ? 1 : 0)}/s`}${
    phraseSwing(control) > 0 ? ` · sw ${Math.round(phraseSwing(control) * 100)}%` : ''}`);
  let dirLabel = $derived(phraseDirection(control) === 'forward'
    ? '' : ` · ${PHRASE_DIRECTION_LABELS[phraseDirection(control)]}`);
  let keyLabel = $derived(phraseMode(control) === 'chromatic'
    ? 'chromatic'
    : `${noteLabel(rowToNote(control, 0), phraseUseFlats(control)).replace(/-?\d+$/, '')} ${String(cfg.scale ?? 'minor')}`);
</script>

<svg class="phrase" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={PAD - 4} y={PAD - 4} width={Math.max(8, width - PAD * 2 + 8)} height={Math.max(8, height - PAD * 2 + 8)}
        rx="6" fill={faceCss} stroke="rgba(42,42,54,1)" />

  {#if showHeader}
    <circle cx={PAD + 3} cy={PAD + 5} r="3.5" fill={running ? noteCss : 'rgba(90,90,100,1)'} />
    <text x={PAD + 12} y={PAD + 9} font-size="9.5" fill={labelCss} opacity="0.85">
      {keyLabel} · {steps} steps{dirLabel}
    </text>
    <text x={width - PAD} y={PAD + 9} font-size="9" fill={labelCss} text-anchor="end" opacity="0.7">{rateLabel}</text>
  {/if}

  <!-- the playing column, drawn under the cells so the notes stay readable -->
  {#if playStep >= 0 && playStep < steps}
    {@const r = cellRect(geom, playStep, rows - 1)}
    <rect x={r.x - 1} y={geom.y0 - 1} width={r.w + 2} height={geom.h + 2} rx="3"
          fill={playCss} opacity="0.16" />
  {/if}

  <!-- cells -->
  {#each cells as c (c.key)}
    <rect x={c.rect.x} y={c.rect.y} width={c.rect.w} height={c.rect.h} rx="2"
          fill={c.on ? noteCss : cellCss}
          opacity={c.on ? (c.quiet ? 0.55 : 1) : (c.accent ? 0.9 : 0.6)}
          stroke={c.accent && !c.on ? 'rgba(255,255,255,0.09)' : 'none'} />
    {#if c.on && c.loud}
      <rect x={c.rect.x} y={c.rect.y} width={c.rect.w} height={Math.max(1.5, c.rect.h * 0.22)} rx="1"
            fill="rgba(255,255,255,0.55)" />
    {/if}
    {#if c.tie}
      <!-- the join into the previous step: a held note should look held -->
      <rect x={c.rect.x - geom.gap - 1} y={c.rect.y + c.rect.h * 0.35}
            width={geom.gap + 2} height={Math.max(1.5, c.rect.h * 0.3)} fill={noteCss} />
    {/if}
  {/each}

  <!-- row gutter -->
  {#each rowLabels as r (r.row)}
    <text x={geom.gutterX + geom.gutterW - 4} y={r.y} font-size="8" fill={labelCss}
          text-anchor="end" opacity="0.6">{r.label}</text>
  {/each}
</svg>

<style>
  .phrase { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
