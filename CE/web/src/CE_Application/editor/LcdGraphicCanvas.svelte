<script>
  // Graphic (free-pixel) dot-matrix. Composes a 1-bit bitmap per frame:
  //   1. animation layer (preset maths, or decoded GIF/sprite frames), else a
  //      static image (Floyd–Steinberg dithered) — else empty
  //   2. text pixels OR-ed on top (the token/zone pipeline rasterised with the
  //      browser's monospace font and thresholded to 1-bit)
  //   3. pixel widgets (hbar/vbar/sliders/needle) drawn last, from live values
  // and then paints every on-pixel as a lit dot (off pixels as faint ghosts).
  // The screen fill + backlight + glass come from the CSS layers in
  // LcdDisplayRenderer; this canvas draws only the dots (transparent).
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
    fontScale = 1,
    widgets = [],
    texts = [],                  // pixel-positioned strings: {x, y, h, w, align, content}
    animMode = 'off',            // off | file | preset
    animSrc = '',
    animFrames = 0,              // sprite-sheet frame count (0 = animated file)
    animFps = 12,
    animLoop = true,
    animPreset = 'wave',
    animSpeed = 1,
    animTick = 0,                // ms clock from the renderer's rAF
    width = 0,
    height = 0,
  } = $props();

  const BASE_CELL_W = 6; // per-char pixel cell at scale 1: ~5px glyph + 1px gap
  const BASE_CELL_H = 8; // per-row  pixel cell at scale 1: ~7px glyph + 1px gap
  const MAX_ANIM_FRAMES = 180;

  let canvasEl = $state(null);
  let imageEl = $state(null);

  // Font Scale grows the per-character dot cell, so a larger glyph is drawn from
  // more dots (auto-resolution modes). Explicit pixelWidth/Height still pin the
  // grid; the glyphs then fit whatever cell the grid gives per character.
  let scale = $derived(Math.max(0.3, Math.min(3, Number(fontScale) || 1)));
  let cellPxW = $derived(Math.max(2, Math.round(BASE_CELL_W * scale)));
  let cellPxH = $derived(Math.max(3, Math.round(BASE_CELL_H * scale)));
  let pixW = $derived(pixelWidth > 0 ? Math.round(pixelWidth) : Math.max(1, cols * cellPxW));
  let pixH = $derived(pixelHeight > 0 ? Math.round(pixelHeight) : Math.max(1, rows * cellPxH));

  // Load the static image source (data URL or path) when set.
  $effect(() => {
    const src = String(imageSrc ?? '');
    if (!src) { imageEl = null; return; }
    const img = new Image();
    img.onload = () => { imageEl = img; };
    img.onerror = () => { imageEl = null; };
    img.src = src;
    return () => { img.onload = null; img.onerror = null; };
  });

  // --- 1-bit helpers ---

  // Luminance of RGBA canvas data, dithered (Floyd–Steinberg) or thresholded.
  function bitmapFromImageData(data, w, h, useDither) {
    const lum = new Float32Array(w * h);
    for (let i = 0; i < lum.length; i += 1) {
      lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    const bmp = new Uint8Array(w * h);
    if (useDither) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = y * w + x;
          const oldV = lum[i];
          const newV = oldV < 128 ? 0 : 255;
          bmp[i] = newV ? 1 : 0;
          const err = oldV - newV;
          if (x + 1 < w) lum[i + 1] += (err * 7) / 16;
          if (y + 1 < h) {
            if (x > 0) lum[i + w - 1] += (err * 3) / 16;
            lum[i + w] += (err * 5) / 16;
            if (x + 1 < w) lum[i + w + 1] += (err * 1) / 16;
          }
        }
      }
    } else {
      for (let i = 0; i < bmp.length; i += 1) bmp[i] = lum[i] < 128 ? 0 : 1;
    }
    return bmp;
  }

  function drawSourceToBitmap(source, sx, sy, sw, sh) {
    const off = document.createElement('canvas');
    off.width = pixW;
    off.height = pixH;
    const c = off.getContext('2d');
    if (!c) return null;
    c.drawImage(source, sx, sy, sw, sh, 0, 0, pixW, pixH);
    return bitmapFromImageData(c.getImageData(0, 0, pixW, pixH).data, pixW, pixH, dither);
  }

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
    // Fit each glyph to the actual per-character cell (grid width / cols) so text
    // fills the grid at any resolution, and honours Font Scale via the cell size.
    const charW = pixW / Math.max(1, cols);
    const charH = pixH / Math.max(1, rows);
    const font = Math.max(3, Math.floor(charH * 0.86));
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.font = `${font}px monospace`;
    let any = false;
    for (let r = 0; r < rows; r += 1) {
      const line = lines[r] || [];
      for (let x = 0; x < cols; x += 1) {
        const ch = line[x] ?? ' ';
        if (ch !== ' ') { c.fillText(ch, x * charW + charW / 2, r * charH + charH / 2); any = true; }
      }
    }
    // Pixel-positioned strings (PixelDisplay elements): drawn at (x, y) with a
    // per-text font height; w > 0 clips and provides the alignment box.
    for (const t of (Array.isArray(texts) ? texts : [])) {
      const content = String(t?.content ?? '');
      if (!content) continue;
      const th = Math.max(3, Math.round(Number(t?.h) || 8));
      const tx = Math.round(Number(t?.x) || 0);
      const ty = Math.round(Number(t?.y) || 0);
      const tw = Math.max(0, Math.round(Number(t?.w) || 0));
      const align = String(t?.align ?? 'left');
      c.save();
      if (tw > 0) { c.beginPath(); c.rect(tx, ty, tw, th + 2); c.clip(); }
      c.font = `${th}px monospace`;
      c.textBaseline = 'top';
      c.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
      const anchorX = align === 'center' ? tx + tw / 2 : align === 'right' ? tx + tw : tx;
      c.fillText(content, anchorX, ty);
      c.restore();
      any = true;
    }
    if (!any) return null;
    const data = c.getImageData(0, 0, pixW, pixH).data;
    const bmp = new Uint8Array(pixW * pixH);
    for (let i = 0; i < bmp.length; i += 1) bmp[i] = data[i * 4] > 128 ? 1 : 0;
    return bmp;
  }

  function imageBitmap() {
    if (!imageEl) return null;
    return drawSourceToBitmap(imageEl, 0, 0, imageEl.width, imageEl.height);
  }

  // --- Animation frames (decoded once per source/grid/dither change) ---
  // { frames: Uint8Array[], durations: number[] (ms), total: number } | null
  let animCache = $state(null);
  let animDecodeToken = 0;

  $effect(() => {
    const src = String(animSrc ?? '');
    const mode = String(animMode ?? 'off');
    const spriteFrames = Math.max(0, Math.round(Number(animFrames) || 0));
    const fps = Math.max(1, Number(animFps) || 12);
    void pixW; void pixH; void dither;
    animCache = null;
    if (mode !== 'file' || !src) return;
    const token = ++animDecodeToken;

    const finish = (cache) => { if (token === animDecodeToken) animCache = cache; };

    if (spriteFrames > 1) {
      // Sprite sheet: N frames side by side in one image.
      const img = new Image();
      img.onload = () => {
        const fw = Math.max(1, Math.floor(img.width / spriteFrames));
        const frames = [];
        for (let i = 0; i < spriteFrames; i += 1) {
          const bmp = drawSourceToBitmap(img, i * fw, 0, fw, img.height);
          if (bmp) frames.push(bmp);
        }
        if (frames.length) {
          const durations = frames.map(() => 1000 / fps);
          finish({ frames, durations, total: frames.length * (1000 / fps) });
        }
      };
      img.src = src;
      return;
    }

    // Animated file (GIF/APNG/WebP) via WebCodecs ImageDecoder (Chromium).
    if (typeof ImageDecoder === 'undefined') {
      // Unsupported: fall back to the first frame as a static image.
      const img = new Image();
      img.onload = () => {
        const bmp = drawSourceToBitmap(img, 0, 0, img.width, img.height);
        if (bmp) finish({ frames: [bmp], durations: [1000], total: 1000 });
      };
      img.src = src;
      return;
    }

    (async () => {
      try {
        const mime = src.startsWith('data:') ? src.slice(5, src.indexOf(';')) : 'image/gif';
        const buf = await (await fetch(src)).arrayBuffer();
        const decoder = new ImageDecoder({ data: buf, type: mime });
        await decoder.tracks.ready;
        const count = Math.min(MAX_ANIM_FRAMES, decoder.tracks.selectedTrack?.frameCount ?? 1);
        const frames = [];
        const durations = [];
        for (let i = 0; i < count; i += 1) {
          const { image } = await decoder.decode({ frameIndex: i });
          const bmp = drawSourceToBitmap(image, 0, 0, image.displayWidth, image.displayHeight);
          // Frame duration comes in microseconds; default to 100ms when absent.
          durations.push(Math.max(20, (image.duration ?? 100000) / 1000));
          image.close();
          if (bmp) frames.push(bmp);
        }
        decoder.close?.();
        if (frames.length) finish({ frames, durations, total: durations.reduce((a, b) => a + b, 0) });
      } catch {
        /* undecodable source: leave the animation empty */
      }
    })();
  });

  function animFrameBitmap() {
    if (!animCache || !animCache.frames.length) return null;
    const { frames, durations, total } = animCache;
    let t = Math.max(0, animTick);
    if (animLoop === false && t >= total) return frames[frames.length - 1];
    t %= total;
    for (let i = 0; i < frames.length; i += 1) {
      if (t < durations[i]) return frames[i];
      t -= durations[i];
    }
    return frames[frames.length - 1];
  }

  // --- Procedural presets (deterministic in t, so resume/HMR are stable) ---
  function hash01(n) {
    return (((n * 2654435761) >>> 0) % 100000) / 100000;
  }

  function presetBitmap() {
    const bmp = new Uint8Array(pixW * pixH);
    const px = (x, y) => {
      const xi = Math.round(x); const yi = Math.round(y);
      if (xi >= 0 && xi < pixW && yi >= 0 && yi < pixH) bmp[yi * pixW + xi] = 1;
    };
    const t = (animTick / 1000) * Math.max(0.05, Number(animSpeed) || 1);
    const kind = String(animPreset ?? 'wave');
    const midY = pixH / 2;

    if (kind === 'wave') {
      const amp = Math.max(2, pixH * 0.32);
      for (let x = 0; x < pixW; x += 1) {
        px(x, midY + Math.sin(x * 0.28 + t * 5) * amp);
      }
    } else if (kind === 'scanner') {
      const w = Math.max(3, Math.round(pixW / 8));
      const span = Math.max(1, pixW - w);
      const phase = (t * 1.2) % 2;
      const pos = Math.round((phase <= 1 ? phase : 2 - phase) * span);
      for (let x = pos; x < pos + w; x += 1) {
        for (let y = Math.floor(midY) - 1; y <= Math.floor(midY) + 1; y += 1) px(x, y);
      }
    } else if (kind === 'rain') {
      for (let cx = 0; cx < pixW; cx += 2) {
        const speed = 14 + hash01(cx + 7) * 30;
        const head = (hash01(cx) * (pixH + 10) + t * speed) % (pixH + 10);
        for (let trail = 0; trail < 4; trail += 1) px(cx, head - trail);
      }
    } else if (kind === 'starfield') {
      for (let i = 0; i < 42; i += 1) {
        const speed = 8 + hash01(i * 3 + 1) * 40;
        const x = (hash01(i) * pixW + pixW * 4 - t * speed) % pixW;
        px(x, Math.floor(hash01(i * 7 + 3) * pixH));
      }
    } else if (kind === 'spinner') {
      const cx = pixW / 2; const cy = pixH / 2;
      const r = Math.max(3, Math.min(pixW, pixH) / 2 - 2);
      const a = t * 5;
      for (let s = 0; s <= r; s += 0.5) {
        px(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
        px(cx + Math.cos(a + Math.PI) * s * 0.55, cy + Math.sin(a + Math.PI) * s * 0.55);
      }
    } else if (kind === 'plasma') {
      for (let y = 0; y < pixH; y += 1) {
        for (let x = 0; x < pixW; x += 1) {
          const v = Math.sin(x * 0.32 + t * 2.2) + Math.sin(y * 0.34 - t * 1.7) + Math.sin((x + y) * 0.21 + t);
          if (v > 0.85) bmp[y * pixW + x] = 1;
        }
      }
    }
    return bmp;
  }

  // --- Pixel widgets (bars / sliders / needle) ---
  // Per-widget motion state for smoothing + peak-hold, keyed by zone id.
  const widgetState = new Map();
  let lastDrawAt = 0;

  function widgetRect(w) {
    // Pixel-native widgets (PixelDisplay) carry their rect directly; the LCD's
    // cell-based widgets convert row/col character units to grid pixels.
    let x0; let x1; let y0; let y1;
    if (w.px === true) {
      x0 = Math.round(Number(w.x) || 0);
      y0 = Math.round(Number(w.y) || 0);
      x1 = x0 + Math.max(1, Math.round(Number(w.w) || 1)) - 1;
      y1 = y0 + Math.max(1, Math.round(Number(w.h) || 1)) - 1;
    } else {
      x0 = Math.round((w.colStart * pixW) / Math.max(1, cols));
      x1 = Math.round(((w.colEnd + 1) * pixW) / Math.max(1, cols)) - 1;
      y0 = Math.round((w.row * pixH) / Math.max(1, rows));
      y1 = Math.round(((w.row + w.rowSpan) * pixH) / Math.max(1, rows)) - 1;
    }
    return {
      x0: Math.max(0, Math.min(pixW - 1, x0)),
      x1: Math.max(0, Math.min(pixW - 1, Math.max(x0, x1))),
      y0: Math.max(0, Math.min(pixH - 1, y0)),
      y1: Math.max(0, Math.min(pixH - 1, Math.max(y0, y1))),
    };
  }

  function drawWidgets(bmp, dtMs) {
    const px = (x, y) => {
      const xi = Math.round(x); const yi = Math.round(y);
      if (xi >= 0 && xi < pixW && yi >= 0 && yi < pixH) bmp[yi * pixW + xi] = 1;
    };
    const fillRect = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) px(x, y);
    };
    const outline = (x0, y0, x1, y1) => {
      for (let x = x0; x <= x1; x += 1) { px(x, y0); px(x, y1); }
      for (let y = y0; y <= y1; y += 1) { px(x0, y); px(x1, y); }
    };
    const line = (x0, y0, x1, y1) => {
      // Bresenham
      let x = Math.round(x0); let y = Math.round(y0);
      const ex = Math.round(x1); const ey = Math.round(y1);
      const dx = Math.abs(ex - x); const dy = -Math.abs(ey - y);
      const sx = x < ex ? 1 : -1; const sy = y < ey ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        px(x, y);
        if (x === ex && y === ey) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
      }
    };
    const disc = (cx, cy, r) => {
      for (let y = -r; y <= r; y += 1) for (let x = -r; x <= r; x += 1) {
        if (x * x + y * y <= r * r + r * 0.25) px(cx + x, cy + y);
      }
    };

    for (const w of widgets) {
      const rect = widgetRect(w);
      const { x0, y0, x1, y1 } = rect;

      // Smoothing (attack/release) + peak-hold ballistics.
      let state = widgetState.get(w.id);
      if (!state) { state = { display: w.frac, peak: w.frac, peakAt: 0 }; widgetState.set(w.id, state); }
      const k = Math.min(1, (dtMs / 1000) * 14);
      state.display = w.smooth ? state.display + (w.frac - state.display) * k : w.frac;
      if (Math.abs(state.display - w.frac) < 0.003) state.display = w.frac;
      if (w.peakHold) {
        if (state.display >= state.peak) { state.peak = state.display; state.peakAt = 0; }
        else {
          state.peakAt += dtMs;
          if (state.peakAt > 800) state.peak = Math.max(state.display, state.peak - (dtMs / 1000) * 0.8);
        }
      }
      const frac = Math.max(0, Math.min(1, state.display));
      const peak = Math.max(0, Math.min(1, state.peak));

      if (w.frame) outline(x0, y0, x1, y1);
      const inset = w.frame ? 2 : 0;
      const ix0 = Math.min(x1, x0 + inset); const ix1 = Math.max(ix0, x1 - inset);
      const iy0 = Math.min(y1, y0 + inset); const iy1 = Math.max(iy0, y1 - inset);
      const iw = ix1 - ix0 + 1; const ih = iy1 - iy0 + 1;

      if (w.kind === 'hbar') {
        const fill = Math.round(iw * frac);
        if (fill > 0) fillRect(ix0, iy0, ix0 + fill - 1, iy1);
        // Empty meter: keep a 1px baseline so the widget is always visible.
        else for (let y = iy0; y <= iy1; y += 1) px(ix0, y);
        if (w.peakHold) { const pxx = ix0 + Math.round((iw - 1) * peak); for (let y = iy0; y <= iy1; y += 1) px(pxx, y); }
        if (w.ticks) for (const f of [0.25, 0.5, 0.75]) { const tx = ix0 + Math.round((iw - 1) * f); px(tx, iy1); px(tx, iy1 - 1); }
      } else if (w.kind === 'vbar') {
        const fill = Math.round(ih * frac);
        if (fill > 0) fillRect(ix0, iy1 - fill + 1, ix1, iy1);
        // Empty meter: keep a 1px baseline so the widget is always visible.
        else for (let x = ix0; x <= ix1; x += 1) px(x, iy1);
        if (w.peakHold) { const pyy = iy1 - Math.round((ih - 1) * peak); for (let x = ix0; x <= ix1; x += 1) px(x, pyy); }
        if (w.ticks) for (const f of [0.25, 0.5, 0.75]) { const ty = iy1 - Math.round((ih - 1) * f); px(ix1, ty); px(ix1 - 1, ty); }
      } else if (w.kind === 'hslider') {
        const cy = Math.round((iy0 + iy1) / 2);
        for (let x = ix0; x <= ix1; x += 1) px(x, cy);
        if (w.ticks) for (const f of [0, 0.5, 1]) { const tx = ix0 + Math.round((iw - 1) * f); px(tx, cy - 1); px(tx, cy + 1); }
        const r = Math.max(1, Math.floor(Math.min(ih, Math.max(4, ih * 0.9)) / 2));
        const hx = ix0 + Math.round((iw - 1) * frac);
        if (dotShape === 'square') fillRect(hx - r, cy - r, hx + r, cy + r);
        else disc(hx, cy, r);
      } else if (w.kind === 'vslider') {
        const cx = Math.round((ix0 + ix1) / 2);
        for (let y = iy0; y <= iy1; y += 1) px(cx, y);
        if (w.ticks) for (const f of [0, 0.5, 1]) { const ty = iy1 - Math.round((ih - 1) * f); px(cx - 1, ty); px(cx + 1, ty); }
        const r = Math.max(1, Math.floor(Math.min(iw, Math.max(4, iw * 0.9)) / 2));
        const hy = iy1 - Math.round((ih - 1) * frac);
        if (dotShape === 'square') fillRect(cx - r, hy - r, cx + r, hy + r);
        else disc(cx, hy, r);
      } else if (w.kind === 'needle') {
        const cx = (ix0 + ix1) / 2;
        const radius = Math.max(2, Math.min(ih - 1, iw / 2 - 1));
        // Sweep 135° (left) -> 45° (right) as the value rises, pivot at the bottom.
        const a = ((135 - 90 * frac) * Math.PI) / 180;
        line(cx, iy1, cx + Math.cos(a) * radius, iy1 - Math.sin(a) * radius);
        if (w.ticks) for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const ta = ((135 - 90 * f) * Math.PI) / 180;
          px(cx + Math.cos(ta) * radius, iy1 - Math.sin(ta) * radius);
        }
      }
    }
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

    const now = performance.now();
    const dtMs = lastDrawAt ? Math.min(200, now - lastDrawAt) : 16;
    lastDrawAt = now;

    // Compose the 1-bit frame: animation/image base, text OR-ed over, widgets last.
    const mode = String(animMode ?? 'off');
    let bmp;
    let baseIsImage = false;
    if (mode === 'preset') {
      bmp = presetBitmap();
    } else if (mode === 'file') {
      bmp = animFrameBitmap() ?? new Uint8Array(pixW * pixH);
      baseIsImage = true;
    } else if (imageEl) {
      bmp = imageBitmap() ?? new Uint8Array(pixW * pixH);
      baseIsImage = true;
    } else {
      bmp = new Uint8Array(pixW * pixH);
    }
    // Text goes on top unless a static image replaced it (original behaviour:
    // an Image overrides the text; animations play BEHIND the text).
    if (!(mode === 'off' && baseIsImage)) {
      if (blinkOn) {
        const text = textBitmap();
        if (text) for (let i = 0; i < bmp.length; i += 1) if (text[i]) bmp[i] = 1;
      }
    }
    if (Array.isArray(widgets) && widgets.length) drawWidgets(bmp, dtMs);

    const cellW = w / pixW;
    const cellH = h / pixH;
    const rad = Math.max(0.5, Math.min(cellW, cellH) * 0.42);
    const litOpacity = 0.4 + brightness * 0.6;
    const ghostOpacity = Math.max(0.03, contrast * 0.5);

    for (let y = 0; y < pixH; y += 1) {
      for (let x = 0; x < pixW; x += 1) {
        const on = bmp[y * pixW + x] === 1;
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
    void widgets; void texts; void animMode; void animCache; void animPreset; void animSpeed;
    void animLoop; void animTick;
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
