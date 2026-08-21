// sceneryModel.test.js — which controls are safe to stop being controls.
//
// The fold is a rendering optimisation with a rendering bug for a failure mode: a control wrongly
// called scenery is frozen, and a frozen control that was supposed to move looks like a control
// that works until the moment it doesn't. So the tests here are mostly about the NO direction —
// what must never be folded — and about the two things that decide it: the section list a component
// type declares, and whether folding a control would move it in z-order.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isScenery,
  isSceneryType,
  planSceneryFold,
  sceneryFingerprint,
  sceneryHoldSet,
  sceneryTypes,
} from '../src/CE_Application/utils/sceneryModel.js';
import { COMPONENT_TYPES, createControl } from '../src/CE_Application/models/componentTypes.js';
import { sortControlsForRender } from '../src/CE_Application/utils/controlOrder.js';
import { expandControl } from '../src/CE_Application/stores/documentShape.js';
import { readText } from './support/readText.mjs';
import { fileURLToPath } from 'node:url';

const at = (control, x, y, width, height) => {
  Object.assign(control._children.Transform, { x, y, width, height });
  return control;
};

test('scenery is read off the component type, and only four types qualify', () => {
  // Not a hardcoded list — the module asks COMPONENT_TYPES which sections each type declares. This
  // pins the answer so that a type GAINING behaviour is a failing test rather than a silent fold.
  assert.deepEqual(sceneryTypes(), ['Background', 'Image', 'Label', 'TestBox']);
});

test('the sections a scenery type may declare are all inert', () => {
  // The ratchet that makes the derivation trustworthy. DYNAMIC_SECTIONS is a judgement call written
  // down once; if someone adds a section to Label, it lands here and has to be classified rather
  // than defaulting to inert. Add the section to this list only after deciding it cannot change.
  const declared = new Set();
  for (const type of sceneryTypes()) for (const s of COMPONENT_TYPES[type].sections) declared.add(s);
  assert.deepEqual([...declared].sort(), ['Background', 'ContentLayout', 'Effects', 'Icon', 'Text']);
});

test('nothing that can be bound, clicked, valued or scripted is scenery', () => {
  for (const type of ['Knob', 'Slider', 'ToggleButton', 'Combobox', 'Listbox', 'TextInput',
                      'CustomComponent', 'Meter', 'Envelope', 'Transport', 'Container', 'Group']) {
    assert.equal(isSceneryType(type), false, `${type} was treated as scenery`);
  }
});

test('an unknown type is not scenery', () => {
  // A panel from a newer version, or a hand-edited one. Nothing is known about it, so it stays live.
  assert.equal(isSceneryType('SomethingFromTheFuture'), false);
  assert.equal(isSceneryType(undefined), false);
});

test('a control that grew a section its type never declared is not scenery', () => {
  // expandControl fills a control in from the pristine control of its type, but does not strip
  // whatever else it finds, so the type is not quite the last word.
  const label = createControl('Label', { Core: { id: 'l' } });
  assert.equal(isScenery(label), true);

  label._children.DeviceBindings = { _type: 'DeviceBindings' };
  assert.equal(isScenery(label), false, 'a Label carrying DeviceBindings was folded');
});

test('a control a script has written to is kept out of the ground', () => {
  // Not because folding it would be wrong — a script write goes through the document and the ground
  // re-bakes, which sceneryScripts.test.js pins — but because an animation writing it sixty times a
  // second would re-bake the ground sixty times a second. See stores/scriptTouchedControls.js.
  const a = at(createControl('Label', { Core: { id: 'a' } }), 0, 0, 40, 10);
  const b = at(createControl('Label', { Core: { id: 'b' } }), 0, 40, 40, 10);

  assert.deepEqual(planSceneryFold([a, b]).ground.map((c) => c._children.Core.id), ['a', 'b']);

  const { ground, live } = planSceneryFold([a, b], new Set(['a']));
  assert.deepEqual(ground.map((c) => c._children.Core.id), ['b']);
  assert.deepEqual(live.map((c) => c._children.Core.id), ['a']);
});

