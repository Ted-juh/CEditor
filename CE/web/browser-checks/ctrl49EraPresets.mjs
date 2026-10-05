// CTRL49 era designs (tools/ctrl49/screen-lab/era-presets) and HoSTage feature mockups
// (screen-lab/feature-mockups): every design's manifest obeys the rules the screen lab's preset
// loader enforces, its Lua is Lua 5.2 and is its template with only its GENERATED block changed,
// and every page renders through the firmware shim from payloads shaped as Ctrl49ScreenLab.h
// builds them — at every encoder position, inside the screen and the atlases, decoding each atlas
// exactly once, and moving where it should; the arpeggiator's piano roll edits a pattern the way
// it says it does, and the feature pages answer their encoders the way they say they do.
//
//   CTRL49_ERA_SHOTS=<dir>   writes a 480x272 PNG of every page of every design there
//   CTRL49_ERA_PREVIEWS=1    writes them into each design folder as preview-<n>-<page>.png
//   CTRL49_ERA_ONLY=<a,b>    renders only those designs (every manifest is still checked)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import luaparse from 'luaparse';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(here, '../../..');
const lab = path.join(repo, 'tools/ctrl49/screen-lab');
const shots = process.env.CTRL49_ERA_SHOTS;
const previews = process.env.CTRL49_ERA_PREVIEWS === '1';
const only = process.env.CTRL49_ERA_ONLY ? process.env.CTRL49_ERA_ONLY.split(',') : null;
if (shots) fs.mkdirSync(shots, { recursive: true });

