<script>
  // Graphic (free-pixel) dot-matrix. Renders the token/text pipeline to an
  // offscreen canvas at a pixel resolution, thresholds to 1-bit, and paints lit/
  // unlit dots. An optional image source is sampled and Floyd–Steinberg dithered
  // onto the same grid. The screen fill + backlight + glass come from the CSS
  // layers in LcdDisplayRenderer; this canvas draws only the dots (transparent).
  let {
    lines = [],
    cols = 16,
    rows = 2,
    litCss = '#2BE86A',
    unlitCss = 'rgba(43,232,106,0.2)',
    brightness = 1,
    contrast = 0.5,
    showGhost = true,
    dotShape = 'round',
    blinkOn = true,
    imageSrc = '',
    dither = true,
    pixelWidth = 0,
    pixelHeight = 0,
    width = 0,
    height = 0,
  } = $props();

  const CELL_W = 6; // per-char pixel cell: ~5px glyph + 1px gap
  const CELL_H = 8; // per-row  pixel cell: ~7px glyph + 1px gap

  let canvasEl = $state(null);
  let imageEl = $state(null);

  let pixW = $derived(pixelWidth > 0 ? Math.round(pixelWidth) : Math.max(1, cols * CELL_W));
  let pixH = $derived(pixelHeight > 0 ? Math.round(pixelHeight) : Math.max(1, rows * CELL_H));

  // Load the image source (data URL or path) when set.
  $effect(() => {
    const src = String(imageSrc ?? '');
    if (!src) { imageEl = null; return; }
    const img = new Image();
    img.onload = () => { imageEl = img; };
    img.onerror = () => { imageEl = null; };
    img.src = src;
    return () => { img.onload = null; img.onerror = null; };
  });

  // Rasterise the text into a 1-bit bitmap using the browser's monospace font.
  function textBitmap() {
    const off = document.createElement('canvas');
    off.width = pixW;
    off.height = pixH;
    const c = off.getContext('2d');
    if (!c) return null;
    c.fillStyle = '#000';
    c.fillRect(0, 0, pixW, pixH);
    c.fillStyle = '#fff';
    c.textBaseline = 'top';
    c.font = `${CELL_H - 1}px monospace`;
    for (let r = 0; r < rows; r += 1) {
      const line = lines[r] || [];
      for (let x = 0; x < cols; x += 1) {
        const ch = line[x] ?? ' ';
        if (ch !== ' ') c.fillText(ch, x * CELL_W, r * CELL_H);
      }
    }
    const data = c.getImageData(0, 0, pixW, pixH).data;
    const bmp = new Uint8Array(pixW * pixH);
    for (let i = 0; i < bmp.length; i += 1) bmp[i] = data[i * 4] > 128 ? 1 : 0;
    return bmp;
  }

  // Sample the image and threshold / dither it onto the grid.
  function imageBitmap() {
    if (!imageEl) return null;
    const off = document.createElement('canvas');
    off.width = pixW;
    off.height = pixH;
    const c = off.getContext('2d');
    if (!c) return null;
    c.drawImage(imageEl, 0, 0, pixW, pixH);
    const data = c.getImageData(0, 0, pixW, pixH).data;
    const lum = new Float32Array(pixW * pixH);
    for (let i = 0; i < lum.length; i += 1) {
      lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    const bmp = new Uint8Array(pixW * pixH);
    if (dither) {
      for (let y = 0; y < pixH; y += 1) {
        for (let x = 0; x < pixW; x += 1) {
          const i = y * pixW + x;
          const oldV = lum[i];
          const newV = oldV < 128 ? 0 : 255;
          bmp[i] = newV ? 1 : 0;
          const err = oldV - newV;
          if (x + 1 < pixW) lum[i + 1] += (err * 7) / 16;
          if (y + 1 < pixH) {
            if (x > 0) lum[i + pixW - 1] += (err * 3) / 16;
            lum[i + pixW] += (err * 5) / 16;
            if (x + 1 < pixW) lum[i + pixW + 1] += (err * 1) / 16;
          }
        }
      }
    } else {
      for (let i = 0; i < bmp.length; i += 1) bmp[i] = lum[i] < 128 ? 0 : 1;
    }
    return bmp;
  }

  function draw() {
    if (!canvasEl) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    const useImage = !!imageEl;
    const bmp = useImage ? imageBitmap() : textBitmap();
    if (!bmp) return;

    const cellW = w / pixW;
    const cellH = h / pixH;
    const rad = Math.max(0.5, Math.min(cellW, cellH) * 0.42);
    const litOpacity = 0.4 + brightness * 0.6;
    const ghostOpacity = Math.max(0.03, contrast * 0.5);

    for (let y = 0; y < pixH; y += 1) {
      for (let x = 0; x < pixW; x += 1) {
        const on = bmp[y * pixW + x] === 1 && (useImage || blinkOn);
        if (!on && !showGhost) continue;
        const cx = x * cellW + cellW / 2;
        const cy = y * cellH + cellH / 2;
        ctx.globalAlpha = on ? litOpacity : ghostOpacity;
        ctx.fillStyle = on ? litCss : unlitCss;
        if (dotShape === 'square') {
          ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  $effect(() => {
    if (!canvasEl) return;
    // Track the inputs so the canvas repaints when any of them change.
    void lines; void cols; void rows; void litCss; void unlitCss; void brightness;
    void contrast; void showGhost; void dotShape; void blinkOn; void imageEl;
    void dither; void pixW; void pixH; void width; void height;
    try {
      draw();
    } catch (err) {
      /* canvas may be unavailable mid-teardown; ignore */
    }
  });
</script>

<canvas bind:this={canvasEl} class="lcd-graphic"></canvas>

<style>
  .lcd-graphic {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }
</style>
