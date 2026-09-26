// A CTRL49 display page running off the keyboard: any page's Lua source, executed in wasmoon
// against the firmware draw-API shim on a 480x272 canvas. The Screen Builder preview and the
// HoSTage screen preview both stand on this, so a fix to how the device is imitated lands in
// both.
//
// Payloads cross into Lua as byte ARRAYS and are rebuilt into a Lua string inside Lua
// (__invoke), because wasmoon truncates a JS string at its first null byte when marshalling it
// as a function argument — and these payloads legitimately contain 0 bytes (active slot 0,
// value 0, an empty label's length). get_byte is defined in Lua for the same reason.

import luaWasmUrl from 'wasmoon/dist/glue.wasm?url';
import { ScreenDrawApi } from './screenDrawApi.js';

// Load as an ImageBitmap (exact pixels) rather than an HTMLImageElement: a tall filmstrip
// used as a drawImage source can be downscaled/mis-sampled at high source-Y as an <img>.
async function loadImage(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

// A host function returning null crashes wasmoon's promise extension; normalise to nil.
function nilSafe(fn) {
  return (...args) => {
    const result = fn(...args);
    return result == null ? undefined : result;
  };
}

const HELPERS = `
  function get_byte(a, i) local b = string.byte(a, i + 1); if b == nil then return 0 else return b end end
  function __invoke(name, t)
    local f = _G[name]
    if type(f) ~= "function" then error("the page has no function '" .. tostring(name) .. "'") end
    local s = ""; for i = 1, #t do s = s .. string.char(t[i]) end
    f(s)
  end
`;

/**
 * Run a display page on a canvas (must be 480x272).
 * @param {HTMLCanvasElement} canvas
 * @param {{ lua: string, assets?: Record<number, string> }} page  Lua source, and the uploaded
 *        PNG objects as { objectId: url } — the same ids the host uploads before binding.
 * @returns {Promise<{ call(name: string, bytes?: number[]): void, dispose(): void }>}
 *          `call` throws with Lua's own message when the page errors.
 */
export async function createCtrl49Screen(canvas, { lua: source, assets = {} }) {
  const ctx = canvas.getContext('2d');
  const entries = Object.entries(assets);
  const [images, engine] = await Promise.all([
    Promise.all(entries.map(([, url]) => loadImage(url))),
    (async () => {
      const { LuaFactory } = await import('wasmoon');
      return new LuaFactory(luaWasmUrl).createEngine();
    })(),
  ]);

  const api = new ScreenDrawApi(ctx, Object.fromEntries(entries.map(([id], i) => [Number(id), images[i]])));

  engine.global.set('draw_rect', nilSafe((x, y, w, h, c) => api.draw_rect(x, y, w, h, c)));
  engine.global.set('draw_text', nilSafe((handle, x, y, w, h) => api.draw_text(handle, x, y, w, h)));
  engine.global.set('draw_image', nilSafe((...a) => api.draw_image(...a)));
  engine.global.set('decode_image', nilSafe((...a) => api.decode_image(...a)));
  engine.global.set('text_data', {
    new: () => api.text_data_new(),
    set: (handle, props) => { api.text_data_set(handle, props); },
  });
  engine.global.set('led_control_set_level_midi', () => {});
  engine.global.set('led_control_set_level', () => {});
  engine.global.set('lua_widget_make_dirty', () => {});

  try {
    await engine.doString(source);
    await engine.doString(HELPERS);
  } catch (error) {
    try { engine.global.close(); } catch { /* best effort */ }
    throw error;
  }

  const invoke = engine.global.get('__invoke');
  return {
    call(name, bytes = []) { invoke(name, bytes); },
    dispose() {
      try { engine.global.close(); } catch { /* best effort */ }
    },
  };
}