// The kind of design: the folder its designs and template live in, the generated tables every key
// of which the template reads must be given, the atlases its crops assume, its pages, what must
// move with the frame counter alone ([page, frames, least distinct pictures]), the arpeggiator's
// edit page, and the visits that make a redraw busiest ([page, values] in order, every one drawn).
const SPECS = {
  era: {
    root: 'era-presets', tables: ['T', 'L'],
    template: 'EraSkin.lua', pages: ['controls', 'mixer', 'envelope', 'arp-edit', 'arp-play'], envelope: 2,
    atlases: { 'panels.png': [480, 816], 'knobs.png': [80, 5120], 'parts.png': [480, 732] },
    moving: [[1, [300, 301, 302, 303], 4], [3, [0, 4, 8, 12, 16], 4], [4, [0, 4, 8, 12, 16], 4]],
    editPage: 3,
    // the arpeggiator: the longest pattern with every gate and octave at the top, then the
    // scroll, key and rate at their ends, the cursor on the last step, and back
    busiest: [[4, [127, 0, 0, 127, 127, 127, 64, 64]], [4, [127, 127, 127, 0, 0, 0, 64, 64]],
      [3, [0, 0, 127, 127, 0, 127, 127, 127]], [3, [127, 127, 0, 0, 127, 0, 0, 0]],
      [4, [127, 80, 127, 127, 64, 0, 64, 64]], [3, [64, 64, 64, 64, 52, 64, 72, 60]]],
  },
  feature: {
    root: 'feature-mockups', tables: ['T', 'L', 'S', 'D'],
    template: 'FeatureSkin.lua', pages: ['atlas', 'motion', 'capture', 'stage', 'chords'], envelope: null,
    atlases: { 'panels.png': [480, 816], 'tint.png': [80, 5184], 'parts.png': [480, 544] },
    moving: [[1, [0, 4, 8, 12, 16], 4], [2, [0, 4, 8, 12, 16], 4], [3, [0, 4, 8, 12, 16], 3], [4, [0, 4, 8, 12, 16], 4]],
    // the atlas with the biggest box in the crowd, every source at full depth either way, sixteen
    // bars kept, the last song, every key and scale's widest chords
    busiest: [[0, [70, 110, 127, 127, 127, 64, 64, 64]], [0, [20, 20, 127, 0, 0, 64, 64, 64]],
      [1, [127, 127, 127, 127, 127, 127, 127, 127]], [1, [0, 0, 0, 0, 0, 0, 0, 0]],
      [2, [127, 0, 127, 127, 64, 64, 64, 64]], [2, [127, 127, 0, 0, 64, 64, 64, 64]],
      [3, [127, 64, 64, 64, 64, 64, 64, 64]], [4, [127, 127, 64, 64, 64, 64, 64, 64]], [4, [60, 90, 64, 64, 64, 64, 64, 64]]],
    // moments worth a picture of their own, on a fresh copy: [page, frame, values, name]
    moments: [[2, 50, [56, 0, 80, 0, 70, 64, 64, 64], 'kept'], [3, 450, [24, 64, 64, 64, 64, 64, 64, 64], 'failover'],
      [0, 37, [20, 30, 64, 40, 90, 64, 64, 64], 'dark-sound'], [0, 37, [118, 120, 30, 0, 64, 64, 64, 64], 'bright-sound']],
    // The pages answer their encoders: E5 on CAPTURE keeps the box and says so once; the atlas's
    // box finds more sounds the bigger it is, and lists eight; the chord page names the chord the
    // progression holds at that moment, in the key E1 and E2 chose.
    async answers({ fresh, at, D }) {
      await fresh();
      const inBox = (texts) => Number(texts.find((t) => t.endsWith(' IN BOX')).split(' ')[0]);
      const out = {};
      await at(2, D[2]);
      out.kept = (await at(2, turned(D[2], { 4: 70 }))).find((t) => t.startsWith('KEPT')) ?? null;
      out.notKept = (await at(2, turned(D[2], { 4: 70 }), 200)).some((t) => t.startsWith('KEPT'));
      const small = await at(0, turned(D[0], { 2: 0 })), big = await at(0, turned(D[0], { 2: 127 }));
      out.boxGrows = inBox(big) > inBox(small);
      out.listed = big.filter((t) => /^[A-Z][a-z]+ [A-Z][a-z]+ \d+$/.test(t)).length;
      const chords = await at(4, D[4]), k = chords.indexOf('KEY');
      out.chord = chords.slice(k - 2, k);
      out.key = chords[k + 1] ?? null;
      return [out, { kept: 'KEPT 8 BARS AS LOOP A,  QUANTISED 1/16', notKept: false, boxGrows: true, listed: 8,
        chord: ['Am7', 'i7   TONIC'], key: 'A MINOR' }];
    },
  },
  rig: {
    root: 'feature-mockups', tables: ['T', 'L', 'S', 'D'],
    template: 'RigSkin.lua', pages: ['layers', 'effects', 'soundcheck', 'discover', 'changes'], envelope: null,
    atlases: { 'panels.png': [480, 816], 'tint.png': [128, 64], 'parts.png': [480, 544] },
    moving: [[0, [0, 20, 40, 60, 80], 3], [1, [0, 4, 8, 12, 16], 4], [3, [0, 4, 8, 12, 16], 2]],
    // every part at its widest and narrowest, every slot at full and none, the song with the most
    // parts, the furthest reach of every kind, every change half heard
    busiest: [[0, [0, 0, 127, 127, 0, 127, 64, 64]], [0, [127, 127, 0, 0, 127, 0, 64, 64]],
      [1, [0, 127, 127, 127, 127, 64, 64, 64]], [1, [127, 0, 0, 0, 0, 64, 64, 64]], [1, [64, 127, 0, 127, 0, 64, 64, 64]],
      [2, [64, 127, 64, 64, 64, 64, 64, 64]], [3, [0, 127, 0, 64, 64, 64, 64, 64]], [3, [127, 0, 127, 64, 64, 64, 64, 64]],
      [4, [64, 127, 64, 0, 64, 64, 64, 64]]],
    moments: [[0, 37, [0, 50, 127, 64, 0, 127, 64, 64], 'bass'], [0, 38, [64, 50, 127, 64, 0, 127, 64, 64], null],
      [1, 37, [90, 62, 70, 60, 45, 64, 64, 64], 'delay'],
      [2, 10, [64, 70, 70, 64, 64, 64, 64, 64], null], [2, 40, [64, 70, 70, 64, 64, 64, 64, 64], 'checking'],
      [3, 37, [0, 0, 90, 64, 64, 64, 64, 64], 'strings'], [4, 37, [64, 30, 64, 30, 64, 64, 64, 64], 'half-way']],
    // The pages answer their encoders. LAYERS: an encoder takes a range over only once it reaches
    // it, then carries it; the split is named. EFFECTS: E6 bypasses the slot and back. SOUNDCHECK:
    // the set's verdict, the problem and what to do, and E3 checks again. DISCOVER: eight listed,
    // and E3 keeps them to one kind; E4 keeps one. CHANGES: the count follows the history, and E3
    // undoes one change.
    async answers({ fresh, at, D }) {
      await fresh();
      const after = (texts, label) => texts[texts.indexOf(label) + 1];
      const out = {};
      const start = await at(0, D[0]);
      out.split = start[1].split('   ')[0];
      const part1 = await at(0, turned(D[0], { 0: 0 }));
      out.part = after(part1, 'PART');
      out.low = [after(part1, 'LOW')];
      out.low.push(after(await at(0, turned(D[0], { 0: 0, 1: 100 })), 'LOW'));
      out.low.push(after(await at(0, turned(D[0], { 0: 0, 1: 0 })), 'LOW'));
      out.low.push(after(await at(0, turned(D[0], { 0: 0, 1: 10 })), 'LOW'));
      const fx = await at(1, D[1]);
      out.slot = fx.includes('2  BUS COMP') && !fx.includes('BYPASSED');
      out.bypass = [(await at(1, turned(D[1], { 5: 70 }))).includes('BYPASSED'), (await at(1, turned(D[1], { 5: 75 }))).includes('BYPASSED')];
      const check = await at(2, D[2]);
      out.verdict = ['8 READY', '2 TO LOOK AT', '2 WILL NOT PLAY'].every((t) => check.includes(t));
      out.problem = [check.includes('MIDI PORT USB MIDI 2 IS GONE'), check.includes('PLUG IT IN, OR PICK ANOTHER PORT')];
      out.again = [(await at(2, turned(D[2], { 2: 70 }), 100)).includes('CHECKING 1 OF 12'),
        (await at(2, turned(D[2], { 2: 70 }), 200)).includes('2 WILL NOT PLAY')];
      const names = (texts) => texts.filter((t) => /^[A-Z][a-z]+ [A-Z][A-Za-z]+ \d+$/.test(t));
      out.listed = names(await at(3, D[3])).length;
      out.pads = names(await at(3, turned(D[3], { 2: 20 }))).map((t) => t.split(' ')[1]);
      out.kept = (await at(3, turned(D[3], { 2: 20, 3: 70 }))).some((t) => t.startsWith('KEPT ') && t.endsWith(' IN FAVOURITES'));
      out.changes = [(await at(4, D[4]))[1], (await at(4, turned(D[4], { 3: 30 })))[1], (await at(4, turned(D[4], { 3: 127 })))[1]];
      const undone = await at(4, turned(D[4], { 2: 70 }));
      out.undo = [undone[1], undone.some((t) => t.startsWith('UNDONE, BACK TO'))];
      return [out, { split: 'SPLIT AT G3', part: '1 / 5', low: ['C2', 'C2', 'C2', 'E2'], slot: true, bypass: [true, false],
        verdict: true, problem: [true, true], again: [true, true], listed: 8, pads: Array(8).fill('Pad'), kept: true,
        changes: ['9 CHANGES SINCE SAVED', '8 CHANGES SINCE SAVED', 'NOTHING CHANGED'], undo: ['8 CHANGES SINCE SAVED', true] }];
    },
  },
};
// The values a page was given, with some encoders turned.
const turned = (values, changes) => Object.assign(values.slice(), changes);
// The designs this check expects, and their kind. Adding one is deliberate: add it here too.
const EXPECTED = { 'blueprint-1965': 'era', 'dot-matrix-1983': 'era', 'metro-tiles-2012': 'era',
  'midnight-2020': 'era', 'neo-brutal-2023': 'era', 'red-lead-1997': 'era', 'rhythm-box-1980': 'era',
  'swiss-flat-2011': 'era', 'test-bench-1958': 'era', 'walnut-1971': 'era', 'hostage-features': 'feature',
  'hostage-rig': 'rig' };
