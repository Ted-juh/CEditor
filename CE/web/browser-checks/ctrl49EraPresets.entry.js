// Runs every era design (tools/ctrl49/screen-lab/era-presets/*/Skin.lua) against the firmware
// draw-API shim with its own three atlases, fed with payloads shaped as Ctrl49ScreenLab.h builds
// them. Every call the page makes is checked as it is made: rectangles and images on the
// 480x272 screen, crops inside the decoded atlas, text inside its box, buffers decoded before
// use. Folders are found by glob, so a seventh design is checked without touching this file.
import luaWasmUrl from 'wasmoon/dist/glue.wasm?url';
import { LuaFactory } from 'wasmoon';
import { ScreenDrawApi, AILERON_FACES } from '../src/CE_Application/screen/screenDrawApi.js';

const skins = import.meta.glob('../../../tools/ctrl49/screen-lab/era-presets/*/Skin.lua',
  { query: '?raw', import: 'default', eager: true });
const pngs = import.meta.glob('../../../tools/ctrl49/screen-lab/era-presets/*/{panels,knobs,parts}.png',
  { query: '?url', import: 'default', eager: true });

// As ctrl49Runtime loads them: a grey or palette PNG is a coverage mask the device can tint.
async function load(url) {
  const blob = await (await fetch(url)).blob();
  const head = new Uint8Array(await blob.slice(0, 26).arrayBuffer());
  return { image: await createImageBitmap(blob), tintable: head[25] === 0 || head[25] === 3 };
}

// --- ports of Ctrl49ScreenLab.h (the mjs holds envelope() to the C++ golden) ---------------------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function frame(page, n, enc, last = 0) {
  return [clamp(page, 0, 5), n & 0xff, ...enc.map((v) => clamp(v, 0, 127)), clamp(last, 0, 7), 0, 0, 0, 0, (n >> 8) & 0xff];
}
const ms = (v) => Math.pow(10000, clamp(v, 0, 127) / 127);
const timeText = (v) => (ms(v) < 1000 ? `${Math.round(ms(v))} ms` : `${(ms(v) / 1000).toFixed(1)} s`);
export function envelope(attack, decay, sustain, release) {
  const width = (v) => 8 + clamp(v, 0, 127) * 1.1;
  let a = width(attack), d = width(decay), r = width(release);
  const room = 440 - 40, total = a + d + r;
  if (total > room) { a *= room / total; d *= room / total; r *= room / total; }
  const hold = 440 - a - d - r, level = clamp(sustain, 0, 127) / 127;
  const out = [];
  for (let c = 0; c < 110; c++) {
    const x = c * 4;
    let v;
    if (x < a) v = 1 - Math.exp(-4 * x / a);
    else if (x < a + d) v = level + (1 - level) * Math.exp(-4 * (x - a) / d);
    else if (x < a + d + hold) v = level;
    else v = level * Math.exp(-4 * (x - a - d - hold) / r);
    out.push(Math.round(clamp(v, 0, 1) * 132));
  }
  const col = (x) => clamp(Math.round(x / 4), 0, 109);
  out.push(col(a), col(a + d), col(a + d + hold), Math.round(level * 132));
  for (const s of [timeText(attack), timeText(decay), `${Math.round(level * 100)} %`, timeText(release)]) {
    out.push(s.length, ...[...s].map((ch) => ch.charCodeAt(0)));
  }
  return out;
}

// --- one design, instrumented ----------------------------------------------------------------------
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const measure = document.createElement('canvas').getContext('2d');

