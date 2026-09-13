/**
 * behaviourCustom.mjs — deep behavioural pass over the fourteen custom-component starters and the
 * authoring surface they are built from.
 *
 * A packaged component is several controls in a trench coat: parts positioned in percent, value
 * channels, hit zones that may be circles or rings or generated at run time, behaviour modules,
 * bindings that drive a part's geometry from a channel, links that route one channel into another,
 * and a published input/output surface. None of that is visible to a check that mounts the thing
 * and looks for pixels.
 *
 * So this is DISCOVERY-DRIVEN: it reads each starter's own declarations and then exercises them.
 * Every hit zone a starter declares is located by asking the app what is under the pointer, pressed
 * for real, and asserted to move the channel it names. Nothing here hardcodes a layout.
 *
 * Run: node browser-checks/behaviourCustom.mjs
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('custom');
const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);

/** Build a CustomComponent and apply a starter to it, the way the design surface does. */
const makeStarter = async (starterId) => {
  const id = await kit.make('CustomComponent', {});
  await kit.page.evaluate(async ({ id, starterId }) => {
    const { createCustomComponentStarterPatch } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    applyControlPatch(id, createCustomComponentStarterPatch(starterId));
  }, { id, starterId });
  await kit.settle(160);
  return id;
};

/** What a starter declares, read off the live control rather than off this file. */
const declared = (id) => kit.page.evaluate(async ({ id }) => {
  const ci = await import('/src/CE_Application/utils/customComponentInteraction.js');
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  const live = get(panels).find((p) => p.id === get(activePanelId));
  const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
  if (!c) return null;
  const zones = ci.getCustomHitZones(c) ?? {};
  const channels = ci.getCustomValueChannels(c) ?? {};
  const links = ci.getCustomLinks(c) ?? {};
  const parts = c._children?.Parts?._children ?? {};
  const bindings = c._children?.Bindings?._children ?? {};
  const generators = c._children?.Generators?._children ?? {};
  const published = c._children?.PublishedProperties ?? {};
  return {
    name: c._children?.Core?.name ?? '',
    parts: Object.keys(parts),
    zones: Object.entries(zones).map(([name, z]) => ({
      name, behavior: z?.targetBehavior ?? '', channel: z?.targetValueChannel ?? '', action: z?.action ?? '' })),
    channels: Object.keys(channels),
    bindings: Object.entries(bindings).map(([name, b]) => ({ name, source: b?.source ?? '', target: b?.target ?? '' })),
    links: Object.keys(links),
    generators: Object.keys(generators),
    outputs: Object.keys(published?.outputs ?? {}),
    inputs: Object.keys(published?.inputs ?? {}),
  };
}, { id });

const values = async (id) => (await kit.session(id))?.customValues ?? {};

/**
 * Where each hit zone actually is, by asking the app.
 * The preview surface writes `hoveredCustomHitZone` as the pointer moves, so hovering a grid and
 * reading it back locates authored zones, circular and ring-shaped ones, and the ones a generator
 * invents at run time — all by the same mechanism, with this file knowing none of their shapes.
 */
const locateZones = async (id) => {
  const box = await kit.box(id);
  const found = new Map();
  for (let iy = 1; iy < 12; iy += 1) {
    for (let ix = 1; ix < 12; ix += 1) {
      const x = box.x + (box.w * ix) / 12;
      const y = box.y + (box.h * iy) / 12;
      await kit.page.mouse.move(x, y);
      const name = (await kit.session(id))?.hoveredCustomHitZone ?? '';
      if (name && !found.has(name)) found.set(name, { x, y });
    }
  }
  return found;
};

