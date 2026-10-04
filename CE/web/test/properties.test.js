// properties.test.js — property-based tests (fast-check) for the code where a hand-picked example is
// weakest: the save/load round trip, the format migrations, and the rotation maths.
//
// Each property below runs a few hundred generated cases. A failure prints the smallest case
// fast-check could shrink it to, and a seed: `fc.assert(..., { seed, path })` replays it exactly.
//
// Why these three. The round trip stores each control as a diff against its type's defaults
// (stores/documentShape.js), and every example test so far edits one field at a time; a value that
// happens to equal a default, a section removed and a field changed in the same control, or an
// edit that lands on a nested default are the cases worth generating. The migration renames
// controls and every reference to them, which is exactly the kind of rewrite where a collision or a
// case-folding slip hides from examples. The rotation maths feeds every drag on the canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import { COMPONENT_TYPES, createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { migratePanelDocument, PANEL_FORMAT_VERSION, validatePanelDocument } from '../src/CE_Application/utils/panelFormat.js';
import {
  computeOrbitedTransform, normalizeRotation, orbitPointAround, rotatedRectBounds,
} from '../src/CE_Application/utils/transformMath.js';

const RUNS = Number(process.env.CE_PROPERTY_RUNS ?? 150);
const clone = (value) => JSON.parse(JSON.stringify(value));

// --- Save and load ---------------------------------------------------------------------------------

/** Every leaf of a control that holds a plain value, as [path, value]. */
function leaves(node, path = [], out = []) {
  if (Array.isArray(node)) return out;   // arrays are replaced whole; their items are not leaves here
  if (!node || typeof node !== 'object') {
    out.push([path, node]);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    // Core is identity (id, name, the layer it sits on) — edited through its own paths, and a random
    // layer name would be a document the loader rightly repairs, not a round-trip failure.
    if (key === '_type' || (path.length === 0 && key === 'Core')) continue;
    leaves(value, [...path, key], out);
  }
  return out;
}

function setAt(root, path, value) {
  let node = root;
  for (const key of path.slice(0, -1)) node = node[key];
  node[path.at(-1)] = value;
}

/** A new value of the same kind as `value`, or null when there is nothing sensible to generate. */
const replacementFor = (value) => {
  if (typeof value === 'boolean') return fc.boolean();
  // Not -0: JSON has no negative zero, so a saved -0 loads as 0 and the round-trip below would
  // fail on a value no editor control ever produces (seen once in CI, seed 1952628918).
  if (typeof value === 'number') return fc.oneof(fc.integer({ min: -500, max: 5000 }), fc.double({ min: -1e4, max: 1e4, noNaN: true }).map((v) => (v === 0 ? 0 : v)));
  if (typeof value === 'string') return fc.string({ maxLength: 12 });
  return null;
};

const TYPES = Object.keys(COMPONENT_TYPES);

/** A control of a random type with random edits: values changed, and sometimes sections removed. */
const editedControl = fc.constantFrom(...TYPES).chain((type) => {
  const base = createControl(type, { Core: { id: `c_${type}` } });
  const editable = leaves(base._children).filter(([, value]) => replacementFor(value));
  const sections = Object.keys(base._children).filter((name) => name !== 'Core');
  const edit = editable.length
    ? fc.integer({ min: 0, max: editable.length - 1 }).chain((i) => replacementFor(editable[i][1]).map((value) => ({ path: editable[i][0], value })))
    : fc.constant(null);
  return fc.record({
    edits: fc.array(edit, { maxLength: 8 }),
    removed: fc.subarray(sections, { maxLength: 2 }),
  }).map(({ edits, removed }) => {
    const control = clone(base);
    for (const change of edits) if (change) setAt(control._children, change.path, change.value);
    for (const name of removed) delete control._children[name];
    return control;
  });
});

test('a control with any edits comes back from save and load exactly as it went in', () => {
  fc.assert(fc.property(editedControl, (control) => {
    const panel = createPanel('property');
    panel.controls = [control];
    const loaded = deserializePanel(serializePanel(panel), null, 'property');
    assert.ok(loaded, 'the saved document must open');
    assert.deepEqual(loaded.controls[0], control);
  }), { numRuns: RUNS });
});

// Byte-identical from the SECOND save on, not the first: a control built in the editor keeps the key
// order it was built with, and one that has been through a load has its type's default order (found
// by this property — `Corners: { linked, radius }` came back `{ radius, linked }`). Same content,
// one reordering on the first re-save of a new document, stable after that.
test('saving is stable: same content after a load, byte-identical from then on', () => {
  fc.assert(fc.property(fc.array(editedControl, { minLength: 1, maxLength: 3 }), (controls) => {
    const panel = createPanel('twice');
    panel.controls = controls.map((control, i) => ({ ...control, _children: { ...control._children, Core: { ...control._children.Core, id: `c${i}` } } }));
    const once = serializePanel(panel);
    const twice = serializePanel(deserializePanel(once, null, 'twice'));
    const thrice = serializePanel(deserializePanel(twice, null, 'twice'));
    assert.deepEqual(JSON.parse(twice), JSON.parse(once));
    assert.equal(thrice, twice);
  }), { numRuns: Math.ceil(RUNS / 3) });
});

// --- The format migration --------------------------------------------------------------------------

