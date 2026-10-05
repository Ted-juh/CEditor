// CTRL49 era designs (tools/ctrl49/screen-lab/era-presets): every design's manifest obeys the
// rules the screen lab's preset loader enforces, its Lua is Lua 5.2 and is its template with only
// its GENERATED block changed, and every page renders through the firmware shim from payloads
// shaped as Ctrl49ScreenLab.h builds them — at every encoder position, inside the screen and the
// atlases, decoding each atlas exactly once, and moving where it should; and the arpeggiator's
// piano roll edits a pattern the way it says it does.
//
//   CTRL49_ERA_SHOTS=<dir>   writes a 480x272 PNG of every page of every design there
//   CTRL49_ERA_PREVIEWS=1    writes them into each design folder as preview-<n>-<page>.png
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
const root = path.join(repo, 'tools/ctrl49/screen-lab/era-presets');
const shots = process.env.CTRL49_ERA_SHOTS;
const previews = process.env.CTRL49_ERA_PREVIEWS === '1';
if (shots) fs.mkdirSync(shots, { recursive: true });

// The kind of design: its template, the atlases its crops assume, its pages, what must move
// with the frame counter alone ([page, frames, least distinct pictures]), the arpeggiator's edit
// page, and the visits that make a redraw busiest ([page, values] in order, every one drawn).
const SPECS = {
  era: {
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
};
// The designs this check expects, and their kind. Adding one is deliberate: add it here too.
const EXPECTED = { 'dot-matrix-1983': 'era', 'red-lead-1997': 'era', 'rhythm-box-1980': 'era',
  'swiss-flat-2011': 'era', 'test-bench-1958': 'era', 'walnut-1971': 'era' };
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
for (const spec of Object.values(SPECS)) {
  templates[spec.template] = fs.readFileSync(path.join(root, spec.template), 'utf8');
  luaparse.parse(templates[spec.template], { luaVersion: '5.2' });
}

const names = fs.readdirSync(root).filter((n) => fs.existsSync(path.join(root, n, 'Design.ctrl49preset'))).sort();
assert.deepEqual(names, Object.keys(EXPECTED).sort(), 'the design folders are the ones expected');

const manifests = {};
for (const name of names) {
  const dir = path.join(root, name);
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

  const save = async (name, file) => {
    if (!shots && !previews) return;
    const data = Buffer.from((await page.evaluate(() => window.era.pixels())).split(',')[1], 'base64');
    if (shots) fs.writeFileSync(path.join(shots, `${name}-${file}.png`), data);
    if (previews && file.match(/^\d-/)) fs.writeFileSync(path.join(root, name, `preview-${file}.png`), data);
  };

  for (const name of names) {
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

    {
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

    const decodes = await page.evaluate(() => window.d.draw().decode);
    assert.equal(decodes, 3, `${name}: the three atlases are decoded once, whatever is drawn after`);
    console.log(`  ${name.padEnd(20)} ${summary.join(', ')} calls; busiest ${sweep.most} (${sweep.where}); moves ${JSON.stringify(moves)}`);
  }
  assert.deepEqual(errors, []);
  console.log(`CTRL49 era design checks passed: ${names.length} manifests, ${names.length} Lua 5.2 pages, every page at every encoder position.`);
} finally { await browser.close(); await server.close(); }
