/**
 * knobsFromSelection.mjs — knobs and sliders made into a component look and move exactly as they did.
 *
 * Create Component from Selection replaces what was selected, so a converted knob has to be the same
 * knob: the same pixels, and the same value for the same gesture. This builds one panel of knobs,
 * sliders and a legend, and a second panel with the same controls converted, then does the same
 * things to both in preview (the surface the exported plug-in's player mounts) and compares:
 *
 *   - the picture at rest, while one knob is hovered, and after every gesture;
 *   - the values: an absolute knob dragged past its end and back, a relative (knob-mode) dial dragged
 *     past its end and back, a horizontal and a vertical slider, a wheel notch, a double-click reset;
 *   - what the export would publish: the same host parameter ids, ranges and device bindings.
 *
 * Then the same on REAL controls: a cluster of the Roland GAIA sheet's knobs with the legends round
 * them, copied into a small panel that keeps the GAIA panel's own settings, so the control set,
 * palette and bindings are the sheet's.
 *
 * Run against a warmed dev server: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/knobsFromSelection.mjs
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from './behaviourKit.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../dist-scenery');
await mkdir(OUT, { recursive: true });
const kit = await boot();
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

const CONTROLS = [
  ['Label', 'legend', { 'Transform.x': 40, 'Transform.y': 20, 'Transform.width': 300, 'Transform.height': 24, 'Text.content': 'FILTER' }],
  ['Knob', 'cutoff', {
    'Transform.x': 40, 'Transform.y': 60, 'Transform.width': 90, 'Transform.height': 90,
    'Behavior.min': 0, 'Behavior.max': 100, 'Behavior.step': 1, 'Behavior.defaultValue': 50, 'Behavior.defaultCurrentValue': 50,
    'Behavior.unit': '%', 'Behavior.wheelEnabled': true,
  }],
  ['Knob', 'reso', {
    'Transform.x': 150, 'Transform.y': 60, 'Transform.width': 90, 'Transform.height': 90,
    'Behavior.circularDragMode': 'knob', 'Behavior.min': 0, 'Behavior.max': 127, 'Behavior.step': 1,
    'Behavior.defaultValue': 25, 'Behavior.defaultCurrentValue': 25,
  }],
  ['Slider', 'drive', { 'Transform.x': 40, 'Transform.y': 170, 'Transform.width': 220, 'Transform.height': 40 }],
  ['Slider', 'mix', {
    'Transform.x': 280, 'Transform.y': 60, 'Transform.width': 44, 'Transform.height': 150, 'Behavior.orientation': 'vertical',
  }],
];
const KNOBS = ['cutoff', 'reso', 'drive', 'mix'];
const transformOf = (name) => {
  const patch = CONTROLS.find(([, n]) => n === name)[2];
  return { x: patch['Transform.x'], y: patch['Transform.y'], w: patch['Transform.width'], h: patch['Transform.height'] };
};
const origin = { x: Math.min(...CONTROLS.map(([, n]) => transformOf(n).x)), y: Math.min(...CONTROLS.map(([, n]) => transformOf(n).y)) };
const extent = {
  w: Math.max(...CONTROLS.map(([, n]) => transformOf(n).x + transformOf(n).w)) - origin.x,
  h: Math.max(...CONTROLS.map(([, n]) => transformOf(n).y + transformOf(n).h)) - origin.y,
};

async function buildPanel() {
  await kit.fresh();
  await kit.preview(false);
  const ids = {};
  for (const [type, name, patch] of CONTROLS) ids[name] = await kit.make(type, { 'Core.name': name, ...patch });
  // A device binding on the knob, which the converted copy must carry to the knob's channel.
  await kit.set(ids.cutoff, { 'DeviceBindings.bindings': [{ kind: 'deviceParameter', parameterId: 'vcf.cutoff', deviceRole: 'mainSynth', port: 'value' }] });
  // A raw CC on the dial, so what reaches the synth can be read off the wire, before and after.
  await kit.set(ids.reso, { 'DeviceBindings.bindings': [{ kind: 'midiControl', message: 'cc', channel: 2, controller: 71, deviceRole: 'mainSynth', port: 'value' }] });
  await kit.wire();
  return ids;
}

/** Screen rects of each knob and of the whole selection: from the panel knob, or inside the component. */
async function rectsFor(ids, componentId = null) {
  let base;
  let zoom;
  if (componentId) {
    const box = await kit.box(componentId);
    zoom = box.w / extent.w;
    base = { x: box.x, y: box.y };
  } else {
    const box = await kit.box(ids.cutoff);
    const t = transformOf('cutoff');
    zoom = box.w / t.w;
    base = { x: box.x - (t.x - origin.x) * zoom, y: box.y - (t.y - origin.y) * zoom };
  }
  const out = {};
  for (const name of KNOBS) {
    const t = transformOf(name);
    out[name] = { x: base.x + (t.x - origin.x) * zoom, y: base.y + (t.y - origin.y) * zoom, w: t.w * zoom, h: t.h * zoom };
  }
  out.all = { x: base.x, y: base.y, w: extent.w * zoom, h: extent.h * zoom };
  return out;
}