const segment = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,5}$/);
const controlName = fc.oneof(
  fc.array(segment, { minLength: 2, maxLength: 3 }).map((parts) => parts.join('.')),   // dotted, as old panels had
  fc.array(segment, { minLength: 1, maxLength: 3 }).map((parts) => parts.join('_')),   // already fine
);

const oldDocument = fc.uniqueArray(controlName, { minLength: 1, maxLength: 6, selector: (name) => name.toLowerCase() })
  .chain((names) => fc.record({
    names: fc.constant(names),
    targets: fc.array(fc.constantFrom(...names), { maxLength: 4 }),
  }))
  .map(({ names, targets }) => ({
    controls: names.map((name, i) => ({ _type: 'Knob', _children: { Core: { id: `k${i}`, name } } })),
    scripts: targets.map((target, i) => ({ id: `s${i}`, language: 'lua', source: '', target })),
  }));

test('after migrating, no control name has a dot, names stay distinct, and every reference follows its control', () => {
  fc.assert(fc.property(oldDocument, (doc) => {
    const { doc: migrated, toVersion } = migratePanelDocument(doc);
    assert.equal(toVersion, PANEL_FORMAT_VERSION);
    const names = migrated.controls.map((c) => c._children.Core.name);
    assert.ok(names.every((name) => !name.includes('.')), names.join(', '));
    assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length, `names collided: ${names.join(', ')}`);
    // Each script still points at the control it pointed at before, whatever that control is called now.
    const byId = new Map(doc.controls.map((c, i) => [c._children.Core.name, migrated.controls[i]._children.Core.name]));
    migrated.scripts.forEach((script, i) => assert.equal(script.target, byId.get(doc.scripts[i].target)));
    assert.equal(validatePanelDocument(migrated).ok, true);
  }), { numRuns: RUNS });
});

test('migrating is done once: a migrated document stamped current is left alone', () => {
  fc.assert(fc.property(oldDocument, (doc) => {
    const once = migratePanelDocument(doc).doc;
    const stamped = { ...once, formatVersion: PANEL_FORMAT_VERSION };
    const twice = migratePanelDocument(stamped);
    assert.equal(twice.doc, stamped);
    assert.deepEqual(twice.applied, []);
  }), { numRuns: RUNS });
});

// --- Rotation ---------------------------------------------------------------------------------------

const coordinate = fc.double({ min: -2000, max: 2000, noNaN: true });
const size = fc.double({ min: 0, max: 1000, noNaN: true });
const angle = fc.double({ min: -1080, max: 1080, noNaN: true });
const rect = fc.record({ x: coordinate, y: coordinate, w: size, h: size });

test('orbiting a point there and back returns it', () => {
  fc.assert(fc.property(coordinate, coordinate, coordinate, coordinate, angle, (x, y, cx, cy, deg) => {
    const out = orbitPointAround(x, y, cx, cy, deg);
    const back = orbitPointAround(out.x, out.y, cx, cy, -deg);
    assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6, JSON.stringify({ x, y, back }));
    // and it stays on its circle
    assert.ok(Math.abs(Math.hypot(out.x - cx, out.y - cy) - Math.hypot(x - cx, y - cy)) < 1e-6);
  }), { numRuns: RUNS });
});

test('a rotated box\'s bounds hold all four drawn corners, and keep its centre', () => {
  fc.assert(fc.property(rect, angle, (box, deg) => {
    const bounds = rotatedRectBounds(box, deg);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    // Under 0.001° rotatedRectBounds treats the box as unturned, on purpose (a drag that ends a hair
    // off zero is zero); the corners then move by up to size × 0.001°. fast-check found it.
    const slack = 1e-5 + (Math.abs(deg % 360) < 0.001 ? (box.w + box.h) * 2e-5 : 0);
    for (const [px, py] of [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]]) {
      const p = orbitPointAround(px, py, cx, cy, deg % 360);
      assert.ok(p.x >= bounds.x - slack && p.x <= bounds.x + bounds.w + slack, `x ${p.x} outside ${JSON.stringify(bounds)}`);
      assert.ok(p.y >= bounds.y - slack && p.y <= bounds.y + bounds.h + slack, `y ${p.y} outside ${JSON.stringify(bounds)}`);
    }
    assert.ok(Math.abs(bounds.x + bounds.w / 2 - cx) < 1e-4 && Math.abs(bounds.y + bounds.h / 2 - cy) < 1e-4);
  }), { numRuns: RUNS });
});

test('a normalised rotation is in [0, 360), and normalising again changes nothing', () => {
  fc.assert(fc.property(angle, (deg) => {
    const once = normalizeRotation(deg);
    assert.ok(once >= 0 && once <= 360, String(once));
    assert.equal(normalizeRotation(once), once === 360 ? 0 : once);
  }), { numRuns: RUNS });
});

test('a group turn keeps each member\'s size and distance from the centre', () => {
  fc.assert(fc.property(rect, angle, coordinate, coordinate, angle, (box, own, cx, cy, delta) => {
    const out = computeOrbitedTransform(box, own, cx, cy, delta);
    const before = Math.hypot(box.x + box.w / 2 - cx, box.y + box.h / 2 - cy);
    const after = Math.hypot(out.x + box.w / 2 - cx, out.y + box.h / 2 - cy);
    assert.ok(Math.abs(after - before) < 1e-6);
    assert.equal(out.rotation, normalizeRotation(own + delta));
  }), { numRuns: RUNS });
});