const MEMORY_CEILING = 8 * 1024 * 1024;     // the preset loader's software guard, not a device limit
const MAX_CALLS = 600;

// --- the manifests, as the preset loader reads them -------------------------------------------------
function ini(text) {
  const out = {};
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const head = line.match(/^\[(.+)\]$/);
    if (head) { section = out[head[1]] = {}; continue; }
    const kv = line.match(/^([^=]+)=(.*)$/);
    assert.ok(kv && section, `unreadable line "${line}"`);
    section[kv[1].trim()] = kv[2].trim();
  }
  return out;
}
const int = (s) => (/^-?\d+$/.test(s ?? '') ? Number(s) : NaN);

function png(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colourType: b[25] };
}

const block = /-- BEGIN GENERATED[\s\S]*?-- END GENERATED/;
const templates = {};
const folders = {};
for (const spec of Object.values(SPECS)) {
  templates[spec.template] = fs.readFileSync(path.join(lab, spec.root, spec.template), 'utf8');
  luaparse.parse(templates[spec.template], { luaVersion: '5.2' });
}
for (const dir of new Set(Object.values(SPECS).map((spec) => spec.root))) {
  const root = path.join(lab, dir);
  for (const n of fs.readdirSync(root)) {
    if (!fs.existsSync(path.join(root, n, 'Design.ctrl49preset'))) continue;
    assert.ok(!folders[n], `${n}: one design of that name`);
    folders[n] = path.join(root, n);
  }
}

