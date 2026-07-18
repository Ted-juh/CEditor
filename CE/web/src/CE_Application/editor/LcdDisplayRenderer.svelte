<script module>
  // Ready-made palettes for the LCD. The inspector's palette dropdown writes
  // these colours into the Display section; the renderer just uses whatever
  // colours are stored, so palettes are a convenience, not a hard dependency.
  export const LCD_PALETTES = {
    greenStn:  { label: 'Green STN',   lit: 'FF2BE86A', unlit: '242BE86A', screen: 'FF06371C', backlight: 'FF0E5A2E' },
    blueWhite: { label: 'Blue / White', lit: 'FFEAF6FF', unlit: '2AEAF6FF', screen: 'FF0A2A5A', backlight: 'FF17408A' },
    amber:     { label: 'Amber',       lit: 'FFFFB000', unlit: '26FFB000', screen: 'FF241400', backlight: 'FF4A2A00' },
    vfdCyan:   { label: 'VFD Cyan',    lit: 'FF3FF0E0', unlit: '223FF0E0', screen: 'FF001014', backlight: 'FF00343E' },
    redLed:    { label: 'Red LED',     lit: 'FFFF3B30', unlit: '22FF3B30', screen: 'FF160000', backlight: 'FF3A0000' },
    oledWhite: { label: 'OLED White',  lit: 'FFF2F2F2', unlit: '14FFFFFF', screen: 'FF000000', backlight: '00000000' },
    blackGrey: { label: 'Black / Grey', lit: 'FF101010', unlit: '22101010', screen: 'FFB9C4A8', backlight: 'FFC9D4B8' },
  };
</script>

