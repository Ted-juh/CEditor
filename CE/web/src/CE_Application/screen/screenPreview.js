// Live CTRL49 screen preview: runs the actual multi-knob Lua page (the same source that
// ships to the keyboard) against the draw-API shim on an HTML5 canvas. Editing a binding
// or value re-runs the real Lua, so the preview is pixel-faithful to the hardware.
//
// Uses its own wasmoon engine (isolated from the panel-script runtime, per the runtime's
// deferred-sandboxing note). Injects the firmware draw primitives as Lua globals exactly
// as panelRuntime.js injects its host API.

import { createCtrl49Screen } from './ctrl49Runtime.js';
import { MULTI_KNOB_LUA } from './multiKnobLua.js';
import stripUrl from './knob_strip.png?url';

const FILMSTRIP_PNG_ID = 0x0200;

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
  const screen = await createCtrl49Screen(canvas, {
    lua: MULTI_KNOB_LUA,
    assets: { [FILMSTRIP_PNG_ID]: stripUrl },
  });

  screen.call('init', []);
  screen.call('set_mode', [1]);

  return {
    render({ title = 'CEDITOR', labels = [], values = [], active = 0 }) {
      screen.call('set_labels', encodeLabels(title, labels));
      screen.call('set_values', encodeValues(active, values));
      screen.call('draw', []);
    },
    dispose() {
      screen.dispose();
    },
  };
}