const names = Object.keys(folders).sort();
assert.deepEqual(names, Object.keys(EXPECTED).sort(), 'the design folders are the ones expected');
for (const name of names) {
  assert.equal(path.basename(path.dirname(folders[name])), SPECS[EXPECTED[name]].root, `${name}: lives in ${SPECS[EXPECTED[name]].root}`);
}

const manifests = {};
for (const name of names) {
  const dir = folders[name];
  const spec = SPECS[EXPECTED[name]];
  const m = ini(fs.readFileSync(path.join(dir, 'Design.ctrl49preset'), 'latin1'));
  const p = m.Preset;
  assert.ok(p, `${name}: [Preset]`);
  assert.equal(int(p.version), 1, `${name}: version`);
  assert.equal(int(p.width), 480, `${name}: width`);
  assert.equal(int(p.height), 272, `${name}: height`);
  const pages = int(p.pages), fps = int(p.fps), count = int(p.assets);
  assert.ok(pages >= 1 && pages <= 6, `${name}: 1-6 pages`);
  assert.equal(pages, spec.pages.length, `${name}: ${spec.pages.length} pages`);
  assert.ok(int(p.envelopePage) >= 0 && int(p.envelopePage) < pages, `${name}: envelopePage is a page`);
  assert.ok(fps >= 5 && fps <= 30, `${name}: fps 5-30`);
  const beside = (f) => f && !/[\\/]|\.\./.test(f) && fs.existsSync(path.join(dir, f));
  assert.ok(beside(p.lua), `${name}: the Lua is a file beside the manifest`);

  const ids = new Set();
  let memory = 0;
  for (let i = 0; i < count; i++) {
    const a = m[`Asset${i}`];
    assert.ok(a, `${name}: [Asset${i}]`);
    const id = int(a.id);
    assert.ok(id >= 0 && id < 1024 && !ids.has(id), `${name}: asset ${i} id ${a.id} is unique and below 1024`);
    ids.add(id);
    assert.ok(beside(a.file), `${name}: asset ${a.file} is a file beside the manifest`);
    const info = png(path.join(dir, a.file));
    assert.deepEqual([info.width, info.height], spec.atlases[a.file], `${name}: ${a.file} has the size the crops assume`);
    memory += info.width * info.height * 4;
  }
  assert.ok(memory <= MEMORY_CEILING, `${name}: ${memory} bytes decoded is within the 8 MiB guard`);

  const defaults = [];
  for (let i = 0; i < pages; i++) {
    const pg = m[`Page${i}`];
    assert.ok(pg && pg.title, `${name}: [Page${i}] has a title`);
    const enc = int(pg.encoders);
    assert.ok(enc >= 1 && enc <= 8, `${name}: page ${i} encoders 1-8`);
    const values = [];
    for (let e = 1; e <= 8; e++) {
      const v = int(pg[`e${e}`]);
      assert.ok(v >= 0 && v <= 127, `${name}: page ${i} e${e} is 0-127`);
      values.push(v);
    }
    defaults.push({ encoders: enc, values });
  }

  const lua = fs.readFileSync(path.join(dir, p.lua), 'utf8');
  luaparse.parse(lua, { luaVersion: '5.2' });
  assert.equal(lua.replace(block, ''), templates[spec.template].replace(block, ''),
    `${name}: Skin.lua is ${spec.template} with only its GENERATED block changed (regenerate, do not hand-edit)`);
  assert.equal(Number(lua.match(/\bfps = (\d+)/)[1]), fps, `${name}: the Lua clock counts the manifest's fps`);
  // Every theme colour, layout value (and, where the template has them, sprite and data value) the
  // template reads is in this design's GENERATED block: a missing one is nil on the device (the
  // preview would quietly draw it white).
  for (const table of spec.tables) {
    const used = templates[spec.template].replace(block, '');
    const needed = new Set([...used.matchAll(new RegExp(`\\b${table}\\.(\\w+)`, 'g'))].map((m) => m[1]));
    const body = lua.match(new RegExp(`local ${table} = \\{([\\s\\S]*?)\\n\\}`))[1];
    const given = new Set([...body.matchAll(/^\s+(\w+) = /gm)].map((m) => m[1]));
    const missing = [...needed].filter((k) => !given.has(k));
    assert.deepEqual(missing, [], `${name}: ${table} gives every key ${spec.template} reads`);
  }
  const luaDefaults = lua.match(/\bdefaults = \{ (.*) \},\n/)[1];
  assert.equal(luaDefaults, defaults.map((d) => `{ ${d.values.join(', ')} }`).join(', '), `${name}: the Lua knows the manifest's starting values`);
  manifests[name] = { defaults, memory, spec };
  console.log(`  ${name.padEnd(20)} manifest ok, ${Math.round(memory / 1024)} KiB decoded (conservative)`);
}

