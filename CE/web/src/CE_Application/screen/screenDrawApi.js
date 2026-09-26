// Ctrl49 firmware draw-API shim, rendered to an HTML5 canvas 2D context. Implements the
// exact primitives the CTRL49 firmware exposes to uploaded Lua, so the *same* Lua page
// that ships to the keyboard can run in the editor preview against this shim — a
// pixel-faithful preview with no separate "editor approximation".
//
// Primitives (handoff section 9): draw_rect, text_data.new/set, draw_text, draw_image,
// decode_image, get_byte, led_control_set_level_midi, lua_widget_make_dirty. Colors are
// 32-bit ARGB (0xAARRGGBB). Screen is 480x272.
//
// Framework-agnostic ES module. The host (wasmoon binding, or a direct JS driver for
// tests) injects these into the Lua global environment / calls them directly.

export const SCREEN_W = 480;
export const SCREEN_H = 272;

// Asset type ids used by the Lua conventions.
export const ASSET_PNG = 14;       // uploaded PNG object
export const ASSET_BUFFER2D = 18;  // decoded Buffer2D

function argbToCss(argb) {
  // argb is an unsigned 32-bit number 0xAARRGGBB.
  const a = ((argb >>> 24) & 0xff) / 255;
  const r = (argb >>> 16) & 0xff;
  const g = (argb >>> 8) & 0xff;
  const b = argb & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

export class ScreenDrawApi {
  /**
   * @param {CanvasRenderingContext2D} ctx  target 2D context (canvas sized 480x272)
   * @param {object} assets  { [pngId:number]: HTMLCanvasElement|ImageBitmap } uploaded PNGs
   */
  constructor(ctx, assets = {}) {
    this.ctx = ctx;
    this.pngAssets = assets;          // pngId -> source image (white-on-transparent strips)
    this.decoded = new Map();         // decodedId -> { image, tintArgb }
    this.textObjects = [];            // text_data handles (index+1 = id)
  }

  setAsset(pngId, image) { this.pngAssets[pngId] = image; }

  // --- rectangles -------------------------------------------------------------------------------
  draw_rect(x, y, w, h, argb) {
    this.ctx.fillStyle = argbToCss(argb >>> 0);
    this.ctx.fillRect(x, y, w, h);
  }

  // --- text -------------------------------------------------------------------------------------
  // text_data is a table in Lua: { new(), set(handle, props) }. We expose a handle as an opaque
  // integer id; set() stores props.
  text_data_new() {
    this.textObjects.push({ text: '', color: 0xffffffff, font: 10, font_size: 14, just_hor: 1, just_ver: 1 });
    return this.textObjects.length; // 1-based handle
  }

  text_data_set(handle, props) {
    const obj = this.textObjects[handle - 1];
    if (!obj) return;
    Object.assign(obj, props);
  }

  draw_text(handle, x, y, w, h) {
    const obj = this.textObjects[handle - 1];
    if (!obj || obj.text == null) return;
    const ctx = this.ctx;
    const size = obj.font_size || 14;
    ctx.save();
    ctx.fillStyle = argbToCss((obj.color >>> 0) || 0xffffffff);
    // font 9/10 are the confirmed device fonts; approximate with a clean sans.
    ctx.font = `${obj.font === 10 ? '600 ' : ''}${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = obj.just_hor === 1 ? 'center' : (obj.just_hor === 2 ? 'right' : 'left');
    ctx.textBaseline = obj.just_ver === 1 ? 'middle' : (obj.just_ver === 2 ? 'bottom' : 'top');
    const tx = obj.just_hor === 1 ? x + w / 2 : (obj.just_hor === 2 ? x + w : x);
    const ty = obj.just_ver === 1 ? y + h / 2 : (obj.just_ver === 2 ? y + h : y);
    ctx.fillText(String(obj.text), tx, ty, w);
    ctx.restore();
  }

  // --- images / filmstrips ----------------------------------------------------------------------
  // What the keyboard does, not what would be convenient: decode_image with a colour makes an
  // 8-bit coverage buffer ONLY from an 8-bit grey (palette or greyscale) PNG — the grey level is
  // how much of the colour a pixel takes, black none — and draw_image's colour tints only such a
  // buffer. A colour (RGBA) PNG decodes to colour and the tint is ignored. This preview once
  // tinted RGBA masks happily while the keyboard drew every knob white, so it now refuses too.
  //
  // An asset is an image, or { image, tintable } when the caller knows the PNG's type
  // (ctrl49Runtime reads it from the file). A bare image is treated as colour, as the device would.
  decode_image(srcType, srcId, dstType, dstId, tintArgb) {
    const asset = this.pngAssets[srcId];
    if (!asset) return;
    const image = asset.image ?? asset;
    const tintable = asset.tintable === true && tintArgb != null;
    this.decoded.set(dstId, {
      image: tintable ? this._coverageMask(image) : image,
      tintable,
      tintArgb: (tintArgb >>> 0) || 0xffffffff,
    });
  }

  // draw_image(assetType, id, x, y, [srcX, srcY, srcW, srcH, tintArgb])
  draw_image(assetType, id, x, y, srcX = 0, srcY = 0, srcW, srcH, tintArgb) {
    let image;
    let tint = null;
    if (assetType === ASSET_BUFFER2D) {
      const dec = this.decoded.get(id);
      if (!dec) return;
      image = dec.image;
      // A coverage buffer takes the draw's colour, or the decode's when the draw gives none.
      if (dec.tintable) tint = tintArgb == null ? dec.tintArgb : (tintArgb >>> 0);
    } else {
      const asset = this.pngAssets[id];
      image = asset?.image ?? asset;
    }
    if (!image) return;

    const sw = srcW || image.width;
    const sh = srcH || image.height;

    if (tint == null) {
      this.ctx.drawImage(image, srcX, srcY, sw, sh, x, y, sw, sh);
      return;
    }

    // Tint only the cropped frame (not the whole strip): copy the source rect into a
    // small scratch canvas, then source-in fill the tint through its alpha. Tinting the
    // full multi-thousand-pixel-tall strip canvas failed for high source-Y offsets.
    const scratch = this._scratch(sw, sh);
    const sx = scratch.getContext('2d');
    sx.clearRect(0, 0, sw, sh);
    sx.globalCompositeOperation = 'source-over';
    sx.drawImage(image, srcX, srcY, sw, sh, 0, 0, sw, sh);
    sx.globalCompositeOperation = 'source-in'; // keep alpha, replace color
    sx.fillStyle = argbToCss(tint);
    sx.fillRect(0, 0, sw, sh);
    sx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(scratch, 0, 0, sw, sh, x, y, sw, sh);
  }

  // Grey level -> coverage: white pixels whose alpha is the source's grey, as the device's 8-bit
  // buffer behaves. Black is fully transparent.
  _coverageMask(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const cx = canvas.getContext('2d', { willReadFrequently: true });
    cx.drawImage(image, 0, 0);
    const pixels = cx.getImageData(0, 0, canvas.width, canvas.height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const grey = d[i];
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = grey;
    }
    cx.putImageData(pixels, 0, 0);
    return canvas;
  }

  _scratch(w, h) {
    if (!this._scratchCanvas) this._scratchCanvas = document.createElement('canvas');
    const c = this._scratchCanvas;
    if (c.width < w) c.width = w;
    if (c.height < h) c.height = h;
    return c;
  }

  // --- misc device functions (no-ops for preview) -----------------------------------------------
  led_control_set_level_midi() {}
  led_control_set_level() {}
  lua_widget_make_dirty() {}

  clear() { this.ctx.clearRect(0, 0, SCREEN_W, SCREEN_H); }
}