const at = (r, fx, fy) => ({ x: r.x + r.w * fx, y: r.y + r.h * fy });
const shot = (r) => kit.page.screenshot({ clip: { x: Math.round(r.x) - 2, y: Math.round(r.y) - 2, width: Math.round(r.w) + 4, height: Math.round(r.h) + 4 } });

async function gesture(path) {
  const m = kit.page.mouse;
  await m.move(path[0].x, path[0].y);
  await m.down();
  await kit.settle(60);
  for (const p of path.slice(1)) await m.move(p.x, p.y, { steps: 6 });
  await m.up();
  await kit.settle(150);
}

/** The same sequence on either panel; returns the pictures taken on the way. */
async function perform(rects) {
  const shots = {};
  const away = { x: rects.all.x + rects.all.w + 120, y: rects.all.y + rects.all.h + 60 };
  await kit.page.mouse.move(away.x, away.y);
  await kit.settle(400);
  shots.rest = await shot(rects.all);
  await kit.page.mouse.move(...Object.values(at(rects.cutoff, 0.5, 0.45)));
  await kit.settle(400);
  shots.hover = await shot(rects.all);
  // An absolute knob: jump to the pointer's angle, round past the end, and back.
  await gesture([at(rects.cutoff, 0.3, 0.3), at(rects.cutoff, 0.8, 0.2), at(rects.cutoff, 0.9, 0.9), at(rects.cutoff, 0.75, 0.4)]);
  // A relative dial: up past the top, then down a little — the panel clamps as it goes.
  await gesture([at(rects.reso, 0.5, 0.5), at(rects.reso, 0.5, -1.5), at(rects.reso, 0.5, -4), at(rects.reso, 0.5, -3.2)]);
  // Sliders: past the far end and back.
  await gesture([at(rects.drive, 0.3, 0.5), at(rects.drive, 1.4, 0.5), at(rects.drive, 0.7, 0.5)]);
  await gesture([at(rects.mix, 0.5, 0.8), at(rects.mix, 0.5, -0.3), at(rects.mix, 0.5, 0.35)]);
  // One wheel notch up over the knob that takes the wheel, and one over a dial that does not.
  await kit.page.mouse.move(...Object.values(at(rects.cutoff, 0.5, 0.5)));
  await kit.page.mouse.wheel(0, -100);
  await kit.settle(200);
  await kit.page.mouse.move(...Object.values(at(rects.reso, 0.5, 0.5)));
  await kit.page.mouse.wheel(0, -100);
  await kit.settle(200);
  await kit.page.mouse.move(away.x, away.y);
  await kit.settle(400);
  shots.moved = await shot(rects.all);
  // Double-click the vertical slider back to its default.
  const mid = at(rects.mix, 0.5, 0.5);
  await kit.page.mouse.click(mid.x, mid.y);
  await kit.settle(60);
  await kit.page.mouse.click(mid.x, mid.y);
  await kit.page.mouse.move(away.x, away.y);
  await kit.settle(400);
  shots.reset = await shot(rects.all);
  // Focus is per knob on the panel: a wheeled knob shows focus, and a click on another knob decides
  // whether it keeps it. Then the keyboard, which moves the knob that has focus.
  const one = at(rects.cutoff, 0.5, 0.5);
  await kit.page.mouse.click(one.x, one.y);
  await kit.settle(120);
  await kit.page.mouse.wheel(0, -100);
  await kit.settle(120);
  const two = at(rects.reso, 0.5, 0.5);
  await kit.page.mouse.click(two.x, two.y);
  await kit.settle(120);
  await kit.page.keyboard.press('ArrowUp');
  await kit.page.keyboard.press('ArrowUp');
  await kit.page.mouse.move(away.x, away.y);
  await kit.settle(400);
  shots.focus = await shot(rects.all);
  return shots;
}