try {
  await kit.fresh();
  await kit.preview(true);

  // =============================================================================================
  // EVERY STARTER: its declared parts are drawn, and every hit zone it declares actually works.
  // =============================================================================================
  const starters = await kit.page.evaluate(async () => {
    const { CUSTOM_COMPONENT_STARTERS } = await import('/src/CE_Application/utils/customComponentFactory.js');
    return CUSTOM_COMPONENT_STARTERS.map((s) => ({ id: s.id, label: s.label }));
  });
  led.check('Starters', 'catalogue', 'the factory offers fourteen starters', 14, starters.length);

  const noZones = [];
  const deadZones = [];
  const undrawn = [];
  for (const starter of starters) {
    await kit.fresh();
    await kit.preview(true);
    const id = await makeStarter(starter.id);
    const spec = await declared(id);
    assert.ok(spec, `${starter.label}: no control after applying the starter`);

    // Its parts are DRAWN — each declared part present as a positioned element with real size.
    const drawn = await kit.dom(id, '.interactive-part');
    const sized = drawn.filter((d) => d.w > 0 && d.h > 0);
    if (sized.length < spec.parts.length) {
      undrawn.push(`${starter.label}: ${spec.parts.length} parts declared, ${sized.length} drawn with size`);
    }

    // Every hit zone it declares must (a) be findable on screen and (b) move its own channel.
    if (!spec.zones.length) { noZones.push(starter.label); continue; }
    const located = await locateZones(id);
    for (const zone of spec.zones) {
      const at = located.get(zone.name);
      if (!at) { deadZones.push(`${starter.label}/${zone.name}: the app reports it nowhere on the control`); continue; }
      const before = r3((await values(id))[zone.channel]);
      const box = await kit.box(id);
      // A press for the click-like zones, a drag for the value-like ones: run both and accept
      // either, because which one a zone wants is the zone's business, not this file's.
      await kit.click(at);
      let after = r3((await values(id))[zone.channel]);
      if (after === before) {
        await kit.drag(at, { x: Math.min(box.x + box.w - 4, at.x + box.w * 0.3), y: at.y });
        after = r3((await values(id))[zone.channel]);
      }
      if (after === before) {
        await kit.drag(at, { x: at.x, y: Math.max(box.y + 4, at.y - box.h * 0.3) });
        after = r3((await values(id))[zone.channel]);
      }
      if (after === before) {
        deadZones.push(`${starter.label}/${zone.name} → ${zone.channel}: press and both drags left it at ${before}`);
      }
    }
  }
  led.check('Starters', 'parts are drawn', 'every part each starter declares is rendered with a real size',
    [], undrawn);
  led.check('Starters', 'hit zones respond', 'every hit zone every starter declares moves the channel it names',
    [], deadZones);
  if (noZones.length) {
    led.unverified('Starters', 'hit zones (display-only starters)',
      'these declare no hit zone at all — they are the display class, driven by bindings from public inputs',
      noZones.join(', '));
  }


  // =============================================================================================
  // THE AUTHORING SURFACE — bindings, links, generators, published properties, export/import and
  // persistence, on the starters that declare each of them.
  // =============================================================================================

  // --- BINDINGS: a value channel drives a part's geometry ----------------------------------------
  // The Dual Slider Switch binds channel.valueA.normalized → Parts.handleA.Layout.x over the range
  // 12%..68%. So the handle must be DRAWN at those two places at the two extremes, and nowhere near
  // them in between. The handle is found by its own colour, which is the only thing that identifies
  // it in the DOM.
  await kit.fresh();
  await kit.preview(true);
  {
    const B = 'Bindings';
    const id = await makeStarter('starter.dualSliderSwitch');
    // The part's colour lands on its child `.interactive-simple-background`, not on the
    // `.interactive-part` wrapper — which is transparent. Looking at the wrapper finds nothing and
    // reports a working binding as absent.
    const painted = (name) => kit.dom(id, '.interactive-simple-background').then((list) => list.find((d) => d.bg === name));
    const handleA = async () => {
      const box = await kit.box(id);
      const h = await painted('rgb(234, 246, 255)');
      return h ? Math.round(((h.x + h.w / 2) / box.w) * 1000) / 10 : null;   // centre, % of control
    };
    const setChannel = (name, value) => kit.page.evaluate(async ({ id, name, value }) => {
      const { updatePanelPreviewSession } = await import('/src/CE_Application/stores/interactionPreview.js');
      updatePanelPreviewSession(id, { customValues: { [name]: value } });
    }, { id, name, value });

    await setChannel('valueA', 0);
    await kit.settle(140);
    const low = await handleA();
    await setChannel('valueA', 1);
    await kit.settle(140);
    const high = await handleA();
    await setChannel('valueA', 0.5);
    await kit.settle(140);
    const mid = await handleA();
    led.check(B, 'binding output range', 'the bound handle is drawn at the declared 12% and 68% of the control at the extremes',
      [12, 68], [low, high], (a, b) => Math.abs(a[0] - b[0]) <= 1.5 && Math.abs(a[1] - b[1]) <= 1.5);
    led.check(B, 'binding is continuous', 'and half way along at half the value', 40, mid, (a, b) => Math.abs(a - b) <= 2);
    // Slider B's handle must be exactly where it started: a binding that moved both would satisfy
    // every assertion above.
    const handleB = async () => {
      const box = await kit.box(id);
      const h = await painted('rgb(255, 237, 179)');
      return h ? Math.round(((h.x + h.w / 2) / box.w) * 1000) / 10 : null;
    };
    const bAt = await handleB();
    await setChannel('valueA', 0);
    await kit.settle(140);
    led.check(B, 'binding drives only its own part', 'moving slider A leaves slider B exactly where it was',
      bAt, await handleB());
    await setChannel('valueA', 0.5);
    await kit.settle(140);

    // --- LINKS: a switch routes one of two channels into the output ------------------------------
    const L = 'Links';
    const mainValue = (over) => kit.page.evaluate(async ({ id, over }) => {
      const ci = await import('/src/CE_Application/utils/customComponentInteraction.js');
      const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const live = get(panels).find((p) => p.id === get(activePanelId));
      const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
      const seeded = { ...ci.seedCustomValues(c), ...over };
      return ci.applyCustomLinks(c, seeded).values.mainValue;
    }, { id, over });
    led.check(L, 'switch link (mode A)', 'the active-value route sends slider A to the output while the mode is A',
      0.3, r3(await mainValue({ mode: 'A', valueA: 0.3, valueB: 0.9 })));
    led.check(L, 'switch link (mode B)', 'and slider B once the mode switches',
      0.9, r3(await mainValue({ mode: 'B', valueA: 0.3, valueB: 0.9 })));
    led.check(L, 'switch link (follows the channel)', 'changing the routed channel changes the output',
      0.25, r3(await mainValue({ mode: 'B', valueA: 0.3, valueB: 0.25 })));

    // --- PUBLISHED PROPERTIES: what the component offers the outside world ------------------------
    const P = 'PublishedProperties';
    const spec = await declared(id);
    led.check(P, 'outputs', 'every value channel is published as an output a panel can bind',
      ['valueA', 'valueB', 'mode', 'mainValue'].sort(),
      spec.outputs.slice().sort(), (a, b) => a.every((k) => b.includes(k)));
    led.check(P, 'inputs', 'and as an input it can be driven through',
      true, spec.inputs.includes('valueA') && spec.inputs.includes('mode'));
    led.check(P, 'editableProperties', 'the author-facing label is exposed as an editable property',
      true, await kit.page.evaluate(async ({ id }) => {
        const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
        const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
        const live = get(panels).find((p) => p.id === get(activePanelId));
        const c = (live?.controls ?? []).find((x) => x._children.Core.id === id);
        const ep = c?._children?.PublishedProperties?.editableProperties ?? {};
        return Object.keys(ep).length > 0 && !!ep.label?.path;
      }, { id }));

    // --- EXPORT / IMPORT: a package round-trip keeps the component intact ---------------------------
    const X = 'Export/import';
    const beforeDrawing = await kit.dom(id, '.interactive-part');
    const reimported = await kit.page.evaluate(async ({ id }) => {
      const cp = await import('/src/CE_Application/utils/customComponentPackage.js');
      const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
      const { addCustomComponentPackage } = await import('/src/CE_Application/stores/controls.js');
      const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
      const flat = (cs, out = []) => { for (const c of cs ?? []) out.push(c); return out; };
      const live = get(panels).find((p) => p.id === get(activePanelId));
      const c = flat(live?.controls ?? []).find((x) => x._children.Core.id === id);
      // Through JSON, the way a package actually travels between installs.
      const envelope = JSON.parse(JSON.stringify(cp.createCustomComponentExportEnvelope(c, {})));
      const before = new Set(flat(get(panels).flatMap((p) => p.controls ?? [])).map((x) => x._children.Core.id));
      addCustomComponentPackage(envelope);
      const made = flat(get(panels).flatMap((p) => p.controls ?? [])).find((x) => !before.has(x._children.Core.id));
      return made ? made._children.Core.id : '';
    }, { id });
    assert.ok(reimported, 'the exported package did not come back in');
    await kit.settle(200);
    const afterDrawing = await kit.dom(reimported, '.interactive-part');
    led.check(X, 'package round trip (drawing)', 'an exported and reimported component draws exactly the same parts',
      JSON.stringify(beforeDrawing.map((d) => [d.w, d.h, d.bg])),
      JSON.stringify(afterDrawing.map((d) => [d.w, d.h, d.bg])));
    // …and it still WORKS, which the drawing cannot show.
    const zones = await locateZones(reimported);
    const modeAt = zones.get('switchModeZone');
    assert.ok(modeAt, 'the reimported component has no mode button');
    const beforeMode = (await values(reimported)).mode;
    await kit.click(modeAt);
    led.check(X, 'package round trip (still interactive)', 'and its mode button still cycles after the round trip',
      true, (await values(reimported)).mode !== beforeMode);

    // --- PERSISTENCE: save the panel, reopen it, and use it again ------------------------------------
    const S = 'Persistence';
    const beforeSave = await kit.dom(id, '.interactive-part');
    const again = await kit.reopen(id);
    led.check(S, 'save/reopen (drawing)', 'a reopened custom component draws the same parts',
      JSON.stringify(beforeSave.map((d) => [d.x, d.y, d.w, d.h, d.bg])),
      JSON.stringify((await kit.dom(again, '.interactive-part')).map((d) => [d.x, d.y, d.w, d.h, d.bg])));
    const zones2 = await locateZones(again);
    const sliderAt = zones2.get('sliderAZone');
    assert.ok(sliderAt, 'the reopened component has no slider zone');
    const beforeA = r3((await values(again)).valueA);
    const box2 = await kit.box(again);
    await kit.drag(sliderAt, { x: box2.x + box2.w * 0.12, y: sliderAt.y });
    led.check(S, 'save/reopen (still interactive)', 'and its slider still moves under the pointer',
      true, r3((await values(again)).valueA) !== beforeA);
  }

  // --- GENERATORS: parts and hit zones invented at run time ------------------------------------------
  await kit.fresh();
  await kit.preview(true);
  {
    const G = 'Generators';
    const tabs = await makeStarter('starter.tabGroup');
    const tabZones = await locateZones(tabs);
    led.check(G, 'repeated-buttons (count)', 'the tab bank generates one hit zone per tab',
      3, [...tabZones.keys()].filter((n) => /tab/i.test(n)).length);
    const tabBefore = (await values(tabs)).tab;
    let tabAfter = tabBefore;
    for (const [, at] of tabZones) {
      await kit.click(at);
      tabAfter = (await values(tabs)).tab;
      if (tabAfter !== tabBefore) break;
    }
    led.check(G, 'repeated-buttons (drives its channel)', 'pressing a generated tab moves the enum channel',
      true, tabAfter !== tabBefore);

    const piano = await makeStarter('starter.scrollPianoBar');
    const pianoZones = await locateZones(piano);
    const keyZones = [...pianoZones.keys()].filter((n) => /keyZone/.test(n));
    led.check(G, 'piano-keys (generated zones)', 'the keybed generates its own playable zones',
      true, keyZones.length >= 8);
    led.check(G, 'piano-keys (bounded)', 'and they leave the scroll strip reachable, which is what generator bounds are for',
      true, pianoZones.has('scrollArea'));
    const noteBefore = (await values(piano)).note;
    await kit.click(pianoZones.get(keyZones[0]));
    led.check(G, 'piano-keys (drives its channel)', 'pressing a generated key moves the note channel',
      true, (await values(piano)).note !== noteBefore);
  }

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