<script>
  import { getSegmentGlyph } from '../utils/lcdSegmentFont.js';
  import LcdGraphicCanvas from './LcdGraphicCanvas.svelte';
  import { composeLayout, findLayout, resolveActiveLayoutId } from '../utils/lcdZones.js';
  import { lcdDesignLayoutIds } from '../stores/lcdDesignLayout.js';

  let { control = null, allControls = [], width = 0, height = 0 } = $props();

  let display = $derived(control?._children?.Display ?? null);

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // AARRGGBB / RRGGBB hex → css rgba().
  function cssColour(value, fallback = 'transparent') {
    const raw = String(value ?? '').trim();
    if (/^[0-9a-f]{8}$/i.test(raw)) {
      const a = parseInt(raw.slice(0, 2), 16) / 255;
      const r = parseInt(raw.slice(2, 4), 16);
      const g = parseInt(raw.slice(4, 6), 16);
      const b = parseInt(raw.slice(6, 8), 16);
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
    return raw || fallback;
  }

  let rows = $derived(Math.max(1, Math.round(numberOr(display?.rows, 2))));
  let cols = $derived(Math.max(1, Math.round(numberOr(display?.cols, 16))));
  let padding = $derived(Math.max(0, numberOr(display?.padding, 10)));
  let lineSpacing = $derived(Math.max(0, numberOr(display?.lineSpacing, 3)));
  let charSpacing = $derived(Math.max(0, numberOr(display?.charSpacing, 1)));
  let fontScale = $derived(clamp(numberOr(display?.fontScale, 1), 0.3, 3));
  let brightness = $derived(clamp(numberOr(display?.brightness, 100), 0, 100) / 100);
  let contrast = $derived(clamp(numberOr(display?.contrast, 55), 0, 100) / 100);

  let litCss = $derived(cssColour(display?.litColour ?? 'FF2BE86A', '#2BE86A'));
  let unlitCss = $derived(cssColour(display?.unlitColour ?? '242BE86A', 'rgba(43,232,106,0.14)'));
  let screenCss = $derived(cssColour(display?.screenColour ?? 'FF06371C', '#06371C'));
  let backlightCss = $derived(cssColour(display?.backlightColour ?? 'FF0E5A2E', '#0E5A2E'));

  // The screen area inside the bezel/padding, and the per-cell geometry.
  // charSpacing is a real gap between cells (shared by character and segment
  // modes), so the cell width reserves room for it.
  let screenW = $derived(Math.max(1, numberOr(width, 0) - padding * 2));
  let screenH = $derived(Math.max(1, numberOr(height, 0) - padding * 2));
  let cellW = $derived(Math.max(1, (screenW - (cols - 1) * charSpacing) / cols));
  let cellH = $derived(Math.max(1, (screenH - (rows - 1) * lineSpacing) / rows));
  // Monospace advance is ~0.6em, so fit the glyph to whichever axis is tighter.
  let fontSize = $derived(Math.max(4, Math.min(cellH * 0.92, cellW / 0.62) * fontScale));

  // --- Motion (rAF ticker) ---
  // frameTime is milliseconds since the animation (re)started, not page load,
  // so a finite repeat count can settle deterministically.
  let frameTime = $state(0);
  let scrollDir = $derived(String(display?.scroll ?? 'off').trim().toLowerCase());
  let scrollSpeed = $derived(Math.max(0, numberOr(display?.scrollSpeed, 4)));
  let scrollMode = $derived(String(display?.scrollMode ?? 'loop').trim().toLowerCase());
  let scrollGap = $derived(Math.max(0, Math.round(numberOr(display?.scrollGap, 3))));
  let scrollRepeat = $derived(Math.max(0, Math.round(numberOr(display?.scrollRepeat, 0))));
  let scrolling = $derived((scrollDir === 'left' || scrollDir === 'right') && scrollSpeed > 0);
  let blinkEnabled = $derived(display?.blink === true);
  let cursorMode = $derived(String(display?.cursor ?? 'off').trim().toLowerCase());
  let cursorBlinkEnabled = $derived((cursorMode !== 'off' || editing) && display?.cursorBlink !== false);
  // Per-zone marquee (layout mode): animate whenever the active layout has a
  // scroll-enabled zone. Speed comes from the shared Motion "Speed" setting.
  let zoneScrollActive = $derived.by(() => {
    if (!hasLayouts || scrollSpeed <= 0) return false;
    const layout = findLayout(display.layouts, activeLayoutId);
    return (layout?.zones ?? []).some((z) => z?.scroll === true && z?.visible !== false);
  });
  let motionActive = $derived(scrolling || blinkEnabled || cursorBlinkEnabled || zoneScrollActive);

  // One full scroll cycle (in characters) for a line — 0 if it doesn't scroll.
  function linePeriod(raw) {
    if (raw.length <= cols) return 0;
    if (scrollMode === 'bounce') return Math.max(1, raw.length - cols) * 2;
    return raw.length + scrollGap;
  }

  // Longest per-line cycle — governs when the whole marquee has finished N reps.
  // Uses the composed (token-expanded / zone-composed) lines, since that is what
  // actually scrolls.
  let maxScrollPeriod = $derived.by(() => {
    if (!scrolling) return 0;
    let m = 0;
    for (const line of composedLines) m = Math.max(m, linePeriod(String(line ?? '')));
    return m;
  });

  // Any change to a motion parameter restarts the animation from the top.
  let motionSignature = $derived([
    scrollDir, scrollSpeed, scrollMode, scrollGap, scrollRepeat,
    blinkEnabled, numberOr(display?.blinkRate, 500),
    cursorMode, display?.cursorBlink !== false, zoneScrollActive,
    rows, cols, (Array.isArray(display?.lines) ? display.lines.join('') : ''),
  ].join('|'));

  $effect(() => {
    // Reference the signature so a settings change re-runs (restarts) the loop.
    void motionSignature;
    if (!motionActive) {
      frameTime = 0;
      return;
    }
    let raf = 0;
    let origin = -1;
    const loop = (t) => {
      if (origin < 0) origin = t;
      const elapsedMs = t - origin;
      frameTime = elapsedMs;

      const elapsedChars = scrolling ? (elapsedMs / 1000) * scrollSpeed : 0;
      // scrollRepeat 0 = infinite; otherwise finish after N of the longest cycle.
      // A zero period means no line is long enough to scroll, so it's already done.
      const finiteDone = scrollRepeat > 0
        && (maxScrollPeriod === 0 || elapsedChars >= scrollRepeat * maxScrollPeriod);
      const scrollNeedsMore = scrolling && !finiteDone;
      const needMore = blinkEnabled || cursorBlinkEnabled || scrollNeedsMore || zoneScrollActive;
      if (needMore) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  // Lit text is hidden on the "off" half of a blink cycle (ghost cells remain).
  let blinkOn = $derived.by(() => {
    if (!blinkEnabled) return true;
    const rate = Math.max(60, numberOr(display?.blinkRate, 500));
    return Math.floor(frameTime / rate) % 2 === 0;
  });

  let cursorVisible = $derived.by(() => {
    if (effectiveCursorMode === 'off') return false;
    if (!editing && display?.cursorBlink === false) return true;
    return Math.floor(frameTime / 530) % 2 === 0;
  });
  // Live text-edit caret: the preview injects display.__edit = { active, caret }
  // when the screen's editable field is focused. It overrides the cursor to sit
  // at the edit zone's (colStart + caret), so the block/underline marks the
  // insertion point. Falls back to the static cursor otherwise.
  let editState = $derived(display?.__edit ?? null);
  let editZone = $derived.by(() => {
    if (!hasLayouts) return null;
    const layout = findLayout(display.layouts, activeLayoutId);
    const zones = (layout?.zones ?? []).filter((z) => String(z?.show ?? '') === 'edit');
    return zones[0] ?? null;
  });
  let editing = $derived(editState?.active === true && editZone != null);
  let editCaretCol = $derived.by(() => {
    if (!editing) return 0;
    const c0 = Math.max(0, Math.round(numberOr(editZone?.colStart, 1)) - 1);
    const c1 = Math.max(c0, Math.round(numberOr(editZone?.colEnd, cols)) - 1);
    return clamp(c0 + Math.max(0, Math.round(numberOr(editState?.caret, 0))), c0, c1);
  });
  let editCaretRow = $derived(editing ? Math.max(0, Math.round(numberOr(editZone?.row, 1)) - 1) : 0);
  // When editing, force a visible caret at the edit position; else use the
  // configured cursor.
  let effectiveCursorMode = $derived(editing ? (cursorMode === 'off' ? 'block' : cursorMode) : cursorMode);
  let cursorRow = $derived(editing ? editCaretRow : Math.max(0, Math.round(numberOr(display?.cursorRow, 0))));
  let cursorCol = $derived(editing ? editCaretCol : Math.max(0, Math.round(numberOr(display?.cursorCol, 0))));

  // Visible characters for one row, applying marquee scroll when the source
  // line is longer than the column count.
  function visibleChars(raw, elapsedChars) {
    if (!scrolling || raw.length <= cols) {
      const chars = [];
      for (let c = 0; c < cols; c += 1) chars.push(raw[c] ?? ' ');
      return chars;
    }

    // With a finite repeat, cap this line's progress at N whole cycles, which
    // lands the window back at the start (the settled resting position).
    const cyclePeriod = linePeriod(raw);
    if (scrollRepeat > 0 && cyclePeriod > 0) {
      elapsedChars = Math.min(elapsedChars, scrollRepeat * cyclePeriod);
    }

    const chars = [];
    if (scrollMode === 'bounce') {
      const span = Math.max(1, raw.length - cols);
      const period = span * 2;
      const pos = elapsedChars % period;
      let start = pos <= span ? pos : period - pos;   // ping-pong
      if (scrollDir === 'right') start = span - start;
      start = Math.round(clamp(start, 0, span));
      for (let c = 0; c < cols; c += 1) chars.push(raw[start + c] ?? ' ');
      return chars;
    }

    // loop: repeat the line with a blank gap and slide a window across it.
    const track = raw + ' '.repeat(scrollGap);
    const period = track.length;
    let base = elapsedChars % period;
    if (scrollDir === 'right') base = period - base;
    base = Math.floor(base);
    for (let c = 0; c < cols; c += 1) {
      const idx = (((base + c) % period) + period) % period;
      chars.push(track[idx] ?? ' ');
    }
    return chars;
  }

  // --- Value-driven tokens (multi-field) ---
  // Field 1 = the primary value/valueMin/... above; fields[] hold extra sources
  // addressed as {v2}/{p2}/{b2}, {v3}/... Tokens: {value}/{vN}, {pct}/{pN},
  // {bar}/{bN} with optional :W width.
  function fieldSpec(index) {
    if (index <= 1) {
      return {
        value: numberOr(display?.value, 0),
        min: numberOr(display?.valueMin, 0),
        max: numberOr(display?.valueMax, 100),
        precision: Math.max(0, Math.round(numberOr(display?.valuePrecision, 0))),
        prefix: String(display?.valuePrefix ?? ''),
        suffix: String(display?.valueSuffix ?? ''),
      };
    }
    const f = (Array.isArray(display?.fields) ? display.fields : [])[index - 2];
    if (!f) return null;
    return {
      value: numberOr(f.value, 0),
      min: numberOr(f.min, 0),
      max: numberOr(f.max, 100),
      precision: Math.max(0, Math.round(numberOr(f.precision, 0))),
      prefix: String(f.prefix ?? ''),
      suffix: String(f.suffix ?? ''),
    };
  }

  function fieldFrac(spec) {
    const span = spec.max - spec.min;
    return span === 0 ? 0 : clamp((spec.value - spec.min) / span, 0, 1);
  }

  function fieldFormat(spec) {
    return `${spec.prefix}${spec.value.toFixed(spec.precision)}${spec.suffix}`;
  }

  // A block-character bargraph N cells wide, filled to a fraction (eighth-block
  // partials on the leading edge for a smooth level meter).
  const BAR_EIGHTHS = ' ▏▎▍▌▋▊▉';
  function barString(frac, n) {
    const width = Math.max(1, Math.round(n));
    const eighths = Math.round(clamp(frac, 0, 1) * width * 8);
    const full = Math.min(width, Math.floor(eighths / 8));
    let s = '█'.repeat(full);
    if (full < width) s += BAR_EIGHTHS[eighths % 8] + ' '.repeat(Math.max(0, width - full - 1));
    return s.slice(0, width);
  }

  function expandTokens(line) {
    if (!line.includes('{')) return line;
    return line
      .replace(/\{(?:value|v(\d+))\}/gi, (_m, n) => {
        const spec = fieldSpec(n ? Number(n) : 1);
        return spec ? fieldFormat(spec) : '';
      })
      .replace(/\{(?:pct|p(\d+))\}/gi, (_m, n) => {
        const spec = fieldSpec(n ? Number(n) : 1);
        return spec ? String(Math.round(fieldFrac(spec) * 100)) : '';
      })
      .replace(/\{(?:bar|b(\d+))(?::(\d+))?\}/gi, (_m, n, w) => {
        const spec = fieldSpec(n ? Number(n) : 1);
        return spec ? barString(fieldFrac(spec), w ? Number(w) : 10) : '';
      });
  }

  // --- Zones / layouts ---
  let hasLayouts = $derived(Array.isArray(display?.layouts) && display.layouts.length > 0);

  // The active layout id: injected by the preview (selector/overlay resolved with
  // timing), else statically resolved (design mode -> default layout).
  let activeLayoutId = $derived.by(() => {
    if (!hasLayouts) return '';
    const injected = display?.__page?.activeLayoutId;
    if (injected) return String(injected);
    // Design mode: the inspector's transient Edit/Preview Layout selection (an
    // in-memory store, never persisted to panel data), else the Pages default.
    const design = String($lcdDesignLayoutIds[String(control?._children?.Core?.id ?? '')] ?? '');
    if (design && findLayout(display.layouts, design)) return design;
    return resolveActiveLayoutId(display?.pages ?? {}, display.layouts, {});
  });

  // Info about a source control: live values injected by the preview (__live),
  // falling back to the control's static defaults from allControls (design mode).
  function controlInfo(sourceId) {
    const id = String(sourceId ?? '');
    if (!id) return null;
    // The display's own editable text buffer (preset-name field).
    if (id === '@edit') {
      return { present: true, name: '', value: 0, min: 0, max: 0, text: String(display?.editText ?? ''), on: false };
    }
    const live = display?.__live?.[id];
    const ctrl = (Array.isArray(allControls) ? allControls : [])
      .find((c) => String(c?._children?.Core?.id ?? '') === id);
    if (!live && !ctrl) return null;
    const behavior = ctrl?._children?.Behavior ?? null;
    const min = live?.min ?? numberOr(behavior?.min, 0);
    const max = live?.max ?? numberOr(behavior?.max, 127);
    const fallbackValue = numberOr(behavior?.defaultValue ?? behavior?.defaultStartValue, min);
    return {
      present: true,
      name: String(live?.name ?? ctrl?._children?.Core?.name ?? id),
      value: numberOr(live?.value, fallbackValue),
      min,
      max,
      // Fall back to a Label's static content so an edit zone shows it in design mode.
      text: String(live?.text ?? ctrl?._children?.Text?.content ?? ''),
      on: live?.on === true,
      address: live?.address,
    };
  }

  // Pre-scroll source strings: composed from the active layout's zones when the
  // display uses layouts, else the token-expanded lines.
  let composedLines = $derived.by(() => {
    if (hasLayouts) {
      const layout = findLayout(display.layouts, activeLayoutId);
      const zoneElapsed = zoneScrollActive ? (frameTime / 1000) * scrollSpeed : 0;
      return composeLayout(layout?.zones ?? [], rows, cols, controlInfo, zoneElapsed);
    }
    const source = Array.isArray(display?.lines) ? display.lines : [];
    const out = [];
    for (let r = 0; r < rows; r += 1) out.push(expandTokens(String(source[r] ?? '')));
    return out;
  });

  // Apply scroll/pad to get the visible per-row cell arrays.
  let gridLines = $derived.by(() => {
    const elapsedChars = scrolling ? (frameTime / 1000) * scrollSpeed : 0;
    return composedLines.map((line) => visibleChars(String(line ?? ''), elapsedChars));
  });

  // Panel type: character cells, segment glyphs, or a true free-pixel graphic
  // canvas (dot-matrix with a bitmap/dithered image).
  let panelType = $derived(String(display?.panelType ?? 'character').trim().toLowerCase());
  let isSegment = $derived(panelType === 'segment');
  let isGraphic = $derived(panelType === 'graphic');
  let segmentType = $derived(String(display?.segmentType ?? '16'));

  // Dot-matrix look (character mode): punch the lit/ghost layers into a repeating
  // dot grid via a CSS mask. Not used in segment or graphic mode.
  let dotMatrix = $derived(!isSegment && !isGraphic && (display?.dotMatrix === true || panelType === 'dotmatrix'));
  let dotShape = $derived(String(display?.dotShape ?? 'round').trim().toLowerCase());
  let dotPitchPx = $derived.by(() => {
    const p = numberOr(display?.dotPitch, 0);
    return p > 0 ? p : Math.max(2, cellW / 5);
  });
  let screenMaskStyle = $derived.by(() => {
    if (!dotMatrix) return '';
    const size = Math.max(2, dotPitchPx);
    // Round dots use a soft radial; "square" uses a harder edge for a blockier cell.
    const mask = dotShape === 'square'
      ? 'radial-gradient(circle, #000 0 60%, transparent 61%)'
      : 'radial-gradient(circle, #000 0 38%, transparent 46%)';
    return [
      `-webkit-mask-image:${mask}`,
      `mask-image:${mask}`,
      `-webkit-mask-size:${size}px ${size}px`,
      `mask-size:${size}px ${size}px`,
      '-webkit-mask-repeat:repeat',
      'mask-repeat:repeat',
    ].join('; ');
  });

  let backlightOn = $derived(display?.backlightOn !== false);
  let showGhost = $derived(display?.showGhost !== false);
  let showScanlines = $derived(display?.showScanlines === true);
  let showGrid = $derived(display?.showGrid === true);
  let showGlass = $derived(display?.showGlass !== false);
  let glassTintCss = $derived(cssColour(display?.glassTint ?? '14FFFFFF', 'rgba(255,255,255,0.08)'));

  // Inset the screen by the padding so the Background bezel frames it.
  let surfaceStyle = $derived(`inset:${padding}px; background:${screenCss}; border-radius:5px;`);
  // Edge-lit backlight wash: brighter toward the centre (original subtle look).
  let backlightStyle = $derived(
    `background: radial-gradient(120% 140% at 50% 42%, ${backlightCss}, transparent 78%); opacity:${(0.35 + contrast * 0.5).toFixed(3)};`
  );
  let cellStyle = $derived(
    `width:${cellW}px; height:${cellH}px; font-size:${fontSize}px; letter-spacing:0;`
  );
  let lineStyle = $derived(`height:${cellH}px; margin-bottom:${lineSpacing}px; gap:${charSpacing}px;`);
  let charStyle = $derived(
    `color:${litCss}; opacity:${(0.35 + brightness * 0.65).toFixed(3)}; text-shadow:0 0 ${Math.max(1, fontSize * 0.14).toFixed(1)}px ${litCss};`
  );
  // Under a block cursor the glyph inverts to the screen colour.
  let charInvertStyle = $derived(`color:${screenCss}; opacity:1; z-index:2; text-shadow:none;`);
  // Font Scale sizes the segment glyph within its cell (default 1 = fills it).
  let segPct = $derived((clamp(fontScale, 0.3, 3) * 100).toFixed(1));
  let segStyle = $derived(
    `width:${segPct}%; height:${segPct}%; opacity:${(0.4 + brightness * 0.6).toFixed(3)}; filter: drop-shadow(0 0 ${Math.max(0.5, cellH * 0.02).toFixed(1)}px ${litCss});`
  );
  // Unlit segments dim with the contrast ("trim pot") control.
  let segUnlitOpacity = $derived(Math.max(0.04, contrast).toFixed(2));
  let ghostStyle = $derived(`color:${unlitCss}; opacity:${(contrast * 0.9).toFixed(3)};`);
  let scanlineStyle = $derived(
    `background: repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent ${Math.max(2, Math.round(cellH / 6))}px);`
  );
  let gridStyle = $derived(
    `background-image: linear-gradient(to right, rgba(0,0,0,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.18) 1px, transparent 1px); background-size:${cellW}px ${cellH + lineSpacing}px;`
  );
</script>

{#if display}
  <div class="lcd-surface" style={surfaceStyle}>
    {#if backlightOn}
      <div class="lcd-layer" style={backlightStyle}></div>
    {/if}

    {#if isGraphic}
      <LcdGraphicCanvas
        lines={gridLines}
        {cols}
        {rows}
        {litCss}
        {unlitCss}
        {brightness}
        {contrast}
        {showGhost}
        {blinkOn}
        dotShape={dotShape}
        imageSrc={display?.imageSrc ?? ''}
        dither={display?.imageDither !== false}
        pixelWidth={numberOr(display?.pixelWidth, 0)}
        pixelHeight={numberOr(display?.pixelHeight, 0)}
        fontScale={fontScale}
        width={screenW}
        height={screenH}
      />
    {:else}
    <div class="lcd-screen" style={screenMaskStyle}>
      {#each gridLines as line, r (r)}
        <div class="lcd-line" style={lineStyle}>
          {#each line as ch, c (c)}
            {@const isCursor = cursorVisible && r === cursorRow && c === cursorCol}
            <span class="lcd-cell" style={cellStyle}>
              {#if isSegment}
                {@const glyph = getSegmentGlyph(segmentType, ch)}
                <svg class="lcd-seg" viewBox="0 0 100 180" preserveAspectRatio="xMidYMid meet" style={segStyle} aria-hidden="true">
                  {#each Object.entries(glyph.geometry) as [seg, shape] (seg)}
                    {@const on = glyph.lit.has(seg) && blinkOn}
                    {#if on || showGhost}
                      {#if shape.kind === 'poly'}
                        <polygon points={shape.points} fill={on ? litCss : unlitCss} opacity={on ? 1 : segUnlitOpacity} />
                      {:else if shape.kind === 'line'}
                        <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={on ? litCss : unlitCss} stroke-width={shape.width} stroke-linecap="round" opacity={on ? 1 : segUnlitOpacity} />
                      {:else if shape.kind === 'dot'}
                        <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={on ? litCss : unlitCss} opacity={on ? 1 : segUnlitOpacity} />
                      {/if}
                    {/if}
                  {/each}
                </svg>
                {#if isCursor && effectiveCursorMode === 'block'}
                  <span class="lcd-cursor-block" style={`background:${litCss}; opacity:0.32; mix-blend-mode:screen;`}></span>
                {/if}
              {:else}
                {#if showGhost}
                  <span class="lcd-ghost" style={ghostStyle}>█</span>
                {/if}
                {#if isCursor && effectiveCursorMode === 'block'}
                  <span class="lcd-cursor-block" style={`background:${litCss};`}></span>
                {/if}
                {#if blinkOn}
                  <span class="lcd-char" style={isCursor && effectiveCursorMode === 'block' ? charInvertStyle : charStyle}>{ch}</span>
                {/if}
              {/if}
              {#if isCursor && effectiveCursorMode === 'underline'}
                <span class="lcd-cursor-underline" style={`background:${litCss};`}></span>
              {/if}
            </span>
          {/each}
        </div>
      {/each}
    </div>
    {/if}

    {#if showGrid}
      <div class="lcd-layer" style={gridStyle}></div>
    {/if}
    {#if showScanlines}
      <div class="lcd-layer" style={scanlineStyle}></div>
    {/if}
    {#if showGlass}
      <div class="lcd-layer lcd-glass" style={`background:linear-gradient(155deg, ${glassTintCss}, transparent 55%);`}></div>
    {/if}
  </div>
{/if}

<style>
  .lcd-surface {
    position: absolute;
    inset: 0;
    overflow: hidden;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    pointer-events: none;
  }

  .lcd-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .lcd-glass {
    mix-blend-mode: screen;
  }

  .lcd-screen {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .lcd-line {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
  }

  .lcd-cell {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'Consolas', 'DejaVu Sans Mono', 'Menlo', monospace;
    font-weight: 600;
    line-height: 1;
    white-space: pre;
  }

  .lcd-ghost,
  .lcd-char {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .lcd-ghost {
    z-index: 0;
  }

  .lcd-char {
    z-index: 1;
  }

  .lcd-cursor-block {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: 1px;
  }

  .lcd-cursor-underline {
    position: absolute;
    left: 6%;
    right: 6%;
    bottom: 4%;
    height: 12%;
    z-index: 3;
    border-radius: 1px;
  }

  .lcd-seg {
    display: block;
  }
</style>