/** Pixels of two screenshots that differ by more than a small tolerance, and the diff picture. */
async function compare(a, b, label) {
  await writeFile(join(OUT, `knobs-${label}-before.png`), a);
  await writeFile(join(OUT, `knobs-${label}-after.png`), b);
  const result = await kit.page.evaluate(async ([pa, pb]) => {
    const load = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.src = src; });
    const [ia, ib] = await Promise.all([load(pa), load(pb)]);
    const w = Math.min(ia.width, ib.width);
    const h = Math.min(ia.height, ib.height);
    const pixels = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = pixels(ia);
    const db = pixels(ib);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ctx = out.getContext('2d'); const img = ctx.createImageData(w, h);
    let bad = 0;
    for (let i = 0; i < da.length; i += 4) {
      const off = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > 24;
      if (off) bad += 1;
      img.data[i] = off ? 255 : da[i] / 3; img.data[i + 1] = off ? 0 : da[i + 1] / 3; img.data[i + 2] = off ? 0 : da[i + 2] / 3; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { bad, total: w * h, size: [ia.width, ia.height, ib.width, ib.height], png: out.toDataURL('image/png') };
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`]);
  await writeFile(join(OUT, `knobs-${label}-diff.png`), Buffer.from(result.png.split(',')[1], 'base64'));
  return result;
}

const exportedOf = () => kit.page.evaluate(async () => {
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const { deriveExportParameters } = await import('/src/CE_Application/utils/exportParameters.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const panel = get(panels).find((p) => p.id === get(activePanelId));
  // The kit's wire helper (a slider named after the clock) is not part of the comparison.
  return deriveExportParameters(panel).filter((p) => !/^Slider_\d+\./.test(p.id)).map((p) => ({ id: p.id, label: p.label, min: p.min, max: p.max, defaultValue: p.defaultValue, unit: p.unit, deviceParameterId: p.deviceParameterId }));
});

try {
  // --- The panel as it is ---------------------------------------------------------------------
  const plain = await buildPanel();
  const exportBefore = await exportedOf();
  await kit.preview(true);
  await kit.settle(600);
  await kit.forgetSent();
  const beforeShots = await perform(await rectsFor(plain));
  const ccOf = async () => (await kit.sent()).filter((m) => m.status === 0xB0 && m.channel === 2 && m.data1 === 71).map((m) => m.data2);
  const sentBefore = await ccOf();
  const beforeValues = {};
  for (const name of KNOBS) {
    const session = await kit.session(plain[name]);
    beforeValues[name] = session?.valueOverrideEnabled ? session.valueOverride : null;
  }
  if (process.env.KNOB_DEBUG) {
    for (const name of KNOBS) {
      const x = await kit.session(plain[name]);
      console.log(name, JSON.stringify({ hover: x?.hover, pressed: x?.pressed, focused: x?.focused, dragging: x?.dragging, activeHandle: x?.activeHandle }));
    }
  }
  await kit.preview(false);

  // --- The same controls, converted ---------------------------------------------------------------
  const ids = await buildPanel();
  const made = await kit.page.evaluate(async (ids) => {
    const { selectedComponentIds } = await import('/src/CE_Application/stores/panels.js');
    const { createComponentFromSelection } = await import('/src/CE_Application/stores/componentFromSelectionActions.js');
    selectedComponentIds.set(new Set(ids));
    const result = createComponentFromSelection('Filter');
    return { ok: result.ok, refused: result.refused ?? [], id: result.instance?._children?.Core?.id ?? '', name: result.instance?._children?.Core?.name ?? '' };
  }, Object.values(ids));
  await kit.settle(400);
  check('the knobs, sliders and legend become one component', () => assert.equal(made.ok, true, JSON.stringify(made.refused)));
  const exportAfter = await exportedOf();
  check('the export publishes the same host parameters: ids, labels, ranges, units, device parameters', () => {
    assert.deepEqual(exportAfter, exportBefore);
  });
  await kit.preview(true);
  await kit.settle(600);
  await kit.forgetSent();
  const afterShots = await perform(await rectsFor(ids, made.id));
  const sentAfter = await ccOf();
  const session = await kit.session(made.id);
  const afterValues = Object.fromEntries(KNOBS.map((name) => [name, session?.customValues?.[name] ?? null]));
  // What reaches the synth, message for message: the value at the press, every move, the wheel and
  // the reset — and nothing from the other knobs while this one is still.
  check('the synth receives the same CC messages from the converted dial', () => {
    assert.ok(new Set(sentBefore).size > 3, `the panel dial sent ${JSON.stringify(sentBefore)}`);
    assert.deepEqual(sentAfter, sentBefore);
  });
  check('every gesture leaves every knob at the value the panel knob reached', () => {
    assert.ok(KNOBS.every((name) => beforeValues[name] !== null), `the panel's own knobs moved: ${JSON.stringify(beforeValues)}`);
    for (const name of KNOBS) assert.ok(Math.abs(afterValues[name] - beforeValues[name]) < 1e-9, `${name}: ${afterValues[name]} against ${beforeValues[name]}`);
  });
  for (const label of ['rest', 'hover', 'moved', 'reset', 'focus']) {
    const diff = await compare(beforeShots[label], afterShots[label], label);
    console.log(`      ${label}: ${diff.bad} of ${diff.total} pixels differ`);
    check(`${label}: the component draws what the panel drew`, () => {
      assert.deepEqual(diff.size.slice(0, 2), diff.size.slice(2), 'same size');
      assert.equal(diff.bad, 0, `see dist-scenery/knobs-${label}-diff.png`);
    });
  }
  await kit.preview(false);

  // The component opens in the designer like any other, knob parts drawn by the same renderer there.
  const box = await kit.box(made.id);
  await kit.page.mouse.click(box.x + 4, box.y + 4);
  await kit.settle(700);
  await kit.page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  const designerKnobs = await kit.page.evaluate(() => document.querySelectorAll('[data-part-name="cutoff"] svg').length);
  check('the component opens in the designer, with its knobs drawn', () => assert.ok(designerKnobs >= 1, `${designerKnobs} knob drawings`));
  await kit.page.keyboard.press('Escape');
  await kit.settle(600);

  // --- Real knobs: a cluster of the GAIA sheet ------------------------------------------------------
  const gaiaText = await readFile(join(dirname(fileURLToPath(import.meta.url)), '../../qa/QA-06-roland-gaia.cepanel'), 'utf8');
  const loadCluster = (convert) => kit.page.evaluate(async ({ text, convert }) => {
    const { deserializePanel } = await import('/src/CE_Application/stores/panelModel.js');
    const { panels, activePanelId, selectedComponentIds } = await import('/src/CE_Application/stores/panels.js');
    const { planComponentFromSelection } = await import('/src/CE_Application/utils/customComponentFromControls.js');
    const { createComponentFromSelection, measureLabelText } = await import('/src/CE_Application/stores/componentFromSelectionActions.js');
    const { activeControlSet } = await import('/src/CE_Application/stores/controlSets.js');
    const source = deserializePanel(text, 'gaia.cepanel', 'qa');
    const currentSet = (() => { let v; activeControlSet.subscribe((x) => { v = x; })(); return v; })();
    const rect = (c) => c._children.Transform;
    const inside = (c, box) => rect(c).x >= box.x && rect(c).y >= box.y && rect(c).x + rect(c).width <= box.x + box.width && rect(c).y + rect(c).height <= box.y + box.height;
    const isKnob = (c) => ['Knob', 'Slider'].includes(c._children.Core.controlType);
    // The first knob with company: everything inside a box round it, trimmed by the command's own
    // refusals until it accepts, keeping clusters of at least three knobs.
    let ids = [];
    for (const seed of source.controls.filter(isKnob)) {
      const t = rect(seed);
      const box = { x: t.x - 150, y: t.y - 60, width: t.width + 300, height: t.height + 120 };
      ids = source.controls.filter((c) => inside(c, box)).map((c) => c._children.Core.id);
      for (let round = 0; round < 20; round += 1) {
        const plan = planComponentFromSelection(source, ids, { name: 'GAIA', set: currentSet, measure: measureLabelText });
        if (plan.ok) break;
        const drop = new Set(plan.refused.map((entry) => entry.id).filter((id) => ids.includes(id)));
        if (!drop.size) { ids = []; break; }
        ids = ids.filter((id) => !drop.has(id));
      }
      if (ids.filter((id) => isKnob(source.controls.find((c) => c._children.Core.id === id))).length >= 3) break;
      ids = [];
    }
    const chosen = source.controls.filter((c) => ids.includes(c._children.Core.id));
    const minX = Math.min(...chosen.map((c) => rect(c).x));
    const minY = Math.min(...chosen.map((c) => rect(c).y));
    for (const c of chosen) { c._children.Transform.x += 40 - minX; c._children.Transform.y += 40 - minY; }
    const width = Math.max(...chosen.map((c) => rect(c).x + rect(c).width)) + 40;
    const height = Math.max(...chosen.map((c) => rect(c).y + rect(c).height)) + 40;
    // Into the fresh panel the kit just made, keeping its id: the GAIA panel's settings, these controls.
    const get = (store) => { let v; store.subscribe((x) => { v = x; })(); return v; };
    const id = get(activePanelId);
    panels.update((list) => list.map((p) => (p.id === id
      ? { ...source, id, name: p.name, filePath: '', controls: chosen, width, height, exportParameters: [], parameterSnapshots: [] }
      : p)));
    const knobs = chosen.filter(isKnob).map((c) => ({ id: c._children.Core.id, name: c._children.Core.name, ...rect(c) }));
    const bounds = { x: 40, y: 40, width: width - 80, height: height - 80 };
    let made = null;
    if (convert) {
      selectedComponentIds.set(new Set(ids));
      const result = createComponentFromSelection('GAIA cluster');
      made = { ok: result.ok, refused: result.refused ?? [], id: result.instance?._children?.Core?.id ?? '' };
    }
    return { count: ids.length, knobs, bounds, made };
  }, { text: gaiaText, convert });

  const clusterRects = async (cluster, anchorId) => {
    const first = cluster.knobs[0];
    let base;
    let zoom;
    if (anchorId) {
      const box = await kit.box(anchorId);
      zoom = box.w / cluster.bounds.width;
      base = { x: box.x - cluster.bounds.x * zoom, y: box.y - cluster.bounds.y * zoom };
    } else {
      const box = await kit.box(first.id);
      zoom = box.w / first.width;
      base = { x: box.x - first.x * zoom, y: box.y - first.y * zoom };
    }
    const place = (r) => ({ x: base.x + r.x * zoom, y: base.y + r.y * zoom, w: r.width * zoom, h: r.height * zoom });
    return { knobs: cluster.knobs.map(place), all: place(cluster.bounds) };
  };
  const clusterGestures = async (rects) => {
    const shots = {};
    const away = { x: rects.all.x + rects.all.w + 120, y: rects.all.y + rects.all.h + 60 };
    await kit.page.mouse.move(away.x, away.y);
    await kit.settle(500);
    shots.rest = await shot(rects.all);
    const [a, b] = rects.knobs;
    await kit.page.mouse.move(...Object.values(at(a, 0.5, 0.5)));
    await kit.settle(400);
    shots.hover = await shot(rects.all);
    await gesture([at(a, 0.5, 0.5), at(a, 0.5, -1), at(a, 0.5, -3), at(a, 0.5, -2.2)]);
    await gesture([at(b, 0.5, 0.5), at(b, 0.5, 2), at(b, 0.5, 4), at(b, 0.5, 3)]);
    await kit.page.mouse.move(...Object.values(at(b, 0.5, 0.5)));
    await kit.page.mouse.wheel(0, -100);
    await kit.settle(200);
    await kit.page.mouse.move(away.x, away.y);
    await kit.settle(500);
    shots.moved = await shot(rects.all);
    return shots;
  };

  await kit.fresh();
  await kit.preview(false);
  const gaiaA = await loadCluster(false);
  await kit.settle(600);
  await kit.preview(true);
  await kit.settle(900);
  const gaiaBeforeShots = await clusterGestures(await clusterRects(gaiaA, null));
  const gaiaBefore = [];
  for (const knob of gaiaA.knobs) {
    const session = await kit.session(knob.id);
    gaiaBefore.push(session?.valueOverrideEnabled ? session.valueOverride : null);
  }
  await kit.preview(false);
  await kit.fresh();
  const gaiaB = await loadCluster(true);
  await kit.settle(600);
  check(`GAIA: a cluster of ${gaiaB.count} controls, ${gaiaB.knobs.length} of them knobs, becomes one component`, () => {
    assert.ok(gaiaB.knobs.length >= 3);
    assert.equal(gaiaB.made?.ok, true, JSON.stringify(gaiaB.made?.refused));
  });
  await kit.preview(true);
  await kit.settle(900);
  const gaiaAfterShots = await clusterGestures(await clusterRects(gaiaB, gaiaB.made.id));
  const gaiaSession = await kit.session(gaiaB.made.id);
  const channelOf = await kit.page.evaluate(async (id) => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const panel = get(panels).find((p) => p.id === get(activePanelId));
    const control = panel.controls.find((c) => c._children.Core.id === id);
    return Object.fromEntries(Object.entries(control._children.Core.hostParameters)
      .map(([channel, entry]) => [channel, { ...entry, defaultValue: control._children.ValueChannels._children[channel]?.defaultValue }]));
  }, gaiaB.made.id);
  const channelFor = (knob) => Object.entries(channelOf).find(([, entry]) => entry.id === `${knob.name}.value`);
  const gaiaAfter = gaiaB.knobs.map((knob) => gaiaSession?.customValues?.[channelFor(knob)?.[0]] ?? null);
  check('GAIA: the gestures leave every knob at the value the panel knob reached', () => {
    assert.ok(gaiaBefore.slice(0, 2).every((value) => value !== null), JSON.stringify(gaiaBefore));
    gaiaBefore.forEach((value, i) => {
      // An untouched panel knob has no override and shows its default; a component's session holds
      // every channel, seeded with that same default.
      const fallback = channelFor(gaiaB.knobs[i])?.[1]?.defaultValue;
      if (value === null) assert.ok(gaiaAfter[i] === null || gaiaAfter[i] === fallback, `${gaiaA.knobs[i].name} was never touched: ${gaiaAfter[i]} against its default ${fallback}`);
      else assert.ok(Math.abs(gaiaAfter[i] - value) < 1e-9, `${gaiaA.knobs[i].name}: ${gaiaAfter[i]} against ${value}`);
    });
  });
  for (const label of ['rest', 'hover', 'moved']) {
    const diff = await compare(gaiaBeforeShots[label], gaiaAfterShots[label], `gaia-${label}`);
    console.log(`      GAIA ${label}: ${diff.bad} of ${diff.total} pixels differ`);
    check(`GAIA ${label}: the component draws what the panel drew`, () => {
      assert.deepEqual(diff.size.slice(0, 2), diff.size.slice(2), 'same size');
      assert.equal(diff.bad, 0, `see dist-scenery/knobs-gaia-${label}-diff.png`);
    });
  }

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('knobs from selection: all checks passed');