async function design(name) {
  const base = `../../../tools/ctrl49/screen-lab/era-presets/${name}/`;
  const assets = {
    576: await load(pngs[`${base}panels.png`]),
    578: await load(pngs[`${base}knobs.png`]),
    580: await load(pngs[`${base}parts.png`]),
  };
  const api = new ScreenDrawApi(ctx, assets);
  const calls = { rect: 0, text: 0, image: 0, decode: 0 };
  const problems = [];
  const decodedSize = new Map();
  const texts = new Map();
  const whole = (...v) => v.every((n) => Number.isInteger(n));
  const onScreen = (x, y, w, h) => x >= 0 && y >= 0 && w >= 0 && h >= 0 && x + w <= 480 && y + h <= 272;
  const report = (what) => { if (problems.length < 40) problems.push(what); };

  const lua = await new LuaFactory(luaWasmUrl).createEngine();
  lua.global.set('draw_rect', (x, y, w, h, c) => {
    calls.rect++;
    if (!whole(x, y, w, h) || !onScreen(x, y, w, h)) report(`rect ${x},${y} ${w}x${h} off the screen or not whole`);
    api.draw_rect(x, y, w, h, c);
  });
  lua.global.set('draw_image', (type, id, x, y, sx, sy, sw, sh, tint) => {
    calls.image++;
    const size = decodedSize.get(id);
    if (type !== 18 || !size) report(`image from buffer ${id} before it was decoded`);
    else if (sx < 0 || sy < 0 || sw <= 0 || sh <= 0 || sx + sw > size[0] || sy + sh > size[1]) report(`crop ${sx},${sy} ${sw}x${sh} outside buffer ${id} (${size})`);
    if (!whole(x, y, sx, sy, sw, sh) || !onScreen(x, y, sw, sh)) report(`image at ${x},${y} ${sw}x${sh} off the screen or not whole`);
    api.draw_image(type, id, x, y, sx, sy, sw, sh, tint);
  });
  lua.global.set('decode_image', (st, sid, dt, did, tint) => {
    calls.decode++;
    const a = assets[sid];
    if (!a) report(`decode of PNG ${sid}, which was not uploaded`);
    else decodedSize.set(did, [a.image.width, a.image.height]);
    api.decode_image(st, sid, dt, did, tint);
  });
  lua.global.set('text_data', {
    new: () => { const h = api.text_data_new(); texts.set(h, {}); return h; },
    set: (h, p) => { api.text_data_set(h, p); Object.assign(texts.get(h), p); },
  });
  lua.global.set('draw_text', (h, x, y, w, hh) => {
    calls.text++;
    const t = texts.get(h);
    if (!whole(x, y, w, hh) || !onScreen(x, y, w, hh)) report(`text "${t?.text}" box ${x},${y} ${w}x${hh} off the screen`);
    if (t && t.text) {
      const face = AILERON_FACES[t.font] ?? AILERON_FACES[9];
      measure.font = `${face.italic ? 'italic ' : ''}${face.weight} ${t.font_size}px Aileron, "Segoe UI", system-ui, sans-serif`;
      const width = measure.measureText(String(t.text)).width;
      if (width > w) report(`text "${t.text}" is ${Math.ceil(width)} px in a ${w} px box`);
      if (t.font_size > hh + 2) report(`text "${t.text}" is ${t.font_size} pt in a ${hh} px tall box`);
    }
    api.draw_text(h, x, y, w, hh);
  });
  await lua.doString(skins[`${base}Skin.lua`]);
  await lua.doString(`
    function get_byte(a, i) local b = string.byte(a, i + 1); if b == nil then return 0 else return b end end
    function __invoke(name, t) local s = ""; for i = 1, #t do s = s .. string.char(t[i]) end; _G[name](s) end`);
  const invoke = lua.global.get('__invoke');
  invoke('init', []);
  return {
    call(fn, bytes) { invoke(fn, bytes); },
    draw() {
      for (const k of ['rect', 'text', 'image']) calls[k] = 0;
      invoke('draw', []);
      return { ...calls, total: calls.rect + calls.text + calls.image };
    },
    problems: () => problems.splice(0),
  };
}

window.era = {
  names: Object.keys(skins).map((k) => k.split('/').at(-2)).sort(),
  envelope, frame, design,
  // A picture, not a flat fill: how many distinct colours the screen shows.
  colours() {
    const d = ctx.getImageData(0, 0, 480, 272).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  },
  pixels: () => canvas.toDataURL(),
};
window.ready = true;
