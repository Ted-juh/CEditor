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
  import { FONT_W, FONT_H, FONT_ADVANCE, drawCharInto, drawTextInto } from '../utils/pixelFont.js';

  let {
    lines = [],
    cols = 16,
    rows = 2,
    litCss = '#2BE86A',
    unlitCss = 'rgba(43,232,106,0.2)',
    brightness = 1,
    contrast = 0.5,
    gamma = 1,                   // brightness response curve (>1 lifts mids)
    glow = 0,                    // 0..1 bloom halo under lit dots
    showGhost = true,
    dotShape = 'round',
    blinkOn = true,
    imageSrc = '',
    dither = true,
    imageColour = false,         // static image keeps its colours (posterized) vs 1-bit dither
    animColour = false,          // global anim layer: colour frames / hue-cycling presets
    pixelWidth = 0,
    pixelHeight = 0,
    fontScale = 1,
    widgets = [],
    caret = null,                // on-screen edit caret: {x, y, w, h, on} in grid px
    bitmaps = [],                // freehand pixel art: {x, y, w, h, bits ('0'/'1' string), colour}
    texts = [],                  // pixel-positioned strings: {x, y, h, w, align, content}
    anims = [],                  // placeable animations: {id, x, y, w, h, mode, src, frames, fps, loop, preset, speed}
    animMode = 'off',            // off | file | preset
    animSrc = '',
    animFrames = 0,              // sprite-sheet frame count (0 = animated file)
    animSpriteCols = 0,          // sprite-sheet columns (0 = single horizontal strip)
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

  function drawSourceToBitmap(source, sx, sy, sw, sh, tw = pixW, th = pixH) {
    const off = document.createElement('canvas');
    off.width = tw;
    off.height = th;
    const c = off.getContext('2d');
    if (!c) return null;
    c.drawImage(source, sx, sy, sw, sh, 0, 0, tw, th);
    return bitmapFromImageData(c.getImageData(0, 0, tw, th).data, tw, th, dither);
  }

  // RGBA sampling for colour mode (a colour frame instead of a 1-bit one).
  function rgbaFromSource(source, sx, sy, sw, sh, tw = pixW, th = pixH) {
    const off = document.createElement('canvas');
    off.width = tw;
    off.height = th;
    const c = off.getContext('2d');
    if (!c) return null;
    c.drawImage(source, sx, sy, sw, sh, 0, 0, tw, th);
    return c.getImageData(0, 0, tw, th).data;
  }

  // Hue-cycling colour for "colourful" presets.
  function hueCss(tMs, speed) {
    return `hsl(${Math.round(tMs * 0.05 * Math.max(0.05, Number(speed) || 1)) % 360} 90% 60%)`;
  }

  // Decode an animation source (sprite sheet, or animated GIF/APNG/WebP via
  // WebCodecs ImageDecoder) into 1-bit frames at a target size. Resolves to
  // { frames, durations, total } or null.
  async function decodeAnimation(src, spriteFrames, fps, tw, th, wantColour = false, spriteCols = 0) {
    if (!src) return null;
    // A frame is a mono Uint8Array, or { rgba } when colour is requested.
    const grab = (source, sx, sy, sw, sh) => {
      if (!wantColour) return drawSourceToBitmap(source, sx, sy, sw, sh, tw, th);
      const data = rgbaFromSource(source, sx, sy, sw, sh, tw, th);
      return data ? { rgba: data } : null;
    };
    if (spriteFrames > 1) {
      const img = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });
      if (!img) return null;
      // Grid layout: `spriteCols` columns (0 = a single horizontal strip). Cells
      // are read row-major, so vertical strips (cols=1) and grids both work.
      const cols = Math.max(1, Math.round(Number(spriteCols) || 0) || spriteFrames);
      const rows = Math.max(1, Math.ceil(spriteFrames / cols));
      const fw = Math.max(1, Math.floor(img.width / cols));
      const fh = Math.max(1, Math.floor(img.height / rows));
      const frames = [];
      for (let i = 0; i < spriteFrames; i += 1) {
        const bmp = grab(img, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
        if (bmp) frames.push(bmp);
      }
      if (!frames.length) return null;
      const durations = frames.map(() => 1000 / Math.max(1, fps));
      return { frames, durations, total: frames.length * (1000 / Math.max(1, fps)) };
    }
    if (typeof ImageDecoder === 'undefined') {
      const img = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });
      if (!img) return null;
      const bmp = grab(img, 0, 0, img.width, img.height);
      return bmp ? { frames: [bmp], durations: [1000], total: 1000 } : null;
    }
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
        const bmp = grab(image, 0, 0, image.displayWidth, image.displayHeight);
        durations.push(Math.max(20, (image.duration ?? 100000) / 1000));
        image.close();
        if (bmp) frames.push(bmp);
      }
      decoder.close?.();
      return frames.length ? { frames, durations, total: durations.reduce((a, b) => a + b, 0) } : null;
    } catch {
      return null;
    }
  }

  function pickFrame(cache, tMs, loop) {
    if (!cache || !cache.frames.length) return null;
    const { frames, durations, total } = cache;
    let t = Math.max(0, tMs);
    if (loop === false && t >= total) return frames[frames.length - 1];
    t %= total;
    for (let i = 0; i < frames.length; i += 1) {
      if (t < durations[i]) return frames[i];
      t -= durations[i];
    }
    return frames[frames.length - 1];
  }

  // Rasterise the grid text with the built-in 5×7 bitmap pixel font: exact
  // pixels at scale 1, crisp at integer scales — no antialias/threshold mush.
  function textBitmap() {
    const bmp = new Uint8Array(pixW * pixH);
    const charW = pixW / Math.max(1, cols);
    const charH = pixH / Math.max(1, rows);
    // Largest integer scale whose glyph cell (6×8 incl. gap) fits the grid cell.
    const s = Math.max(1, Math.floor(Math.min(charW / FONT_ADVANCE, charH / (FONT_H + 1))));
    let any = false;
    for (let r = 0; r < rows; r += 1) {
      const line = lines[r] || [];
      const oy = Math.round(r * charH + (charH - FONT_H * s) / 2);
      for (let x = 0; x < cols; x += 1) {
        const ch = line[x] ?? ' ';
        if (ch === ' ') continue;
        const ox = Math.round(x * charW + (charW - FONT_W * s) / 2);
        if (drawCharInto(bmp, pixW, pixH, ch, ox, oy, s)) any = true;
      }
    }
    return any ? bmp : null;
  }

  // Rasterise ONE pixel-positioned string (PixelDisplay element) with the
  // bitmap font. h picks the integer scale (8px per scale step); w > 0 is the
  // alignment/clip box. Separate per element so each can take its own colour.
  function textElementBitmap(t) {
    const content = String(t?.content ?? '');
    if (!content) return null;
    const bmp = new Uint8Array(pixW * pixH);
    const th = Math.max(3, Math.round(Number(t?.h) || 8));
    const s = Math.max(1, Math.floor(th / (FONT_H + 1)));
    drawTextInto(
      bmp, pixW, pixH, content,
      Math.round(Number(t?.x) || 0), Math.round(Number(t?.y) || 0),
      s, String(t?.align ?? 'left'), Math.max(0, Math.round(Number(t?.w) || 0))
    );
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
    const spriteCols = Math.max(0, Math.round(Number(animSpriteCols) || 0));
    const fps = Math.max(1, Number(animFps) || 12);
    const wantColour = animColour === true;
    void pixW; void pixH; void dither; void spriteCols;
    animCache = null;
    if (mode !== 'file' || !src) return;
    const token = ++animDecodeToken;

    decodeAnimation(src, spriteFrames, fps, pixW, pixH, wantColour, spriteCols).then((cache) => {
      if (token === animDecodeToken && cache) animCache = cache;
    });
  });

  function animFrameBitmap() {
    return pickFrame(animCache, animTick, animLoop);
  }

  // --- Placeable animation elements (their own rect + source per element) ---
  // Decoded per element at its rect size, keyed so size/source changes re-decode.
  let elAnimCaches = $state({});
  $effect(() => {
    const list = Array.isArray(anims) ? anims : [];
    void dither;
    for (const a of list) {
      if (a.mode !== 'file' || !a.src) continue;
      const key = `${a.src.length}:${a.src.slice(-24)}|${a.w}x${a.h}|${a.frames}|${a.spriteCols ?? 0}|${a.fps}|${dither}|c${a.colourful ? 1 : 0}`;
      if (elAnimCaches[a.id]?.key === key) continue;
      elAnimCaches = { ...elAnimCaches, [a.id]: { key, cache: null } };
      decodeAnimation(a.src, a.frames, a.fps, a.w, a.h, a.colourful === true, a.spriteCols ?? 0).then((cache) => {
        if (elAnimCaches[a.id]?.key === key) {
          elAnimCaches = { ...elAnimCaches, [a.id]: { key, cache } };
        }
      });
    }
  });

  // --- Procedural presets (deterministic in t, so resume/HMR are stable) ---
  function hash01(n) {
    return (((n * 2654435761) >>> 0) % 100000) / 100000;
  }

  // Draw a preset effect into a w×h bitmap at time t (seconds). Shared by the
  // full-screen animation layer and placeable anim elements.
  function presetInto(w, h, t, kindName) {
    const bmp = new Uint8Array(w * h);
    const px = (x, y) => {
      const xi = Math.round(x); const yi = Math.round(y);
      if (xi >= 0 && xi < w && yi >= 0 && yi < h) bmp[yi * w + xi] = 1;
    };
    const kind = String(kindName ?? 'wave');
    const midY = h / 2;

    if (kind === 'wave') {
      const amp = Math.max(2, h * 0.32);
      for (let x = 0; x < w; x += 1) {
        px(x, midY + Math.sin(x * 0.28 + t * 5) * amp);
      }
    } else if (kind === 'scanner') {
      const bw = Math.max(3, Math.round(w / 8));
      const span = Math.max(1, w - bw);
      const phase = (t * 1.2) % 2;
      const pos = Math.round((phase <= 1 ? phase : 2 - phase) * span);
      for (let x = pos; x < pos + bw; x += 1) {
        for (let y = Math.floor(midY) - 1; y <= Math.floor(midY) + 1; y += 1) px(x, y);
      }
    } else if (kind === 'rain') {
      for (let cx = 0; cx < w; cx += 2) {
        const speed = 14 + hash01(cx + 7) * 30;
        const head = (hash01(cx) * (h + 10) + t * speed) % (h + 10);
        for (let trail = 0; trail < 4; trail += 1) px(cx, head - trail);
      }
    } else if (kind === 'starfield') {
      for (let i = 0; i < 42; i += 1) {
        const speed = 8 + hash01(i * 3 + 1) * 40;
        const x = (hash01(i) * w + w * 4 - t * speed) % w;
        px(x, Math.floor(hash01(i * 7 + 3) * h));
      }
    } else if (kind === 'spinner') {
      const cx = w / 2; const cy = h / 2;
      const r = Math.max(3, Math.min(w, h) / 2 - 2);
      const a = t * 5;
      for (let s = 0; s <= r; s += 0.5) {
        px(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
        px(cx + Math.cos(a + Math.PI) * s * 0.55, cy + Math.sin(a + Math.PI) * s * 0.55);
      }
    } else if (kind === 'plasma') {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const v = Math.sin(x * 0.32 + t * 2.2) + Math.sin(y * 0.34 - t * 1.7) + Math.sin((x + y) * 0.21 + t);
          if (v > 0.85) bmp[y * w + x] = 1;
        }
      }
    }
    return bmp;
  }

  function presetBitmap() {
    return presetInto(pixW, pixH, (animTick / 1000) * Math.max(0.05, Number(animSpeed) || 1), animPreset);
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

  // Parse an rgb()/rgba()/#hex/AARRGGBB colour to {r,g,b} for gradients.
  function parseRgb(css) {
    const s = String(css ?? '').trim();
    let m = s.match(/rgba?\(([^)]+)\)/i);
    if (m) { const p = m[1].split(',').map((n) => parseFloat(n)); return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0 }; }
    m = s.match(/^#?([0-9a-fA-F]{8})$/);
    if (m) { const h = m[1]; return { r: parseInt(h.slice(2, 4), 16), g: parseInt(h.slice(4, 6), 16), b: parseInt(h.slice(6, 8), 16) }; }
    m = s.match(/^#?([0-9a-fA-F]{6})$/);
    if (m) { const n = parseInt(m[1], 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
    return { r: 43, g: 232, b: 106 };
  }

  const METER_GREEN = 'rgb(52,214,86)';
  const METER_YELLOW = 'rgb(235,200,60)';
  const METER_RED = 'rgb(240,72,56)';

  function drawWidgets(bmp, dtMs, colId) {
    // `cur` is the palette id the px helper writes; widgets set it per stroke.
    let cur = 1;
    const px = (x, y) => {
      const xi = Math.round(x); const yi = Math.round(y);
      if (xi >= 0 && xi < pixW && yi >= 0 && yi < pixH) bmp[yi * pixW + xi] = cur;
    };
    // Classic VU zoning by position/value: green -> yellow -> red.
    const meterId = (frac) => colId(frac < 0.6 ? METER_GREEN : frac < 0.85 ? METER_YELLOW : METER_RED);
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

      const baseId = colId(w.colour);
      cur = baseId;
      if (w.frame) outline(x0, y0, x1, y1);
      const inset = w.frame ? 2 : 0;
      const ix0 = Math.min(x1, x0 + inset); const ix1 = Math.max(ix0, x1 - inset);
      const iy0 = Math.min(y1, y0 + inset); const iy1 = Math.max(iy0, y1 - inset);
      const iw = ix1 - ix0 + 1; const ih = iy1 - iy0 + 1;

      if (w.kind === 'hbar') {
        const fill = Math.round(iw * frac);
        if (fill > 0) {
          if (w.meterColours) {
            // VU zoning by position: the bar's left zone is green, then yellow, red.
            for (let dx = 0; dx < fill; dx += 1) {
              cur = meterId(dx / Math.max(1, iw - 1));
              for (let y = iy0; y <= iy1; y += 1) px(ix0 + dx, y);
            }
            cur = baseId;
          } else if (w.gradient) {
            // Brightness gradient: dim at the base, bright toward the tip.
            const b = parseRgb(w.colour || litCss);
            for (let dx = 0; dx < fill; dx += 1) {
              const t = 0.4 + 0.6 * (dx / Math.max(1, iw - 1));
              cur = colId(`rgb(${Math.round(b.r * t)},${Math.round(b.g * t)},${Math.round(b.b * t)})`);
              for (let y = iy0; y <= iy1; y += 1) px(ix0 + dx, y);
            }
            cur = baseId;
          } else {
            fillRect(ix0, iy0, ix0 + fill - 1, iy1);
          }
        } else {
          // Empty meter: keep a 1px baseline so the widget is always visible.
          for (let y = iy0; y <= iy1; y += 1) px(ix0, y);
        }
        if (w.peakHold) {
          cur = w.meterColours ? meterId(peak) : baseId;
          const pxx = ix0 + Math.round((iw - 1) * peak);
          for (let y = iy0; y <= iy1; y += 1) px(pxx, y);
          cur = baseId;
        }
        if (w.ticks) for (const f of [0.25, 0.5, 0.75]) { const tx = ix0 + Math.round((iw - 1) * f); px(tx, iy1); px(tx, iy1 - 1); }
      } else if (w.kind === 'vbar') {
        const fill = Math.round(ih * frac);
        if (fill > 0) {
          if (w.meterColours) {
            // VU zoning by position: bottom green, middle yellow, top red.
            for (let dy = 0; dy < fill; dy += 1) {
              cur = meterId(dy / Math.max(1, ih - 1));
              for (let x = ix0; x <= ix1; x += 1) px(x, iy1 - dy);
            }
            cur = baseId;
          } else if (w.gradient) {
            // Brightness gradient: dim at the base, bright toward the top.
            const b = parseRgb(w.colour || litCss);
            for (let dy = 0; dy < fill; dy += 1) {
              const t = 0.4 + 0.6 * (dy / Math.max(1, ih - 1));
              cur = colId(`rgb(${Math.round(b.r * t)},${Math.round(b.g * t)},${Math.round(b.b * t)})`);
              for (let x = ix0; x <= ix1; x += 1) px(x, iy1 - dy);
            }
            cur = baseId;
          } else {
            fillRect(ix0, iy1 - fill + 1, ix1, iy1);
          }
        } else {
          // Empty meter: keep a 1px baseline so the widget is always visible.
          for (let x = ix0; x <= ix1; x += 1) px(x, iy1);
        }
        if (w.peakHold) {
          cur = w.meterColours ? meterId(peak) : baseId;
          const pyy = iy1 - Math.round((ih - 1) * peak);
          for (let x = ix0; x <= ix1; x += 1) px(x, pyy);
          cur = baseId;
        }
        if (w.ticks) for (const f of [0.25, 0.5, 0.75]) { const ty = iy1 - Math.round((ih - 1) * f); px(ix1, ty); px(ix1 - 1, ty); }
      } else if (w.kind === 'hslider') {
        const cy = Math.round((iy0 + iy1) / 2);
        for (let x = ix0; x <= ix1; x += 1) px(x, cy);
        if (w.ticks) for (const f of [0, 0.5, 1]) { const tx = ix0 + Math.round((iw - 1) * f); px(tx, cy - 1); px(tx, cy + 1); }
        const r = Math.max(1, Math.floor(Math.min(ih, Math.max(4, ih * 0.9)) / 2));
        const hx = ix0 + Math.round((iw - 1) * frac);
        cur = w.meterColours ? meterId(frac) : baseId;
        if (dotShape === 'square') fillRect(hx - r, cy - r, hx + r, cy + r);
        else disc(hx, cy, r);
        cur = baseId;
      } else if (w.kind === 'vslider') {
        const cx = Math.round((ix0 + ix1) / 2);
        for (let y = iy0; y <= iy1; y += 1) px(cx, y);
        if (w.ticks) for (const f of [0, 0.5, 1]) { const ty = iy1 - Math.round((ih - 1) * f); px(cx - 1, ty); px(cx + 1, ty); }
        const r = Math.max(1, Math.floor(Math.min(iw, Math.max(4, iw * 0.9)) / 2));
        const hy = iy1 - Math.round((ih - 1) * frac);
        cur = w.meterColours ? meterId(frac) : baseId;
        if (dotShape === 'square') fillRect(cx - r, hy - r, cx + r, hy + r);
        else disc(cx, hy, r);
        cur = baseId;
      } else if (w.kind === 'needle') {
        const cx = (ix0 + ix1) / 2;
        const radius = Math.max(2, Math.min(ih - 1, iw / 2 - 1));
        // Sweep 135° (left) -> 45° (right) as the value rises, pivot at the bottom.
        const a = ((135 - 90 * frac) * Math.PI) / 180;
        cur = w.meterColours ? meterId(frac) : baseId;
        line(cx, iy1, cx + Math.cos(a) * radius, iy1 - Math.sin(a) * radius);
        cur = baseId;
        if (w.ticks) for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const ta = ((135 - 90 * f) * Math.PI) / 180;
          px(cx + Math.cos(ta) * radius, iy1 - Math.sin(ta) * radius);
        }
      } else if (w.kind === 'wave') {
        // Synthesized "audio-like" waveform: additive harmonics of the chosen
        // shape, low-pass rolled off by the cutoff source, resonance bump near
        // the cutoff, LFO wobbling the filter — mimics the sound from MIDI
        // values without any audio.
        const K = 16;
        const t = (animTick / 1000) * Math.max(0.05, Number(w.speed) || 1);
        const lfo = w.lfoRate > 0 ? Math.sin(2 * Math.PI * w.lfoRate * (animTick / 1000)) : 0;
        const cutBase = (w.cutoff === null || w.cutoff === undefined) ? 1 : w.cutoff;
        const cEff = Math.min(1, Math.max(0.03, cutBase + (w.lfoDepth ?? 0.5) * 0.35 * lfo));
        const kc = 1 + cEff * (K - 1);
        const reso = Math.max(0, w.reso ?? 0);
        const gains = [];
        let norm = 0;
        for (let k = 1; k <= K; k += 1) {
          let a = 0;
          if (w.shape === 'sine') a = k === 1 ? 1 : 0;
          else if (w.shape === 'square') a = k % 2 === 1 ? 1 / k : 0;
          else if (w.shape === 'triangle') a = k % 2 === 1 ? (k % 4 === 1 ? 1 : -1) / (k * k) : 0;
          else a = 1 / k; // saw
          if (a === 0) { gains.push(0); continue; }
          const roll = 1 / (1 + Math.pow(k / kc, 6));
          const peakBump = 1 + reso * 2.5 * Math.exp(-((k - kc) * (k - kc)) / 1.5);
          const g = a * roll * peakBump;
          gains.push(g);
          norm += Math.abs(g);
        }
        if (norm < 0.0001) norm = 1;
        const amp = Math.max(0.05, Math.min(1, w.amp ?? 1));
        const cyc = Math.max(0.25, (w.cycles ?? 2) * (w.freqMul ?? 1));
        const cyMid = (iy0 + iy1) / 2;
        const half = Math.max(1, (ih - 1) / 2);
        let prevY = null;
        for (let dx = 0; dx < iw; dx += 1) {
          const p = ((dx / Math.max(1, iw - 1)) * cyc + t) * 2 * Math.PI;
          let yv = 0;
          for (let k = 1; k <= K; k += 1) {
            const g = gains[k - 1];
            if (g) yv += g * Math.sin(k * p);
          }
          yv /= norm;
          const py = Math.round(cyMid - yv * amp * half);
          if (prevY === null) {
            px(ix0 + dx, py);
          } else {
            const lo = Math.min(prevY, py); const hi = Math.max(prevY, py);
            for (let yy = lo; yy <= hi; yy += 1) px(ix0 + dx, yy);
          }
          prevY = py;
        }
      } else if (w.kind === 'adsr') {
        // ADSR envelope curve from four bound sources: attack/decay/release
        // fracs scale their segment widths, sustain sets the plateau level.
        const c01 = (v, fb) => (v === null || v === undefined ? fb : Math.max(0, Math.min(1, v)));
        const at = c01(w.att, 0.3); const de = c01(w.dec, 0.3);
        const su = c01(w.sus, 0.7); const re = c01(w.rel, 0.3);
        const wsus = Math.max(2, Math.round(iw * 0.22));
        const rest = Math.max(3, iw - wsus);
        const weight = at + de + re + 0.18;
        const wa = Math.max(1, Math.round((rest * (at + 0.06)) / weight));
        const wd = Math.max(1, Math.round((rest * (de + 0.06)) / weight));
        const wr = Math.max(1, rest - wa - wd);
        const segIds = w.meterColours
          ? [colId(METER_GREEN), colId(METER_YELLOW), baseId, colId(METER_RED)]
          : [baseId, baseId, baseId, baseId];
        const levelAt = (dx) => {
          if (dx < wa) { const t = dx / Math.max(1, wa); return { v: Math.pow(t, 0.55), seg: 0 }; }
          if (dx < wa + wd) { const t = (dx - wa) / Math.max(1, wd); return { v: su + (1 - su) * Math.pow(1 - t, 2), seg: 1 }; }
          if (dx < wa + wd + wsus) return { v: su, seg: 2 };
          const t = (dx - wa - wd - wsus) / Math.max(1, wr);
          return { v: su * Math.pow(1 - Math.min(1, t), 2), seg: 3 };
        };
        let prevY = null;
        for (let dx = 0; dx < iw; dx += 1) {
          const { v, seg } = levelAt(dx);
          cur = segIds[seg];
          const py = Math.round(iy1 - v * (ih - 1));
          if (w.fill) {
            for (let yy = py; yy <= iy1; yy += 1) px(ix0 + dx, yy);
          } else if (prevY === null) {
            px(ix0 + dx, py);
          } else {
            const lo = Math.min(prevY, py); const hi = Math.max(prevY, py);
            for (let yy = lo; yy <= hi; yy += 1) px(ix0 + dx, yy);
          }
          prevY = py;
        }
        cur = baseId;
        if (w.ticks) {
          for (const bx of [wa, wa + wd, wa + wd + wsus]) {
            px(ix0 + bx, iy1); px(ix0 + bx, iy1 - 1);
          }
        }
      } else if (w.kind === 'scope') {
        // Rolling history trace of the bound source (oscilloscope / chart
        // recorder): one sample per pixel column across a time window.
        let sc = state.scope;
        if (!sc || sc.samples.length !== iw) {
          sc = { samples: new Float32Array(iw).fill(Math.max(0, Math.min(1, w.frac))), at: animTick };
          state.scope = sc;
        }
        const windowMs = Math.max(250, (w.secs ?? 3) * 1000);
        const interval = windowMs / Math.max(1, iw);
        let steps = Math.floor((animTick - sc.at) / interval);
        if (steps > iw || steps < 0) { sc.samples.fill(Math.max(0, Math.min(1, w.frac))); sc.at = animTick; steps = 0; }
        for (let s2 = 0; s2 < steps; s2 += 1) {
          sc.samples.copyWithin(0, 1);
          sc.samples[iw - 1] = Math.max(0, Math.min(1, w.frac));
          sc.at += interval;
        }
        let prevY = null;
        for (let dx = 0; dx < iw; dx += 1) {
          const v = sc.samples[dx];
          if (w.meterColours) cur = meterId(v);
          const py = Math.round(iy1 - v * (ih - 1));
          if (w.fill) {
            for (let yy = py; yy <= iy1; yy += 1) px(ix0 + dx, yy);
          } else if (prevY === null) {
            px(ix0 + dx, py);
          } else {
            const lo = Math.min(prevY, py); const hi = Math.max(prevY, py);
            for (let yy = lo; yy <= hi; yy += 1) px(ix0 + dx, yy);
          }
          prevY = py;
        }
        cur = baseId;
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

    // Compose the frame into a COLOUR buffer: 0 = off, otherwise an index into
    // this frame's palette (index 1 is always the panel's lit colour, so mono
    // panels behave exactly as before). Passes: animation/image base, texts,
    // placeable anims, widgets last.
    const buf = new Uint16Array(pixW * pixH);
    const palette = ['', litCss];
    const colMap = new Map([[litCss, 1]]);
    const colId = (css) => {
      const key = css || litCss;
      let id = colMap.get(key);
      if (id === undefined) { id = palette.length; palette.push(key); colMap.set(key, id); }
      return id;
    };
    const stamp = (mono, id) => {
      if (!mono) return;
      for (let i = 0; i < buf.length; i += 1) if (mono[i]) buf[i] = id;
    };
    // Posterized colour stamp (3-bit channels) so photos read as an LED panel.
    const stampRgba = (data) => {
      if (!data) return;
      for (let i = 0; i < buf.length; i += 1) {
        if (data[i * 4 + 3] < 128) continue;
        const r = (data[i * 4] & 0xE0) + 16;
        const g = (data[i * 4 + 1] & 0xE0) + 16;
        const b = (data[i * 4 + 2] & 0xE0) + 16;
        if (r + g + b < 80) continue; // near-black stays "off" (screen shows through)
        buf[i] = colId(`rgb(${r},${g},${b})`);
      }
    };

    const mode = String(animMode ?? 'off');
    let baseIsImage = false;
    if (mode === 'preset') {
      stamp(presetBitmap(), animColour ? colId(hueCss(animTick, animSpeed)) : 1);
    } else if (mode === 'file') {
      const fr = animFrameBitmap();
      if (fr && fr.rgba) stampRgba(fr.rgba);
      else stamp(fr, 1);
      baseIsImage = true;
    } else if (imageEl) {
      if (imageColour) stampRgba(rgbaFromSource(imageEl, 0, 0, imageEl.width, imageEl.height));
      else stamp(imageBitmap(), 1);
      baseIsImage = true;
    }
    // Grid text (the LCD char grid) is overridden by a static image — original
    // behaviour: an Image replaces the text; animations play BEHIND it.
    if (!(mode === 'off' && baseIsImage) && blinkOn) {
      stamp(textBitmap(), 1);
    }
    // Pixel-positioned text elements (captions / readouts) always draw on top,
    // including over a background image — a pixel display wants labels over its
    // artwork, not hidden by it. Gated only by blink.
    if (blinkOn) {
      for (const t of (Array.isArray(texts) ? texts : [])) {
        stamp(textElementBitmap(t), colId(t.colour));
      }
    }
    // Freehand pixel-art bitmaps: set each element's '1' bits into its rect.
    for (const bm of (Array.isArray(bitmaps) ? bitmaps : [])) {
      const bits = String(bm?.bits ?? '');
      if (!bits) continue;
      const bw = Math.max(1, Math.round(Number(bm.w) || 1));
      const bh = Math.max(1, Math.round(Number(bm.h) || 1));
      const id = colId(bm.colour);
      for (let yy = 0; yy < bh; yy += 1) {
        for (let xx = 0; xx < bw; xx += 1) {
          if (bits[yy * bw + xx] !== '1') continue;
          const gx = Math.round(Number(bm.x) || 0) + xx;
          const gy = Math.round(Number(bm.y) || 0) + yy;
          if (gx >= 0 && gx < pixW && gy >= 0 && gy < pixH) buf[gy * pixW + gx] = id;
        }
      }
    }

    // Placeable animation elements: blit each one's current frame into its rect.
    for (const a of (Array.isArray(anims) ? anims : [])) {
      const tint = a.colourful && a.mode === 'preset' ? colId(hueCss(animTick, a.speed)) : colId(a.colour);
      let fb = null;
      if (a.mode === 'preset') {
        fb = presetInto(a.w, a.h, (animTick / 1000) * Math.max(0.05, Number(a.speed) || 1), a.preset);
      } else {
        fb = pickFrame(elAnimCaches[a.id]?.cache, animTick, a.loop);
      }
      if (!fb) continue;
      const rgba = fb.rgba ?? null;
      for (let yy = 0; yy < a.h; yy += 1) {
        const gy = a.y + yy;
        if (gy < 0 || gy >= pixH) continue;
        for (let xx = 0; xx < a.w; xx += 1) {
          const gx = a.x + xx;
          if (gx < 0 || gx >= pixW) continue;
          const fi = yy * a.w + xx;
          if (rgba) {
            if (rgba[fi * 4 + 3] < 128) continue;
            const r = (rgba[fi * 4] & 0xE0) + 16;
            const g = (rgba[fi * 4 + 1] & 0xE0) + 16;
            const b = (rgba[fi * 4 + 2] & 0xE0) + 16;
            if (r + g + b < 80) continue;
            buf[gy * pixW + gx] = colId(`rgb(${r},${g},${b})`);
          } else if (fb[fi]) {
            buf[gy * pixW + gx] = tint;
          }
        }
      }
    }

    if (Array.isArray(widgets) && widgets.length) drawWidgets(buf, dtMs, colId);

    // On-screen edit caret (I-beam at the insertion point), painted last so it
    // sits above the text. Lit palette id 1 so it matches the panel colour.
    if (caret && caret.on) {
      const cx0 = Math.round(caret.x); const cy0 = Math.round(caret.y);
      const cw = Math.max(1, Math.round(caret.w)); const ch = Math.max(1, Math.round(caret.h));
      for (let yy = 0; yy < ch; yy += 1) {
        for (let xx = 0; xx < cw; xx += 1) {
          const gx = cx0 + xx; const gy = cy0 + yy;
          if (gx >= 0 && gx < pixW && gy >= 0 && gy < pixH) buf[gy * pixW + gx] = 1;
        }
      }
    }

    const cellW = w / pixW;
    const cellH = h / pixH;
    const rad = Math.max(0.5, Math.min(cellW, cellH) * 0.42);
    // Gamma shapes the brightness response (>1 lifts mids, <1 crushes them);
    // brightness spans a low floor (dim but not black) to full.
    const g = Math.max(0.2, Math.min(4, Number(gamma) || 1));
    const litOpacity = 0.1 + Math.pow(Math.max(0, Math.min(1, brightness)), 1 / g) * 0.9;
    const ghostOpacity = Math.max(0.03, contrast * 0.5);
    const glowAmt = Math.max(0, Math.min(1, Number(glow) || 0));
    const glowRad = rad * (1 + glowAmt * 1.6);

    const paintDot = (cx, cy, r) => {
      if (dotShape === 'square') ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    };

    for (let y = 0; y < pixH; y += 1) {
      for (let x = 0; x < pixW; x += 1) {
        const id = buf[y * pixW + x];
        const on = id > 0;
        if (!on && !showGhost) continue;
        const cx = x * cellW + cellW / 2;
        const cy = y * cellH + cellH / 2;
        // Bloom halo under lit dots (larger, faint) then the crisp dot on top.
        if (on && glowAmt > 0) {
          ctx.globalAlpha = litOpacity * 0.28 * glowAmt;
          ctx.fillStyle = palette[id];
          paintDot(cx, cy, glowRad);
        }
        ctx.globalAlpha = on ? litOpacity : ghostOpacity;
        ctx.fillStyle = on ? palette[id] : unlitCss;
        paintDot(cx, cy, rad);
      }
    }
    ctx.globalAlpha = 1;
  }

  $effect(() => {
    if (!canvasEl) return;
    // Track the inputs so the canvas repaints when any of them change.
    void lines; void cols; void rows; void litCss; void unlitCss; void brightness;
    void contrast; void gamma; void glow; void showGhost; void dotShape; void blinkOn; void imageEl;
    void dither; void pixW; void pixH; void width; void height;
    void widgets; void caret; void bitmaps; void texts; void anims; void elAnimCaches; void animMode; void animCache;
    void animPreset; void animSpeed; void animLoop; void animTick; void imageColour; void animColour;
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
