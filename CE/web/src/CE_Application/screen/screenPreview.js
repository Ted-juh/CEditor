// Live CTRL49 screen preview: runs the actual multi-knob Lua page (the same source that
// ships to the keyboard) against the draw-API shim on an HTML5 canvas. Editing a binding
// or value re-runs the real Lua, so the preview is pixel-faithful to the hardware.
//
// Uses its own wasmoon engine (isolated from the panel-script runtime, per the runtime's
// deferred-sandboxing note). Injects the firmware draw primitives as Lua globals exactly
// as panelRuntime.js injects its host API.

import luaWasmUrl from 'wasmoon/dist/glue.wasm?url';
import { ScreenDrawApi } from './screenDrawApi.js';
import { MULTI_KNOB_LUA } from './multiKnobLua.js';
import stripUrl from './knob_strip.png?url';

const FILMSTRIP_PNG_ID = 0x0200;

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

// Payloads are built as byte ARRAYS and reconstructed into a Lua string inside Lua (via
// __invoke), because wasmoon truncates a JS string at its first null byte when marshalling
// it as a function argument — and these payloads legitimately contain 0 bytes (active slot
// 0, value 0, empty-label length 0).

// set_labels: [titleLen][title bytes][ 8x [labelLen][label bytes] ]
function encodeLabels(title, labels) {
  const clip = (s) => String(s ?? '').slice(0, 255);
  const bytes = [];
  const push = (s) => { bytes.push(s.length); for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 0xff); };
  push(clip(title));
  for (let i = 0; i < 8; i++) push(clip(labels[i]));
  return bytes;
}

// set_values: [activeSlot][ v0..v7 ]
function encodeValues(active, values) {
  const bytes = [active & 0xff];
  for (let i = 0; i < 8; i++) bytes.push((values[i] | 0) & 0xff);
  return bytes;
}

/**
 * Create a preview bound to a canvas (must be 480x272). Returns { render, dispose }.
 * render({ title, labels[8], values[8], active }) redraws the page.
 */
export async function createScreenPreview(canvas) {
  const ctx = canvas.getContext('2d');
  const [strip, engine] = await Promise.all([
    loadImage(stripUrl),
    (async () => {
      const { LuaFactory } = await import('wasmoon');
      return new LuaFactory(luaWasmUrl).createEngine();
    })(),
  ]);

  const api = new ScreenDrawApi(ctx, { [FILMSTRIP_PNG_ID]: strip });
  const lua = engine;

  lua.global.set('draw_rect', nilSafe((x, y, w, h, c) => api.draw_rect(x, y, w, h, c)));
  lua.global.set('draw_text', nilSafe((handle, x, y, w, h) => api.draw_text(handle, x, y, w, h)));
  lua.global.set('draw_image', nilSafe((...a) => api.draw_image(...a)));
  lua.global.set('decode_image', nilSafe((...a) => api.decode_image(...a)));
  lua.global.set('text_data', {
    new: () => api.text_data_new(),
    set: (handle, props) => { api.text_data_set(handle, props); },
  });
  lua.global.set('led_control_set_level_midi', () => {});
  lua.global.set('led_control_set_level', () => {});
  lua.global.set('lua_widget_make_dirty', () => {});

  await lua.doString(MULTI_KNOB_LUA);

  // get_byte is defined in Lua (string.byte) so a payload with null bytes never crosses the
  // JS boundary. __invoke rebuilds the payload string from a byte table inside Lua, then
  // calls the page function — sidestepping wasmoon's null-truncating string marshalling.
  await lua.doString(`
    function get_byte(a, i) local b = string.byte(a, i + 1); if b == nil then return 0 else return b end end
    function __invoke(name, t) local s = ""; for i = 1, #t do s = s .. string.char(t[i]) end; _G[name](s) end
  `);

  const invoke = lua.global.get('__invoke');
  const call = (name, bytes) => invoke(name, bytes);

  call('init', []);
  call('set_mode', [1]);

  return {
    render({ title = 'CEDITOR', labels = [], values = [], active = 0 }) {
      call('set_labels', encodeLabels(title, labels));
      call('set_values', encodeValues(active, values));
      call('draw', []);
    },
    dispose() {
      try { lua.global.close?.(); } catch { /* best effort */ }
    },
  };
}
