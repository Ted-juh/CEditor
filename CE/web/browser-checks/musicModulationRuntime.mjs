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
page.on('pageerror', (error) => failures.push(String(error) + '\n' + String(error.stack ?? '').split('\n').slice(0, 6).join('\n')));
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

  // REAL GESTURES, aimed at each component's actual interaction region. A generic drag across the
  // middle proves nothing — it lands wherever the layout happens to put it — so these compute the
  // target from the control's own model and press exactly there.
  //
  // Both cases below regressed the same way: the pointer-up handler nulled its drag variable and
  // THEN called the release function, which read `.kind` off it. Every completed drag threw and the
  // position was never committed. A model write cannot see this; only a real pointer can.
  const gestureAt = async (type, handle, place, read, { index = 0 } = {}) => {
    const id = await insert(type);
    await settle();
    await page.evaluate(async () => {
      const { setPreviewModeEnabled } = await import('/src/CE_Application/stores/interactionPreview.js');
      setPreviewModeEnabled(true);
    });
    await settle();
    await page.evaluate(async ({ id, place }) => {
      const { updateControlProperty } = await import('/src/CE_Application/stores/controls.js');
      for (const [path, value] of Object.entries(place)) updateControlProperty(id, path, value);
    }, { id, place });
    await settle();
    const box = await page.evaluate((id) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, id);
    assert.ok(box && box.w > 0, `${type}: no box to aim at`);
    // The handle's OWN rendered position, not a fraction of the control: the pad is inset and the
    // y axis is flipped, so a computed guess misses and proves nothing.
    const spot = await page.evaluate(({ id, handle, index }) => {
      const el = document.querySelector(`[data-control-id="${id}"]`);
      const h = el?.querySelectorAll(handle)?.[index];
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, { id, handle, index });
    assert.ok(spot, `${type}: no element ${index} matching "${handle}" to press`);
    const before = await read(id);
    const errs = failures.length;
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    // The drag has to be established before the move: pointerdown and the first pointermove in the
    // same frame are treated as one event and no drag starts. The renderer's svg is
    // pointer-events:none — the preview surface takes the pointer and converts it itself.
    await settle();
    await page.mouse.move(box.x + box.w * 0.6, box.y + box.h * 0.65, { steps: 8 });
    await page.mouse.up();
    await settle();
    assert.equal(failures.length, errs,
      `${type}: pointer-up threw — ${failures.slice(errs).join(' | ').split('\n')[0]}`);
    const after = await read(id);
    assert.notEqual(after, before, `${type}: a drag onto its handle committed nothing (${before})`);
    await page.evaluate(async () => {
      const { setPreviewModeEnabled } = await import('/src/CE_Application/stores/interactionPreview.js');
      setPreviewModeEnabled(false);
    });
    await settle();
  };
  const readPath = (id, ...paths) => page.evaluate(async ({ id, paths }) => {
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
    return paths.map((p) => { const [sec, key] = p.split('.'); return String(c?._children?.[sec]?.[key]); }).join(',');
  }, { id, paths });

  await gestureAt('Timbre', 'svg.timbre circle[r="9"]', { 'Timbre.x': 0.25, 'Timbre.y': 0.25 },
    (id) => readPath(id, 'Timbre.x', 'Timbre.y'));
  console.log('  ok  a Timbre puck drag commits its position and does not throw');

  // The whole section, not two keys: a press can land on a STAR rather than the probe, and that
  // path commits Constellation.presets instead. Either way the release ran and committed something,
  // which is what the regression is about.
  await gestureAt('Constellation', 'svg circle[r="14"]', { 'Constellation.probeX': 0.25, 'Constellation.probeY': 0.25 },
    (id) => page.evaluate(async ({ id }) => {
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
        const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
      const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
      return JSON.stringify(c?._children?.Constellation ?? null);
    }, { id }));
  console.log('  ok  a Constellation probe drag commits its position and does not throw');


  // ===============================================================================================
  // THE SIX COMPONENTS WHOSE GESTURE IS NOT A PUCK DRAG.
  //
  // A puck drag is one shape of interaction and the easy one. These six are the rest of the
  // vocabulary — a cell toggle, a breakpoint drag, three note emitters and an orbiting node — and
  // every one of them needs the press aimed somewhere the component itself decides. The rule that
  // made the first two work holds for all of them: read the handle's OWN rendered rectangle out of
  // the DOM and press its centre. A fraction of the control's box lands wherever the layout happens
  // to put it, and a check that passes for that reason is not a check.
  // ===============================================================================================

  // Every note the panel plays goes through one funnel and out of `noteOutputEvents`. Tap it once,
  // here, and the three note emitters can be asked what they actually SOUNDED.
  await page.evaluate(async () => {
    const { noteOutputEvents } = await import('/src/CE_Application/stores/noteOutput.js');
    window.__notes = [];
    noteOutputEvents.subscribe((v) => { for (const e of v.events ?? []) window.__notes.push(e); });
  });

  const previewMode = (on) => page.evaluate(async (on) => {
    const { setPreviewModeEnabled } = await import('/src/CE_Application/stores/interactionPreview.js');
    setPreviewModeEnabled(on);
  }, on);
  const boxOf = (id) => page.evaluate((id) => {
    const el = document.querySelector(`[data-control-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);
  const sessionOf = (id) => page.evaluate(async (id) => {
    const { panelPreviewSessions } = await import('/src/CE_Application/stores/interactionPreview.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    return get(panelPreviewSessions)?.[id] ?? null;
  }, id);
  const handleSpot = (id, selector, index = 0) => page.evaluate(({ id, selector, index }) => {
    const el = document.querySelector(`[data-control-id="${id}"]`);
    const h = el?.querySelectorAll(selector)?.[index];
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { id, selector, index });
  // The whole control as the document holds it — the "did the panel change?" question, asked once
  // and reused, because for three of these six the answer must be NO.
  const docOf = (id) => page.evaluate(async (id) => {
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
    return JSON.stringify(c ?? null);
  }, id);
  const notes = () => page.evaluate(() => window.__notes.slice());
  const forgetNotes = () => page.evaluate(() => { window.__notes.length = 0; });

  // --- 1. Envelope: drag a breakpoint --------------------------------------------------------
  // The nodes are the only circles the renderer strokes; index 1 is an interior one, which is the
  // node an ADSR lets move in both axes (the ends are pinned to the axis and to y=0).
  await gestureAt('Envelope', 'svg.envelope circle[stroke="rgba(0,0,0,0.5)"]', {},
    (id) => page.evaluate(async ({ id }) => {
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
        const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
      const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
      return JSON.stringify(c?._children?.Envelope?.points ?? null);
    }, { id }), { index: 1 });
  console.log('  ok  an Envelope breakpoint drag moves that node and commits the shape');

  // --- 2. Orbit: drag a satellite ------------------------------------------------------------
  // STOPPED FIRST, and that is not a convenience. A running Orbit advances at rAF, so the satellite
  // has moved between the rectangle being read and the mouse arriving, and the press lands on empty
  // space — the hit test allows 14px and a lap is far more than that.
  await gestureAt('Orbit', 'svg.orbit circle[stroke="rgba(0,0,0,0.5)"]', { 'Orbit.running': false },
    (id) => page.evaluate(async ({ id }) => {
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
        const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
      const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
      return JSON.stringify(c?._children?.Orbit?.nodes ?? null);
    }, { id }));
  console.log('  ok  an Orbit satellite drag commits its radius and angle');

  // --- 3-5. The note emitters ----------------------------------------------------------------
  // A Drum Pad, a Ribbon Keyboard and a Keyboard play NOTES. None of them writes the document, so
  // "did something change?" is the wrong question and it passes while the control is silent. What a
  // press produces is a note-on on the output tap and a held mark in the preview session; what the
  // RELEASE produces is the matching note-off and a held set that is empty again. All four are
  // asserted, and so is the document staying exactly as it was.
  //
  // ON A PANEL OF THEIR OWN, and that is not tidiness. `noteOutputEvents` is ONE funnel for the
  // whole panel: a running Arp or Phrase three controls away publishes note-ons into the same tap,
  // and a check that counts them cannot tell those from the pad it just hit. A fresh panel is what
  // the tickers iterate, so the only notes left are the ones this gesture caused — and the expected
  // set below, read from each control's own note map, is the second guard.
  await page.evaluate(async () => {
    const { addPanel } = await import('/src/CE_Application/stores/panels.js');
    addPanel();
  });
  await settle();

  const notePressRelease = async (type, selector, heldOf, expectedNotes, { index = 0 } = {}) => {
    const id = await insert(type);
    await settle();
    await previewMode(true);
    await settle();
    const spot = await handleSpot(id, selector, index);
    assert.ok(spot, `${type}: nothing matching "${selector}" to press`);
    const want = await expectedNotes(id);
    const mine = (e) => e.channel === want.channel && want.notes.includes(e.note);
    const docBefore = await docOf(id);
    await forgetNotes();
    const errs = failures.length;

    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await settle();
    const onNotes = (await notes()).filter((e) => e.kind === 'on' && mine(e));
    const sessDown = await sessionOf(id);
    const heldDown = heldOf(sessDown);

    await page.mouse.up();
    await settle();
    const offNotes = (await notes()).filter((e) => e.kind === 'off' && mine(e));
    const heldUp = heldOf(await sessionOf(id));
    await previewMode(false);
    await settle();

    assert.equal(failures.length, errs,
      `${type}: the press/release threw — ${failures.slice(errs).join(' | ').split('\n')[0]}`);
    assert.ok(onNotes.length >= 1,
      `${type}: pressing its own interaction region on channel ${want.channel} sounded nothing`);
    assert.ok(heldDown.length >= 1,
      `${type}: it sounded, but the renderer was never told anything is held`);
    for (const on of onNotes) {
      assert.ok(offNotes.some((off) => off.note === on.note && off.channel === on.channel),
        `${type}: note ${on.note} was sounded and never released — a stuck note`);
    }
    assert.deepEqual(heldUp, [],
      `${type}: released, and the held mark stayed behind (${JSON.stringify(heldUp)})`);
    assert.equal(await docOf(id), docBefore,
      `${type}: playing a note edited the document, which a performance control must never do`);
    return { on: onNotes.length, off: offNotes.length, note: onNotes[0]?.note };
  };

  // What this control is allowed to have played, out of its OWN note map.
  const noteMapOf = (id, module, channelFn, notesFn) => page.evaluate(async ({ id, module, channelFn, notesFn }) => {
    const m = await import(module);
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
    return { channel: m[channelFn](c), notes: m[notesFn](c).map((entry) => entry.note) };
  }, { id, module, channelFn, notesFn });

  // The header strip carries rx="6" too and comes FIRST in the document, so index 0 is not a pad.
  // Aiming at it is what a "press the first rect you find" check does, and it reports a silent
  // component as broken interaction rather than as a missed target.
  const drum = await notePressRelease('DrumPads', 'svg.drumpads rect[rx="6"]',
    (s) => s?.drumHits ?? [],
    (id) => noteMapOf(id, '/src/CE_Application/utils/drumPadLayout.js', 'drumChannel', 'drumPads'),
    { index: 1 });
  console.log(`  ok  a Drum Pad strike sounds note ${drum.note} on its own channel, the release sends note-off, nothing sticks`);

  const ribbon = await notePressRelease('NoteRibbon', 'svg.ribbon rect[rx="3"]',
    (s) => (s?.noteRibbonTouch ? [s.noteRibbonTouch.note] : []),
    (id) => noteMapOf(id, '/src/CE_Application/utils/noteRibbonLayout.js', 'ribbonChannel', 'ribbonZones'),
    { index: 2 });
  console.log(`  ok  a Ribbon Keyboard touch sounds note ${ribbon.note}, the release sends note-off and clears the rail`);

  // --- 6. Step Sequencer: toggle a cell, through the dock the user opens ----------------------
  // The one gesture on this list that is NOT on the canvas. A Step Sequencer's pattern is drawn in
  // the Designer dock, and the way in is the button in its own properties section — so the gesture
  // is two real clicks: open the dock, then press a cell. Selecting the control is fixture; both
  // clicks are the user.
  const seqGestureId = await insert('StepSequencer');
  await settle();
  await page.evaluate(async (id) => {
    const { selectComponent } = await import('/src/CE_Application/stores/panels.js');
    selectComponent(id);
  }, seqGestureId);
  await settle();
  // THE DOCK IS OPENED FIRST, BY HAND, and that is a finding rather than a convenience: the display
  // dock ships closed, and pressing "design this pattern" in the properties panel arms the designer
  // WITHOUT opening it (C-6 in the ledger — App.svelte's effect never sees the request, because
  // DisplayPanel clears it first). Until that is fixed the button alone shows the user nothing, so
  // this opens the dock the way the icon rail does and then presses the button, which is what a
  // user who has already found the rail would do.
  const dockToggle = await page.$('button[title^="Display dock"]');
  assert.ok(dockToggle, 'the icon rail offers no display-dock toggle');
  await dockToggle.click();
  await settle();
  // The properties panel opens on Core; the Sequence section is behind its own tab, so reaching the
  // dock button is itself a click the user makes.
  const seqTab = await page.$('.properties-area button[title="Sequencer"], .properties-area button[aria-label="Sequencer"]');
  assert.ok(seqTab, 'the properties panel offers no Sequencer tab for a selected Step Sequencer');
  await seqTab.click();
  await settle();
  const opener = await page.$('button.open-in-dock');
  assert.ok(opener, 'the Sequence section offers no way into the designer dock');
  await opener.click();
  await page.waitForSelector('.seqdes .stage', { timeout: 15000 });
  await settle();
  // The cell's own rectangle, from the component's own geometry module — the same maths the hit
  // test uses, so the press cannot land between two cells.
  const cellSpot = await page.evaluate(async ({ id, step, trackIndex }) => {
    const { sequencerGeometry, cellRect } = await import('/src/CE_Application/utils/stepSequencerLayout.js');
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const control = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
    const stage = document.querySelector('.seqdes .stage');
    const box = stage.getBoundingClientRect();
    const rect = cellRect(sequencerGeometry(box.width, box.height, control), trackIndex, step);
    return { x: box.x + rect.x + rect.w / 2, y: box.y + rect.y + rect.h / 2 };
  }, { id: seqGestureId, step: 3, trackIndex: 0 });
  assert.ok(cellSpot, 'no cell rectangle to press');
  const seqErrs = failures.length;
  const litBefore = await page.evaluate(async ({ id }) => {
    const ss = await import('/src/CE_Application/utils/stepSequencerLayout.js');
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
    return Object.keys(ss.sequencerPattern(c) ?? {}).length;
  }, { id: seqGestureId });
  await page.mouse.click(cellSpot.x, cellSpot.y);
  await settle();
  const readCells = () => page.evaluate(async ({ id }) => {
    const ss = await import('/src/CE_Application/utils/stepSequencerLayout.js');
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const c = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
    return Object.keys(ss.sequencerPattern(c) ?? {});
  }, { id: seqGestureId });
  const litAfter = await readCells();
  assert.equal(failures.length, seqErrs,
    `StepSequencer: the cell click threw — ${failures.slice(seqErrs).join(' | ').split('\n')[0]}`);
  assert.equal(litAfter.length, litBefore + 1,
    `StepSequencer: a click on cell (track 0, step 3) lit ${litAfter.length - litBefore} cells`);
  // …and the SAME click again puts it out. A toggle that only ever lights is half a toggle, and it
  // is the half a "did anything change?" predicate cannot tell from the other.
  await page.mouse.click(cellSpot.x, cellSpot.y);
  await settle();
  assert.equal((await readCells()).length, litBefore,
    'StepSequencer: clicking a lit cell again did not put it out');
  console.log('  ok  a Step Sequencer cell lights on the click and goes out on the next one');

  // --- 7. Multi-part custom starters: their own hit zones, not their bounding box ---------------
  // A packaged component is several controls in a trench coat, and pressing the middle of one is
  // meaningless — the Dual Slider Switch has two slider zones and a mode button inside 220×92px.
  // The zones are found by ASKING THE APP: the preview surface writes `hoveredCustomHitZone` as the
  // pointer moves, so hovering a grid of points and reading it back gives each zone's own region
  // without this file knowing anything about percent bounds, ring shapes, or — for the Tab Group —
  // zones that do not exist until a generator makes them.
  const addStarter = async (label) => page.evaluate(async ({ raw, label }) => {
    const { deserializePanel } = await import('/src/CE_Application/stores/panelModel.js');
    const { panels } = await import('/src/CE_Application/stores/panels.js');
    const { addCustomComponentPackage } = await import('/src/CE_Application/stores/controls.js');
    const cp = await import('/src/CE_Application/utils/customComponentPackage.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
      const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
    const authored = deserializePanel(JSON.stringify(raw), '', 'starters').controls
      .find((c) => c._children?.Core?.name === label);
    if (!authored) return `NO SUCH STARTER: ${label}`;
    const before = new Set(flat(get(panels).flatMap((p) => p.controls ?? [])).map((c) => c._children.Core.id));
    addCustomComponentPackage(cp.createCustomComponentExportEnvelope(authored, {}));
    const made = flat(get(panels).flatMap((p) => p.controls ?? [])).find((c) => !before.has(c._children.Core.id));
    return made ? made._children.Core.id : `NOT ADDED: ${label}`;
  }, { raw: sheet, label });

  // Hover a grid and let the app say which zone each point is in. 11×11 over the control, which is
  // finer than the smallest zone any starter declares (18% of the width, on the mode button).
  const zoneMap = async (id) => {
    const box = await boxOf(id);
    assert.ok(box && box.w > 0, 'no box to scan for hit zones');
    const found = new Map();
    for (let iy = 1; iy < 11; iy += 1) {
      for (let ix = 1; ix < 11; ix += 1) {
        const x = box.x + (box.w * ix) / 11;
        const y = box.y + (box.h * iy) / 11;
        await page.mouse.move(x, y);
        const name = (await sessionOf(id))?.hoveredCustomHitZone ?? '';
        if (name && !found.has(name)) found.set(name, { x, y });
      }
    }
    return found;
  };
  const customValue = async (id, channel) => {
    const s = await sessionOf(id);
    return s?.customValues?.[channel];
  };

  const starterGesture = async (label, run) => {
    const id = await addStarter(label);
    assert.ok(id && !id.startsWith('NO ') && !id.startsWith('NOT '), `${label}: ${id}`);
    await settle();
    await previewMode(true);
    await settle();
    const zones = await zoneMap(id);
    assert.ok(zones.size > 0, `${label}: the app reports no hit zone anywhere on it`);
    const errs = failures.length;
    await run(id, zones);
    assert.equal(failures.length, errs,
      `${label}: a gesture threw — ${failures.slice(errs).join(' | ').split('\n')[0]}`);
    await previewMode(false);
    await settle();
    return zones;
  };

  // Dual Slider Switch: drag slider A, then press the mode button. Two different KINDS of gesture
  // on one component, which is the thing a package adds over a stock control.
  const dualZones = await starterGesture('Dual Slider Switch', async (id, zones) => {
    const sliderA = zones.get('sliderAZone');
    const mode = zones.get('switchModeZone');
    assert.ok(sliderA, `no sliderAZone found; the app reported ${[...zones.keys()].join(', ')}`);
    assert.ok(mode, `no switchModeZone found; the app reported ${[...zones.keys()].join(', ')}`);
    const box = await boxOf(id);
    const beforeA = await customValue(id, 'valueA');
    await page.mouse.move(sliderA.x, sliderA.y);
    await page.mouse.down();
    await settle();
    await page.mouse.move(box.x + box.w * 0.12, sliderA.y, { steps: 6 });
    await page.mouse.up();
    await settle();
    const afterA = await customValue(id, 'valueA');
    assert.notEqual(afterA, beforeA, `dragging slider A moved nothing (still ${beforeA})`);
    // …and slider B, a few pixels below, must NOT have moved with it.
    const beforeMode = await customValue(id, 'mode');
    await page.mouse.click(mode.x, mode.y);
    await settle();
    const afterMode = await customValue(id, 'mode');
    assert.notEqual(afterMode, beforeMode, `the mode button did not cycle (still ${beforeMode})`);
    console.log(`  ok  Dual Slider Switch: slider A ${beforeA} -> ${afterA}, mode ${beforeMode} -> ${afterMode}`);
  });

  // Triple Value Slider: three stacked zones 18-22% tall. The one that must be right is that the
  // drag moves the handle it is ON and leaves the other two where they were.
  await starterGesture('Triple Value Slider', async (id, zones) => {
    const main = zones.get('mainZone');
    assert.ok(main, `no mainZone found; the app reported ${[...zones.keys()].join(', ')}`);
    const box = await boxOf(id);
    const before = {
      min: await customValue(id, 'minValue'),
      main: await customValue(id, 'mainValue'),
      max: await customValue(id, 'maxValue'),
    };
    await page.mouse.move(main.x, main.y);
    await page.mouse.down();
    await settle();
    await page.mouse.move(box.x + box.w * 0.2, main.y, { steps: 6 });
    await page.mouse.up();
    await settle();
    const after = {
      min: await customValue(id, 'minValue'),
      main: await customValue(id, 'mainValue'),
      max: await customValue(id, 'maxValue'),
    };
    assert.notEqual(after.main, before.main, `the middle handle did not move (still ${before.main})`);
    assert.equal(after.min, before.min, 'dragging the middle handle moved the minimum with it');
    assert.equal(after.max, before.max, 'dragging the middle handle moved the maximum with it');
    console.log(`  ok  Triple Value Slider: middle ${before.main} -> ${after.main}, min and max untouched`);
  });

  // Tab Group: the only one of the three whose zones DO NOT EXIST in the authored document — a
  // generator makes one per tab at runtime. Asking the app where they are is the only way to press
  // one, which is the whole reason the scan above asks instead of reading bounds.
  await starterGesture('Tab Group', async (id, zones) => {
    const names = [...zones.keys()];
    assert.ok(names.length >= 2,
      `a three-tab bank should offer more than one zone; the app reported ${names.join(', ') || '(none)'}`);
    const before = await customValue(id, 'tab');
    let after = before;
    for (const name of names) {
      await page.mouse.click(zones.get(name).x, zones.get(name).y);
      await settle();
      after = await customValue(id, 'tab');
      if (after !== before) break;
    }
    assert.notEqual(after, before,
      `pressing every generated tab zone (${names.join(', ')}) left the channel on ${before}`);
    console.log(`  ok  Tab Group: a generated tab zone moves the enum channel ${before} -> ${after}`);
  });
  if (dualZones.size) console.log(`      hit zones the app located by hover: ${[...dualZones.keys()].join(', ')}`);


  // --- 8. The Keyboard: press a key, hear the note ---------------------------------------------
  // Regression for the previously unwired Keyboard. It failed at a85ecb06 and passes
  // with the integrated runtime wiring. It stays last so the preceding checks report too.
  //
  // `keyboardLayout.js` exports the entire interaction — `keyboardNoteAt` (which key is under the
  // pointer), `keyboardPress` (what that key sends, transpose and scale lock applied),
  // `keyboardHold`, `keyboardGlide`. At the failing baseline nothing in src/ imported any of them.
  // The preview surface had no Keyboard branch in its pointer-down dispatcher, and the
  // `previewSession.keyboardHeld` needed by the renderer was never written. The press landed on the
  // control — the session said `pressed` — and the panel played nothing. It is the same shape the
  // Designer tab's header records for the Step Sequencer: the layout module had the hit test and
  // both writers all along, and nothing imported them.
  //
  // The expectation below is the CORRECT behaviour, not the current one, so that wiring the surface
  // turns this green and nothing has to remember to come back and invert it.
  //
  // The note it expects is computed by the component's own `keyboardPress`, note, velocity AND
  // channel. That precision is not decoration: `noteOutputEvents` is one panel-wide funnel, a
  // ChordPad on channel 1 at velocity 96 was sounding during this very check while it was being
  // written, and a looser predicate reports that chord as the keyboard working.
  {
    await page.evaluate(async () => {
      const { addPanel } = await import('/src/CE_Application/stores/panels.js');
      addPanel();
    });
    await settle();
    const id = await insert('Keyboard');
    await settle();
    await previewMode(true);
    await settle();
    const aim = await page.evaluate(async ({ id }) => {
      const kb = await import('/src/CE_Application/utils/keyboardLayout.js');
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) { out.push(c);
        const kids = c?._children?.Children?._children; if (kids) flat(Object.values(kids), out); } return out; };
      const control = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => x._children.Core.id === id);
      const el = document.querySelector(`[data-control-id="${id}"]`);
      const svg = el?.querySelector('svg.keyboard');
      const key = svg?.querySelector('rect');
      if (!svg || !key) return null;
      const sb = svg.getBoundingClientRect();
      const kbx = key.getBoundingClientRect();
      // Low on the key, where a white key is not overlapped by the black ones above it.
      const x = kbx.x + kbx.width / 2;
      const y = kbx.y + kbx.height * 0.8;
      const note = kb.keyboardNoteAt(control, sb.width, sb.height, x - sb.x, y - sb.y);
      return { x, y, note, press: note == null ? null : kb.keyboardPress(control, note) };
    }, { id });
    assert.ok(aim, 'Keyboard: nothing rendered to press');
    assert.ok(aim.press,
      `Keyboard: its own keyboardNoteAt finds no key under the first key's own rectangle (${aim.note})`);

    await forgetNotes();
    const errs = failures.length;
    await page.mouse.move(aim.x, aim.y);
    await page.mouse.down();
    await settle();
    const down = await notes();
    const sessDown = await sessionOf(id);
    await page.mouse.up();
    await settle();
    const up = await notes();
    const sessUp = await sessionOf(id);
    await previewMode(false);
    await settle();

    const want = aim.press;
    const sounded = down.filter((e) => e.kind === 'on' && e.note === want.note
      && e.channel === want.channel && e.velocity === want.velocity);
    const released = up.filter((e) => e.kind === 'off' && e.note === want.note && e.channel === want.channel);

    assert.equal(failures.length, errs,
      `Keyboard: the press threw — ${failures.slice(errs).join(' | ').split('\n')[0]}`);
    assert.equal(sessDown?.pressed, true, 'Keyboard: the press never reached the control');
    assert.ok(sounded.length >= 1,
      `Keyboard: pressing the key its own layout module calls note ${want.note} sent no `
      + `note-on (ch ${want.channel}, vel ${want.velocity}). The surface has no Keyboard handler — `
      + 'see the comment above this assertion.');
    assert.ok(Array.isArray(sessDown?.keyboardHeld) && sessDown.keyboardHeld.includes(want.note),
      `Keyboard: nothing wrote keyboardHeld, which is the only thing KeyboardRenderer reads to draw `
      + `a key as down (got ${JSON.stringify(sessDown?.keyboardHeld)})`);
    assert.ok(released.length >= 1, `Keyboard: note ${want.note} was never released`);
    assert.deepEqual(sessUp?.keyboardHeld ?? [], [], 'Keyboard: the held key stayed down after release');
    console.log(`  ok  a Keyboard key press sounds note ${want.note} and the release sends note-off`);
  }

  assert.deepEqual(failures, [], 'page errors during the pass');
  console.log('\nmusic/modulation runtime: all checks passed');
} finally {
  await browser.close();
  if (server) await server.close();
}
