// Runs the CTRL49 screen lab's Lua pages (tools/ctrl49/screen-lab) against the firmware
// draw-API shim, fed with byte payloads shaped exactly as Ctrl49ScreenLab.h builds them.
import luaWasmUrl from 'wasmoon/dist/glue.wasm?url';
import { LuaFactory } from 'wasmoon';
import { ScreenDrawApi } from '../src/CE_Application/screen/screenDrawApi.js';
import showcaseLua from '../../../tools/ctrl49/screen-lab/Hostage_Showcase.lua?raw';
import stressLua from '../../../tools/ctrl49/screen-lab/Hostage_Stress.lua?raw';
import surfaceAtlas from '../../../tools/ctrl49/screen-lab/surface_atlas.png?url';
import richAtlas from '../../../tools/ctrl49/screen-lab/rich_atlas.png?url';
import labBg from '../../../tools/ctrl49/screen-lab/lab_bg.png?url';
import vuFace from '../../../tools/ctrl49/screen-lab/vu_face.png?url';
import vuNeedle from '../../../tools/ctrl49/screen-lab/vu_needle.png?url';
import stressBlock from '../../../tools/ctrl49/screen-lab/stress_block.png?url';
import logoStrip from '../../../tools/ctrl49/screen-lab/logo_strip.png?url';
import spinnerStrip from '../../../tools/ctrl49/screen-lab/spinner_strip.png?url';

const load = async (url) => createImageBitmap(await (await fetch(url)).blob());

// --- ports of Ctrl49ScreenLab.h (the golden envelope keeps them honest) ------------------------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const WIDTH = 440, COLUMNS = 110, TOP = 132, VU_FRAMES = 48;
export function showcaseFrame(page, frame, enc, last, playhead, vuL, vuR, pads) {
  return [clamp(page, 0, 5), frame & 0xff, ...enc.map((v) => clamp(v, 0, 127)),
    clamp(last, 0, 7), clamp(playhead, 0, 15), clamp(vuL, 0, VU_FRAMES - 1), clamp(vuR, 0, VU_FRAMES - 1), pads,
    (frame >> 8) & 0xff];
}
const ms = (v) => Math.pow(10000, clamp(v, 0, 127) / 127);
const timeText = (v) => (ms(v) < 1000 ? `${Math.round(ms(v))} ms` : `${(ms(v) / 1000).toFixed(1)} s`);
export function envelope(attack, decay, sustain, release) {
  const width = (v) => 8 + clamp(v, 0, 127) * 1.1;
  let a = width(attack), d = width(decay), r = width(release);
  const room = WIDTH - 40, total = a + d + r;
  if (total > room) { a *= room / total; d *= room / total; r *= room / total; }
  const hold = WIDTH - a - d - r, level = clamp(sustain, 0, 127) / 127;
  const out = [];
  for (let c = 0; c < COLUMNS; c++) {
    const x = c * 4;
    let v;
    if (x < a) v = 1 - Math.exp(-4 * x / a);
    else if (x < a + d) v = level + (1 - level) * Math.exp(-4 * (x - a) / d);
    else if (x < a + d + hold) v = level;
    else v = level * Math.exp(-4 * (x - a - d - hold) / r);
    out.push(Math.round(clamp(v, 0, 1) * TOP));
  }
  const col = (x) => clamp(Math.round(x / 4), 0, COLUMNS - 1);
  out.push(col(a), col(a + d), col(a + d + hold), Math.round(level * TOP));
  for (const s of [timeText(attack), timeText(decay), `${Math.round(level * 100)} %`, timeText(release)]) {
    out.push(s.length, ...[...s].map((ch) => ch.charCodeAt(0)));
  }
  return out;
}

// --- the page runner ----------------------------------------------------------------------------
const assets = {
  0x0220: await load(surfaceAtlas), 0x0230: await load(labBg), 0x0232: await load(richAtlas),
  0x0234: await load(vuFace), 0x0236: await load(vuNeedle),
  0x0238: await load(logoStrip), 0x023a: await load(spinnerStrip),
};
const block = await load(stressBlock);
for (let i = 0; i < 8; i++) assets[0x0250 + i] = block;

async function page(source) {
  const api = new ScreenDrawApi(document.getElementById('screen').getContext('2d'), assets);
  const calls = { rect: 0, text: 0, image: 0, decode: 0 };
  const lua = await new LuaFactory(luaWasmUrl).createEngine();
  lua.global.set('draw_rect', (...a) => { calls.rect++; api.draw_rect(...a); });
  lua.global.set('draw_text', (...a) => { calls.text++; api.draw_text(...a); });
  lua.global.set('draw_image', (...a) => { calls.image++; api.draw_image(...a); });
  lua.global.set('decode_image', (...a) => { calls.decode++; api.decode_image(...a); });
  lua.global.set('text_data', { new: () => api.text_data_new(), set: (h, p) => { api.text_data_set(h, p); } });
  await lua.doString(source);
  // As the preview does: payloads cross into Lua as byte tables and become strings in Lua,
  // because wasmoon truncates a JS string at its first zero byte.
  await lua.doString(`
    function get_byte(a, i) local b = string.byte(a, i + 1); if b == nil then return 0 else return b end end
    function __invoke(name, t) local s = ""; for i = 1, #t do s = s .. string.char(t[i]) end; _G[name](s) end`);
  const invoke = lua.global.get('__invoke');
  invoke('init', []);
  return {
    call(name, bytes) { invoke(name, bytes); },
    draw() { for (const k of Object.keys(calls)) if (k !== 'decode') calls[k] = 0; invoke('draw', []); return { ...calls }; },
  };
}

window.lab = {
  envelope, showcaseFrame,
  showcase: await page(showcaseLua),
  stress: await page(stressLua),
  // How many distinct colours the screen shows: a page that failed to draw is one flat colour.
  colours() {
    const d = document.getElementById('screen').getContext('2d').getImageData(0, 0, 480, 272).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  },
};
window.ready = true;
