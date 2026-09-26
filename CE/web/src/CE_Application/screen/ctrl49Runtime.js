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
// The PNG's colour type decides whether the device can tint it (see ScreenDrawApi.decode_image):
// greyscale (0) or palette (3) can, colour cannot. IHDR's colour type is byte 25 of the file.
async function loadImage(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  const head = new Uint8Array(await blob.slice(0, 26).arrayBuffer());
  const tintable = head[25] === 0 || head[25] === 3;
  return { image: await createImageBitmap(blob), tintable };
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

  // The rest of the firmware's Lua surface (the full registered list, read from the Akai ADVANCE
  // 1.0.10 firmware, which runs the same VIP runtime), so a page that uses them runs here too.
  engine.global.set('draw_system_text', nilSafe((handle) => api.draw_system_text(handle)));
  engine.global.set('clear_errors', () => {});        // clears the on-screen Lua error overlay
  engine.global.set('asset_get_valid', (id) => id in assets || Number(id) in assets);
  engine.global.set('mem_usage', () => 0);           // a heap statistic; its selectors are unknown
  engine.global.set('print', (...a) => console.log('[ctrl49 lua]', ...a));
  engine.global.set('lua_ifc_load_script', () => {
    throw new Error('lua_ifc_load_script: the preview runs one page only');
  });
  // set_hook_enabled(id, on) sets bit 1<<id in the firmware's hook mask. Hook 2 is MIDI notes:
  // while it is on the firmware calls the page's global `note`. The preview's note() does the same.
  const hooks = new Set();
  engine.global.set('set_hook_enabled', (id, on) => {
    if (on) hooks.add(Number(id)); else hooks.delete(Number(id));
  });

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
    /** A played note, as the firmware delivers it to a page that enabled hook 2: the page's
        `note(args)` gets the raw three MIDI bytes (status, note, velocity). Returns whether the
        page was listening. */
    note(status, noteNumber, velocity) {
      if (!hooks.has(2) || engine.global.get('note') == null) return false;
      invoke('note', [status & 0xff, noteNumber & 0x7f, velocity & 0x7f]);
      return true;
    },
    dispose() {
      try { engine.global.close(); } catch { /* best effort */ }
    },
  };
}