test('a script-touched control blocks what it covers, exactly as a live one does', () => {
  // It IS a live control now, so the overlap rule has to see it as one: a label printed over it
  // must stay live too, or it would drop behind it.
  const touched = at(createControl('Label', { Core: { id: 'plate' } }), 0, 0, 100, 100);
  const over = at(createControl('Label', { Core: { id: 'over' } }), 10, 10, 40, 10);

  const { ground, live } = planSceneryFold([touched, over], new Set(['plate']));
  assert.deepEqual(ground.map((c) => c._children.Core.id), []);
  assert.deepEqual(live.map((c) => c._children.Core.id), ['plate', 'over']);
});

test('scenery over a live control it overlaps stays live', () => {
  // The whole reason the fold is not just "put every Label at the back". A legend printed on top of
  // the combobox it labels would go behind an opaque background and vanish.
  const knob = at(createControl('Knob', { Core: { id: 'k' } }), 0, 0, 60, 60);
  const over = at(createControl('Label', { Core: { id: 'over' } }), 10, 10, 40, 12);
  const beside = at(createControl('Label', { Core: { id: 'beside' } }), 200, 200, 40, 12);

  const { ground, live } = planSceneryFold([knob, over, beside]);
  assert.deepEqual(ground.map((c) => c._children.Core.id), ['beside']);
  assert.deepEqual(live.map((c) => c._children.Core.id), ['k', 'over']);
});

test('scenery UNDER a live control still folds', () => {
  // It is already behind the knob; moving it further back changes nothing anyone can see.
  const under = at(createControl('Label', { Core: { id: 'under' } }), 10, 10, 40, 12);
  const knob = at(createControl('Knob', { Core: { id: 'k' } }), 0, 0, 60, 60);

  const { ground, live } = planSceneryFold([under, knob]);
  assert.deepEqual(ground.map((c) => c._children.Core.id), ['under']);
  assert.deepEqual(live.map((c) => c._children.Core.id), ['k']);
});

test('scenery over other scenery keeps its order', () => {
  const plate = at(createControl('Background', { Core: { id: 'plate' } }), 0, 0, 100, 100);
  const text = at(createControl('Label', { Core: { id: 'text' } }), 10, 10, 40, 12);

  const { ground, live } = planSceneryFold([plate, text]);
  assert.deepEqual(ground.map((c) => c._children.Core.id), ['plate', 'text'],
    'the ground must paint in the same order the surface would have');
  assert.deepEqual(live, []);
});

test('a held control is drawn over the ground, not removed from it', () => {
  // The ground is cached against its own contents, so a set that shrank every time the pointer
  // crossed a label would re-bake the other 172 on every hover. Membership is the panel's alone.
  const a = at(createControl('Label', { Core: { id: 'a' } }), 0, 0, 40, 12);
  const b = at(createControl('Label', { Core: { id: 'b' } }), 100, 0, 40, 12);
  const { ground } = planSceneryFold([a, b]);

  assert.deepEqual(ground.map((c) => c._children.Core.id), ['a', 'b']);
  assert.equal(sceneryFingerprint(ground), sceneryFingerprint(planSceneryFold([a, b]).ground),
    'the ground changed without the panel changing');

  const { held, heldIds } = sceneryHoldSet(ground, (c) => c._children.Core.id === 'b');
  assert.deepEqual(held.map((c) => c._children.Core.id), ['b']);
  assert.deepEqual([...heldIds], ['b']);
});