// --- rendering ----------------------------------------------------------------------------------------
const cppTest = fs.readFileSync(path.join(repo, 'CE/tests/Ctrl49ScreenLabTests.cpp'), 'utf8');
const golden = cppTest.match(/kGoldenEnvelope \{([^}]*)\}/)[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number);

const server = await createServer({ configFile: false, root: here,
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-ctrl49-era', import.meta.url)),
  optimizeDeps: { entries: ['ctrl49EraPresets.html'] },
  server: { host: '127.0.0.1', port: 18767, fs: { allow: [repo] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }));
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ctrl49EraPresets.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  assert.deepEqual(await page.evaluate(() => window.era.names), names, 'the preview finds the same designs');
  assert.deepEqual(await page.evaluate(() => window.era.envelope(32, 64, 80, 40)), golden,
    'the preview builds the same envelope bytes the tool sends');

  // A fresh copy of a design, loaded and in mode 1, for the answers and moments; at() turns its
  // encoders on a page at a frame and returns the texts it drew.
  const fresh = (name) => page.evaluate(async (name) => {
    window.f = await window.era.design(name);
    for (let i = 0; i < 4; i++) window.f.draw();
    window.f.call('set_mode', [1]);
  }, name);
  const at = (p, values, frame = 37) => page.evaluate(({ p, values, frame }) => {
    window.f.call('set_frame', window.era.frame(p, frame, values, 0));
    return window.f.draw().texts;
  }, { p, values, frame });

  const save = async (name, file) => {
    if (!shots && !previews) return;
    const data = Buffer.from((await page.evaluate(() => window.era.pixels())).split(',')[1], 'base64');
    if (shots) fs.writeFileSync(path.join(shots, `${name}-${file}.png`), data);
    if (previews && file.match(/^\d-/)) fs.writeFileSync(path.join(folders[name], `preview-${file}.png`), data);
  };

  const rendered = only ? names.filter((name) => only.includes(name)) : names;
  assert.ok(rendered.length > 0, 'CTRL49_ERA_ONLY names a design');
  for (const name of rendered) {
    const { defaults, spec } = manifests[name];
    const pages = spec.pages;
    const D = defaults.map((d) => d.values);
    await page.evaluate(async (name) => { window.d = await window.era.design(name); }, name);

    // Loading: the first redraw decodes nothing, each of the next three decodes one atlas.
    const loading = await page.evaluate(() => [0, 1, 2, 3].map(() => window.d.draw().decode));
    assert.deepEqual(loading, [0, 1, 2, 3], `${name}: one atlas decoded per redraw after the first`);
    await save(name, 'loading');

    // Each page at the manifest's starting values, E1 the last moved.
    await page.evaluate((env) => { window.d.call('set_mode', [1]); if (env) window.d.call('set_envelope', window.era.envelope(...env)); },
      spec.envelope === null ? null : D[spec.envelope].slice(0, 4));
    const summary = [];
    for (let p = 0; p < pages.length; p++) {
      const calls = await page.evaluate(({ p, enc }) => { window.d.call('set_frame', window.era.frame(p, 37, enc, 0)); return window.d.draw(); }, { p, enc: D[p] });
      const colours = await page.evaluate(() => window.era.colours());
      assert.ok(calls.total > 10, `${name} ${pages[p]} draws`);
      assert.ok(colours > 12, `${name} ${pages[p]} is a picture, not a flat fill (${colours} colours)`);
      await save(name, `${p + 1}-${pages[p]}`);
      summary.push(`${pages[p].slice(0, 3)} ${calls.total}`);
    }

    // Every encoder through all 128 positions on every page, the others at their defaults; on
    // an envelope page the host sends a new envelope with each move, so this does too. Then the
    // ADSR corners, the busiest visits over a run of frames, and the frame counter's wrap.
    const sweep = await page.evaluate(({ D, enc, envelope, busiest }) => {
      const d = window.d, era = window.era;
      let most = 0, where = '';
      const draw = (p, values, last, frame = 200) => {
        if (p === envelope) d.call('set_envelope', era.envelope(...values.slice(0, 4)));
        d.call('set_frame', era.frame(p, frame, values, last));
        const c = d.draw();
        if (c.total > most) { most = c.total; where = `page ${p} ${values.join(',')}`; }
      };
      for (let p = 0; p < D.length; p++) {
        for (let e = 0; e < enc[p]; e++) {
          for (let v = 0; v <= 127; v++) {
            const values = D[p].slice();
            values[e] = v;
            draw(p, values, e);
          }
        }
      }
      if (envelope !== null) {
        for (let k = 0; k < 16; k++) draw(envelope, [k & 1, k & 2, k & 4, k & 8].map((b) => (b ? 127 : 0)).concat([64, 64, 64, 64]), k % 4);
      }
      for (const [p, values] of busiest) {
        for (let f = 0; f < 64; f += 3) draw(p, values, 0, f);
      }
      for (const f of [0, 1, 255, 256, 65535]) for (let p = 0; p < D.length; p++) draw(p, D[p], 7, f);
      for (let p = 0; p < D.length; p++) draw(p, D[p], 0);       // back to the starting values
      return { most, where, problems: d.problems() };
    }, { D, enc: defaults.map((d) => d.encoders), envelope: spec.envelope, busiest: spec.busiest });
    assert.deepEqual(sweep.problems, [], `${name}: every call inside the screen, the atlases and its text box`);
    assert.ok(sweep.most < MAX_CALLS, `${name}: at most ${sweep.most} draw calls per redraw (${sweep.where})`);

    // Things that move with the frame counter alone. Fifteen frames is a second at the
    // manifest's rate.
    const moves = {};
    for (const [p, frames, least] of spec.moving) {
      moves[pages[p]] = await page.evaluate(({ p, frames, values }) => {
        const d = window.d, era = window.era;
        return new Set(frames.map((f) => { d.call('set_frame', era.frame(p, f, values, 0)); d.draw(); return era.pixels(); })).size;
      }, { p, frames, values: D[p] });
      assert.ok(moves[pages[p]] >= least, `${name}: ${pages[p]} moves with the clock (${moves[pages[p]]} pictures in ${frames.length})`);
    }

    if (spec.editPage !== undefined) {
      // Editing: on a fresh copy, step 1 holds C3 and E2 sits on C4. Turning E2 away from C3
      // leaves the step alone (a ghost shows where E2 is); once E2 reaches C3 it picks the note up
      // and carries it. An empty step takes E2's note at once. E4 to OFF empties a step.
      const edits = await page.evaluate(async ({ name, D, p }) => {
        const d = await window.era.design(name), era = window.era;
        for (let i = 0; i < 4; i++) d.draw();
        d.call('set_mode', [1]);
        const e = D[p].slice();
        const at = (changes) => { Object.assign(e, changes); d.call('set_frame', era.frame(p, 50, e, 1)); return d.draw().texts; };
        const note = (texts) => texts[texts.indexOf('NOTE') + 1];
        const v = (n) => (n - 28) * 2;                          // E2's value for note n
        const out = { start: note(at({})) };
        out.away = note(at({ 1: v(66) }));                       // up, away from C3: not picked up
        out.reached = note(at({ 1: v(48) }));                    // down to C3: picked up
        out.carried = note(at({ 1: v(50) }));                    // and carried to D3
        out.emptyStep = note(at({ 0: Math.ceil(4 * 128 / 32) })); // step 5 is a rest
        out.placed = note(at({ 1: v(55) }));                     // so E2 places G3 at once
        out.offed = note(at({ 3: 0 }));                          // E4 to OFF: the step is empty
        return out;
      }, { name, D, p: spec.editPage });
      assert.deepEqual(edits, { start: 'C3', away: 'C3', reached: 'C3', carried: 'D3', emptyStep: '--', placed: 'G3', offed: '--' },
        `${name}: E2 picks a step's note up only once it reaches it; an empty step takes it at once`);
    }

    if (spec.answers) {
      const [said, expected] = await spec.answers({ fresh: () => fresh(name), at, D });
      assert.deepEqual(said, expected, `${name}: the pages answer their encoders the way they say they do`);
      await fresh(name);
      for (const [p, f, values, label] of spec.moments) {
        await at(p, values, f);
        if (label) await save(name, `${p + 1}-${pages[p]}-${label}`);
      }
      assert.deepEqual(await page.evaluate(() => window.f.problems()), [], `${name}: the moments draw inside the screen`);
    }

    const decodes = await page.evaluate(() => window.d.draw().decode);
    assert.equal(decodes, 3, `${name}: the three atlases are decoded once, whatever is drawn after`);
    console.log(`  ${name.padEnd(20)} ${summary.join(', ')} calls; busiest ${sweep.most} (${sweep.where}); moves ${JSON.stringify(moves)}`);
  }
  assert.deepEqual(errors, []);
  console.log(`CTRL49 era design checks passed: ${names.length} manifests, ${rendered.length} designs rendered, every page at every encoder position.`);
} finally { await browser.close(); await server.close(); }
