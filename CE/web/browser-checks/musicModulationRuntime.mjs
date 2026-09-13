/** Rendered pass over the stateful music and modulation components: do they mount, draw, and
 *  survive an edit to the state they carry? The node suite covers their models; this covers the
 *  renderers, which is where a model that is right can still paint nothing. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = process.env.CE_MUSIC_MOD_URL ? null : await createServer({ root, configFile: join(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 0, strictPort: false } });
if (server) await server.listen();
const url = process.env.CE_MUSIC_MOD_URL || `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
  : process.platform === 'win32' ? { channel: 'msedge' }
    : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
const settle = () => page.waitForTimeout(120);

// Every component that carries state of its own rather than a single value.
const STATEFUL = ['StepSequencer', 'Envelope', 'Turing', 'Orbit', 'Kinetic', 'Looper', 'Matrix',
  'Constellation', 'Timbre', 'Arp', 'ChordPad', 'DrumPads', 'Phrase', 'Recorder', 'Harmoniser',
  'SplitZone', 'Setlist', 'NoteRibbon', 'Keyboard'];

const insert = (type) => page.evaluate(async (type) => {
  const { panels } = await import('/src/CE_Application/stores/panels.js');
  const { addControl } = await import('/src/CE_Application/stores/controls.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  // A new control nests under whatever container is selected, so walk Children too.
  const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
    const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
  const all = () => flat(get(panels).flatMap((p) => p.controls ?? []));
  const before = new Set(all().map((c) => c._children.Core.id));
  addControl(type);
  const made = all().find((c) => !before.has(c._children.Core.id));
  return made ? made._children.Core.id : `NONE:panels=${get(panels).length},controls=${all().length}`;
}, type);

const rendered = (id) => page.evaluate((id) => {
  const el = document.querySelector(`[data-control-id="${id}"], #${CSS.escape(id)}`);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  // Shape-agnostic on purpose. Custom components draw with div.interactive-part, the stock
  // renderers use svg/canvas, and a selector that names either misses the other — which is exactly
  // how a first version reported twelve perfectly good components as blank.
  const painted = [...el.querySelectorAll('*')]
    .filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0; }).length;
  return { found: true, w: Math.round(r.width), h: Math.round(r.height), painted };
}, id);

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.app', { timeout: 60000 });
  await settle();
  // A fresh app has no panel, and addControl has nowhere to put a control without one.
  await page.evaluate(async () => {
    const { panels, addPanel } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    if (!get(panels).length) addPanel();
  });
  await settle();

  const ok = [], missing = [], blank = [];
  for (const type of STATEFUL) {
    const errorsBefore = failures.length;
    const id = await insert(type);
    await settle();
    assert.ok(id && !id.startsWith('NONE:'), `${type}: addControl produced no control (${id})`);
    const r = await rendered(id);
    if (!r.found) missing.push(type);
    else if (r.w === 0 || r.h === 0) blank.push(`${type} (${r.w}x${r.h})`);
    else ok.push(type);
    assert.equal(failures.length, errorsBefore, `${type} threw while rendering: ${failures.slice(errorsBefore).join(' | ')}`);
  }
  console.log(`  ok  ${ok.length}/${STATEFUL.length} stateful components mount and occupy space`);
  assert.deepEqual(missing, [], 'components with no element in the DOM');
  assert.deepEqual(blank, [], 'components rendered at zero size');

  // The state itself: a sequencer cell toggled through the model must reach the document and survive.
  const seqId = await insert('StepSequencer');
  await settle();
  const cells = await page.evaluate(async (id) => {
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    const { updateControlProperty } = await import('/src/CE_Application/stores/controls.js');
    const ss = await import('/src/CE_Application/utils/stepSequencerLayout.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const find = () => flat(get(panels).flatMap((p) => p.controls ?? [])).find((c) => c._children.Core.id === id);
    const track = (ss.sequencerTracks(find())[0]?.id) ?? 't0';
    let pattern = ss.sequencerPattern(find());
    for (const step of [0, 4, 8, 12]) pattern = ss.toggleCell(pattern, track, step, { velocity: 111 });
    updateControlProperty(id, 'StepSequencer.pattern', pattern);
    const after = ss.sequencerPattern(find());
    return [0, 4, 8, 12].filter((s) => after?.[ss.cellKey(track, s)] !== undefined).length;
  }, seqId);
  assert.equal(cells, 4, 'toggled sequencer cells did not survive the document write');
  console.log('  ok  a sequencer pattern edit reaches the document and reads back');

  // A renderer that mounts but ignores the model is the real risk. Derive the property to change
  // from the type's OWN section rather than naming one — a guessed path proves nothing when it is
  // absent, which is exactly how the first version of this check produced nine false negatives.
  const inert = [], unprobed = [];
  for (const type of STATEFUL) {
    const id = await insert(type);
    await settle();
    const plan = await page.evaluate(async ({ id, type }) => {
      const { createControl } = await import('/src/CE_Application/models/componentTypes.js');
      const section = createControl(type)._children?.[type];
      if (!section) return null;
      for (const [key, value] of Object.entries(section)) {
        if (key.startsWith('_')) continue;
        if (typeof value === 'number' && Number.isFinite(value)) {
          // `phase` is a 0..1 loop clock (sectionDefaults.js), so +1 lands on the SAME point of the
          // cycle and redraws nothing. Move a cyclic value half a turn instead.
          const next = /phase/i.test(key) ? (value + 0.5) % 1 : value + 1;
          return { path: `${type}.${key}`, value: next, was: value };
        }
        if (typeof value === 'boolean') return { path: `${type}.${key}`, value: !value, was: value };
      }
      return null;
    }, { id, type });
    if (!plan) { unprobed.push(type); continue; }
    const snap = () => page.evaluate((id) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      return el ? el.innerHTML : '';
    }, id);
    const before = await snap();
    await page.evaluate(async ({ id, path, value }) => {
      const { updateControlProperty } = await import('/src/CE_Application/stores/controls.js');
      updateControlProperty(id, path, value);
    }, { id, ...plan });
    await settle();
    // `running` only means anything once something is ticking: on the static edit canvas a stopped
    // simulation is identical to a running one at rest, so it is expected not to redraw.
    const expected = plan.path.endsWith('.running');
    if (await snap() === before && !expected) inert.push(`${type} (${plan.path}: ${JSON.stringify(plan.was)} -> ${JSON.stringify(plan.value)})`);
  }
  assert.deepEqual(inert, [], 'renderers that ignored a real change to their own model');
  console.log(`  ok  ${STATEFUL.length - unprobed.length}/${STATEFUL.length} renderers redraw when a real property of their own section changes`);
  if (unprobed.length) console.log('      no scalar property to change: ' + unprobed.join(', '));
  if (inert.length) console.log('      DID NOT REDRAW: ' + inert.join('; '));

  // The fourteen starter packages, rendered as real controls. The sheet is read here and handed to
  // the page: fetching it from the dev server does not work, the app does not serve CE/qa.
  const sheet = JSON.parse(readFileSync(join(root, '..', 'qa', 'QA-07-packages.cepanel'), 'utf8'));
  assert.equal(sheet.controls.filter((c) => c._children?.Core?.controlType === 'CustomComponent').length, 14,
    'QA-07 should hold the fourteen starter packages');

  const starterResults = await page.evaluate(async (raw) => {
    // The sheet is SPARSE on disk; a control has to be expanded before the package API can read it.
    const { deserializePanel } = await import('/src/CE_Application/stores/panelModel.js');
    const authored = deserializePanel(JSON.stringify(raw), '', 'starters')
      .controls.filter((c) => c._children?.Core?.controlType === 'CustomComponent');
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    // An already-built control goes in through the package entry point, not addControl (which takes
    // a TYPE STRING — passing a control object there reports "Unknown component type: [object Object]").
    const { addCustomComponentPackage } = await import('/src/CE_Application/stores/controls.js');
    const cp = await import('/src/CE_Application/utils/customComponentPackage.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const out = [];
    for (const control of authored) {
      const name = control._children?.Core?.name ?? '(unnamed)';
      try {
        const envelope = cp.createCustomComponentExportEnvelope(control, {});
        const before = new Set(flat(get(panels).flatMap((p) => p.controls ?? [])).map((c) => c._children.Core.id));
        addCustomComponentPackage(envelope);
        const made = flat(get(panels).flatMap((p) => p.controls ?? [])).find((c) => !before.has(c._children.Core.id));
        out.push({ name, ok: !!made, id: made?._children?.Core?.id ?? '', why: made ? '' : 'not added to the panel' });
      } catch (error) { out.push({ name, ok: false, why: String(error?.message ?? error).slice(0, 90) }); }
    }
    return out;
  }, sheet);
  await settle();
  assert.deepEqual(starterResults.filter((r) => !r.ok).map((r) => `${r.name}: ${r.why}`), [],
    'starter packages that did not reach the panel');
  // ...and they have to DRAW, not merely exist in the document.
  const starterBlank = [];
  for (const r of starterResults) {
    const box = await rendered(r.id);
    if (!box.found) starterBlank.push(`${r.name} (no element)`);
    else if (box.w === 0 || box.h === 0) starterBlank.push(`${r.name} (${box.w}x${box.h})`);
    else if (box.painted === 0) starterBlank.push(`${r.name} (element but nothing drawn inside)`);
  }
  assert.deepEqual(starterBlank, [], 'starter packages that reached the panel but did not draw');
  console.log(`  ok  ${starterResults.length}/${starterResults.length} starter packages instantiate, reach the panel and draw`);

  assert.deepEqual(failures, [], 'page errors during the pass');
  console.log('\nmusic/modulation runtime: all checks passed');
} finally {
  await browser.close();
  if (server) await server.close();
}
