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
  let { control = null, width = 0, height = 0 } = $props();

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
  let screenW = $derived(Math.max(1, numberOr(width, 0) - padding * 2));
  let screenH = $derived(Math.max(1, numberOr(height, 0) - padding * 2));
  let cellW = $derived(screenW / cols);
  let cellH = $derived(Math.max(1, (screenH - (rows - 1) * lineSpacing) / rows));
  // Monospace advance is ~0.6em, so fit the glyph to whichever axis is tighter.
  let fontSize = $derived(Math.max(4, Math.min(cellH * 0.92, (cellW - charSpacing) / 0.62) * fontScale));

  // Pad/truncate each source line to exactly `cols` cells so the grid is stable.
  let gridLines = $derived.by(() => {
    const source = Array.isArray(display?.lines) ? display.lines : [];
    const out = [];
    for (let r = 0; r < rows; r += 1) {
      const raw = String(source[r] ?? '');
      const chars = [];
      for (let c = 0; c < cols; c += 1) chars.push(raw[c] ?? ' ');
      out.push(chars);
    }
    return out;
  });

  let backlightOn = $derived(display?.backlightOn !== false);
  let showGhost = $derived(display?.showGhost !== false);
  let showScanlines = $derived(display?.showScanlines === true);
  let showGrid = $derived(display?.showGrid === true);
  let glassTintCss = $derived(cssColour(display?.glassTint ?? '14FFFFFF', 'rgba(255,255,255,0.08)'));

  // Inset the screen by the padding so the Background bezel frames it.
  let surfaceStyle = $derived(`inset:${padding}px; background:${screenCss}; border-radius:5px;`);
  // Edge-lit backlight wash: brighter toward the centre.
  let backlightStyle = $derived(
    `background: radial-gradient(120% 140% at 50% 42%, ${backlightCss}, transparent 78%); opacity:${(0.35 + contrast * 0.5).toFixed(3)};`
  );
  let cellStyle = $derived(
    `width:${cellW}px; height:${cellH}px; font-size:${fontSize}px; letter-spacing:0;`
  );
  let lineStyle = $derived(`height:${cellH}px; margin-bottom:${lineSpacing}px;`);
  let charStyle = $derived(
    `color:${litCss}; opacity:${(0.35 + brightness * 0.65).toFixed(3)}; text-shadow:0 0 ${Math.max(1, fontSize * 0.14).toFixed(1)}px ${litCss};`
  );
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

    <div class="lcd-screen">
      {#each gridLines as line, r (r)}
        <div class="lcd-line" style={lineStyle}>
          {#each line as ch, c (c)}
            <span class="lcd-cell" style={cellStyle}>
              {#if showGhost}
                <span class="lcd-ghost" style={ghostStyle}>█</span>
              {/if}
              <span class="lcd-char" style={charStyle}>{ch}</span>
            </span>
          {/each}
        </div>
      {/each}
    </div>

    {#if showGrid}
      <div class="lcd-layer" style={gridStyle}></div>
    {/if}
    {#if showScanlines}
      <div class="lcd-layer" style={scanlineStyle}></div>
    {/if}
    <div class="lcd-layer lcd-glass" style={`background:linear-gradient(155deg, ${glassTintCss}, transparent 55%);`}></div>
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
</style>