test('holding a plate brings the legends printed on it along', () => {
  // The failure this exists for: held controls are drawn OVER the ground, so hoisting a plate on its
  // own would put it in front of its own labels and they would vanish. Anything later in the ground
  // that the set would cover has to come with it.
  const plate = at(createControl('Background', { Core: { id: 'plate' } }), 0, 0, 200, 100);
  const on = at(createControl('Label', { Core: { id: 'on-plate' } }), 10, 10, 60, 14);
  const away = at(createControl('Label', { Core: { id: 'away' } }), 400, 400, 60, 14);
  const { ground } = planSceneryFold([plate, on, away]);

  const { held } = sceneryHoldSet(ground, (c) => c._children.Core.id === 'plate');
  assert.deepEqual(held.map((c) => c._children.Core.id), ['plate', 'on-plate'],
    'the label on the held plate would have been buried under it');
});

test('holding a label does not drag the plate underneath it up too', () => {
  // The closure runs forwards only. A label sits ON the plate, so hoisting the label is safe on its
  // own — the plate is already behind it and stays there.
  const plate = at(createControl('Background', { Core: { id: 'plate' } }), 0, 0, 200, 100);
  const on = at(createControl('Label', { Core: { id: 'on-plate' } }), 10, 10, 60, 14);
  const { ground } = planSceneryFold([plate, on]);

  const { held } = sceneryHoldSet(ground, (c) => c._children.Core.id === 'on-plate');
  assert.deepEqual(held.map((c) => c._children.Core.id), ['on-plate']);
});

test('holding nothing holds nothing', () => {
  const a = at(createControl('Label', { Core: { id: 'a' } }), 0, 0, 40, 12);
  const { ground } = planSceneryFold([a]);
  const { held, heldIds } = sceneryHoldSet(ground, () => false);
  assert.deepEqual(held, []);
  assert.equal(heldIds.size, 0);
});

test('the fingerprint changes when the scenery does, and not when it does not', () => {
  const a = at(createControl('Label', { Core: { id: 'a' }, Text: { content: 'One' } }), 0, 0, 40, 12);
  const b = at(createControl('Label', { Core: { id: 'b' }, Text: { content: 'Two' } }), 60, 0, 40, 12);

  const base = sceneryFingerprint([a, b]);
  assert.equal(sceneryFingerprint([a, b]), base, 'same scenery hashed to two different keys');
  assert.notEqual(sceneryFingerprint([b, a]), base, 'reordering the ground must re-bake it');
  assert.notEqual(sceneryFingerprint([a]), base);

  const edited = at(createControl('Label', { Core: { id: 'a' }, Text: { content: 'Changed' } }), 0, 0, 40, 12);
  assert.notEqual(sceneryFingerprint([edited, b]), base, 'retyping a label did not re-bake it');
});

test('the fold never moves anything, on the real panel', () => {
  // The invariant, asserted against the GAIA rather than a fixture, because the interleaving is the
  // thing fixtures get wrong: its scenery runs three deep before the first live control and then
  // alternates for four hundred more.
  const panel = JSON.parse(readPanel());
  const ordered = sortControlsForRender((panel.controls ?? []).map(expandControl));
  const { ground, live } = planSceneryFold(ordered);

  assert.ok(ground.length > 100, `expected a substantial ground, got ${ground.length}`);
  assert.equal(ground.length + live.length, ordered.length, 'the fold lost or duplicated a control');

  const box = (c) => {
    const t = c._children?.Transform ?? {};
    return { x: +t.x || 0, y: +t.y || 0, w: +t.width || 0, h: +t.height || 0 };
  };
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const liveSet = new Set(live);

  // For every folded control, nothing live that was painted BEFORE it may overlap it — that is
  // precisely the set of controls it would now be behind instead of in front of.
  for (const folded of ground) {
    const index = ordered.indexOf(folded);
    for (let j = 0; j < index; j++) {
      if (!liveSet.has(ordered[j])) continue;
      assert.ok(!hits(box(folded), box(ordered[j])),
        `folding ${folded._children.Core.id} would drop it behind ${ordered[j]._children.Core.id}`);
    }
  }
});

// Kept at the bottom so the test above reads as the assertion it is.
function readPanel() {
  return readText(fileURLToPath(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url)));
}
